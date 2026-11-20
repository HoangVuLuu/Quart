using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NodaTime;
using Npgsql;
using Quart.Modules.Identity.Accounts;
using Quart.Modules.Identity.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Identity;

/// <summary>
/// Entry point of the Identity module: the only things the API host calls.
/// Accounts, sign-in, email verification, password reset and sessions (M2). Two-factor, step-up and Google
/// sign-in are planned (M2-06, M2-08, M2-17) and not built yet.
/// </summary>
public static class IdentityModule
{
    /// <summary>The cookie the web app reads and sends back as the <see cref="AntiforgeryHeader"/> (AD-025).</summary>
    public const string AntiforgeryCookie = "XSRF-TOKEN";
    public const string AntiforgeryHeader = "X-XSRF-TOKEN";

    /// <summary>Needs an <see cref="NpgsqlDataSource"/> (with NodaTime enabled) registered by the host.</summary>
    /// <param name="persistKeys">
    /// False only while the build runs the app to write the OpenAPI document: there is no database then,
    /// so the Data Protection keys must not be looked for in it.
    /// </param>
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, bool persistKeys = true)
    {
        services.AddDbContext<IdentityDb>((provider, options) => Configure(options, provider.GetRequiredService<NpgsqlDataSource>()));
        services.TryAddSingleton<IClock>(NodaTime.SystemClock.Instance);

        services.AddIdentityCore<QuartUser>(options =>
            {
                // FR-003: length only, no forced symbol, digit or case rules.
                options.Password.RequiredLength = AccountRules.MinPasswordLength;
                options.Password.RequireDigit = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireUppercase = false;
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequiredUniqueChars = 1;
                options.User.RequireUniqueEmail = true;
                // FR-007, M2-04: five wrong passwords lock the account for 15 minutes.
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                options.Lockout.AllowedForNewUsers = true;
            })
            .AddEntityFrameworkStores<IdentityDb>();

        // AD-045: the cookie holds a session key only; the ticket lives in the database.
        services.AddSingleton<ITicketStore, SessionTicketStore>();
        services.AddAuthentication(IdentityConstants.ApplicationScheme)
            .AddCookie(IdentityConstants.ApplicationScheme, options =>
            {
                options.Cookie.Name = "quart_session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.ExpireTimeSpan = TimeSpan.FromDays(30);
                options.SlidingExpiration = true;
                // An API answers with a status and a code, never a redirect to a login page.
                options.Events.OnRedirectToLogin = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
            });
        services.AddOptions<CookieAuthenticationOptions>(IdentityConstants.ApplicationScheme)
            .Configure<ITicketStore, IHostEnvironment>((options, store, environment) =>
            {
                options.SessionStore = store;
                // Secure outside Development, where the phone on the same Wi-Fi reaches the app over plain HTTP.
                options.Cookie.SecurePolicy = environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            });

        // AD-045: keys in Postgres, so a scale-to-zero restart keeps people signed in.
        services.AddDataProtection().SetApplicationName("Quart");
        services.AddSingleton<DatabaseKeyRepository>();
        if (persistKeys)
        {
            services.AddOptions<KeyManagementOptions>()
                .Configure<DatabaseKeyRepository>((options, repository) => options.XmlRepository = repository);
        }

        services.AddHttpClient<PwnedPasswordsCheck>(client =>
        {
            client.BaseAddress = new Uri("https://api.pwnedpasswords.com/");
            client.Timeout = TimeSpan.FromSeconds(2);
        });
        // The browser tests (tests/e2e) must not call the real service from CI. Development only: any other
        // environment ignores the setting and always checks.
        services.AddTransient<IBreachedPasswordCheck>(provider =>
            provider.GetRequiredService<IHostEnvironment>().IsDevelopment()
            && provider.GetRequiredService<IConfiguration>().GetValue<bool>(OfflineBreachedPasswordCheck.Setting)
                ? new OfflineBreachedPasswordCheck()
                : provider.GetRequiredService<PwnedPasswordsCheck>());
        services.AddScoped<IUserDirectory, UserDirectory>();
        services.AddScoped<IJobHandler, Accounts.IdentityRetention>();
        services.AddSingleton(new NightlyJob(Accounts.IdentityRetention.JobType));
        services.AddAccountRateLimit();
        return services;
    }

    /// <summary>
    /// Authentication, then anti-forgery (AD-025): every unsafe request under <c>/api</c> must send the
    /// <see cref="AntiforgeryCookie"/> value back in the <see cref="AntiforgeryHeader"/>. Another site can make
    /// the browser send our cookies, but it can neither read that cookie nor set that header.
    /// </summary>
    public static IApplicationBuilder UseIdentityModule(this IApplicationBuilder app)
    {
        app.UseAuthentication();
        app.Use(async (context, next) =>
        {
            if (!context.Request.Path.StartsWithSegments("/api"))
            {
                await next(context);
                return;
            }

            var cookie = context.Request.Cookies[AntiforgeryCookie];
            var method = context.Request.Method;
            var safe = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
            if (!safe)
            {
                var header = context.Request.Headers[AntiforgeryHeader].ToString();
                var matches = !string.IsNullOrEmpty(cookie)
                    && CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(cookie), System.Text.Encoding.UTF8.GetBytes(header));
                if (!matches)
                {
                    await Problems.Of(StatusCodes.Status400BadRequest, ErrorCodes.Antiforgery).ExecuteAsync(context);
                    return;
                }
            }
            else if (string.IsNullOrEmpty(cookie))
            {
                var environment = context.RequestServices.GetRequiredService<IHostEnvironment>();
                context.Response.Cookies.Append(
                    AntiforgeryCookie,
                    WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32)),
                    new CookieOptions
                    {
                        // Readable by the web app's script on purpose; it grants nothing by itself.
                        HttpOnly = false,
                        SameSite = SameSiteMode.Lax,
                        Secure = !environment.IsDevelopment(),
                        Path = "/",
                        MaxAge = TimeSpan.FromDays(30),
                    });
            }
            await next(context);
        });
        return app;
    }

    public static IEndpointRouteBuilder MapIdentityModule(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapAccounts();
        return endpoints;
    }

    /// <summary>
    /// The <c>grant-platform-admin &lt;email&gt;</c> command (M2-09). There is no setting and no screen for
    /// it. Returns false when no verified account has that address.
    /// </summary>
    public static async Task<bool> GrantPlatformAdminAsync(this IServiceProvider services, string email, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
        var normalized = AccountRules.CleanEmail(email).ToUpperInvariant();
        var updated = await db.Users
            .Where(x => x.NormalizedEmail == normalized && x.EmailConfirmed)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.IsPlatformAdmin, true), cancellationToken);
        return updated == 1;
    }

    /// <summary>Applies this module's pending migrations.</summary>
    public static async Task MigrateIdentityModuleAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IdentityDb>().Database.MigrateAsync(cancellationToken);
    }

    internal static void Configure(DbContextOptionsBuilder options, NpgsqlDataSource dataSource) =>
        options.UseNpgsql(dataSource, npgsql => npgsql
            .UseNodaTime()
            .MigrationsHistoryTable("__ef_migrations", IdentityDb.Schema));
}

internal sealed class UserDirectory(IdentityDb db) : IUserDirectory
{
    public async Task<IReadOnlyDictionary<Guid, UserSummary>> GetAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken) =>
        await db.Users.AsNoTracking()
            .Where(x => userIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => new UserSummary(x.Id, x.FullName, x.DisplayName, x.Email!, x.Language, x.EmailConfirmed), cancellationToken);

    public Task<bool> IsPlatformAdminAsync(Guid userId, CancellationToken cancellationToken) =>
        db.Users.AsNoTracking().AnyAsync(x => x.Id == userId && x.IsPlatformAdmin, cancellationToken);
}
