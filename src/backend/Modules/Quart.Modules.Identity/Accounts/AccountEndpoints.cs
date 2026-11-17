using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NodaTime;
using Quart.Modules.Identity.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Identity.Accounts;

/// <summary>
/// Sign up, email verification, sign in and out, password reset and the profile (M2-02 to M2-05, M2-07).
/// Custom endpoints rather than <c>MapIdentityApi</c>, which is designed for bearer tokens (AD-024).
/// </summary>
internal static class AccountEndpoints
{
    public const string RateLimitPolicy = "auth";
    public const int RequestsPerMinute = 20;

    public const string InvalidCredentials = "auth.invalid_credentials";
    public const string EmailNotVerified = "auth.email_not_verified";
    public const string LockedOut = "auth.locked_out";
    public const string LinkInvalid = "auth.link_invalid";
    public const string LinkExpired = "auth.link_expired";
    public const string LinkUsed = "auth.link_used";

    /// <summary>At most one link email per account and purpose in this time, so the form cannot flood a mailbox.</summary>
    private static readonly Duration LinkEmailInterval = Duration.FromMinutes(1);

    private static readonly QuartUser UnknownUser = new() { FullName = string.Empty, DisplayName = string.Empty, Language = "en" };
    private static readonly Lazy<string> UnknownUserHash = new(() =>
        new PasswordHasher<QuartUser>().HashPassword(UnknownUser, Convert.ToHexString(RandomNumberGenerator.GetBytes(16))));

    private static readonly Duration VerifyLifetime = Duration.FromHours(24);
    private static readonly Duration ResetLifetime = Duration.FromMinutes(45);

    public static IServiceCollection AddAccountRateLimit(this IServiceCollection services) =>
        // By address. In-memory is fine because the app runs at most one replica (M2-04).
        // "Auth:RequestsPerMinute" overrides the limit, for tests that create many accounts.
        services.AddRateLimiter(options => options.AddPolicy(RateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = context.RequestServices.GetRequiredService<IConfiguration>().GetValue("Auth:RequestsPerMinute", RequestsPerMinute),
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                })));

    public static void MapAccounts(this IEndpointRouteBuilder endpoints)
    {
        var auth = endpoints.MapGroup("/api/auth").RequireRateLimiting(RateLimitPolicy);

        auth.MapPost("/sign-up", SignUpAsync).WithName("SignUp");
        auth.MapPost("/verify-email", VerifyEmailAsync).WithName("VerifyEmail");
        auth.MapPost("/resend-verification", ResendVerificationAsync).WithName("ResendVerification");
        auth.MapPost("/sign-in", SignInAsync).WithName("SignIn");
        auth.MapPost("/sign-out", (Delegate)SignOutAsync).WithName("SignOut");
        auth.MapPost("/sign-out-everywhere", SignOutEverywhereAsync).RequireUser().WithName("SignOutEverywhere");
        auth.MapPost("/forgot-password", ForgotPasswordAsync).WithName("ForgotPassword");
        auth.MapPost("/reset-password", ResetPasswordAsync).WithName("ResetPassword");

        endpoints.MapGet("/api/me", GetMeAsync).RequireUser().WithName("GetMe");
        endpoints.MapPatch("/api/me", UpdateMeAsync).RequireUser().WithName("UpdateMe");
    }

    /// <summary>
    /// Always answers the same way, whether or not the address already has an account (no enumeration):
    /// an existing address gets a "you already have an account" email instead.
    /// </summary>
    private static async Task<Results<Accepted, ProblemHttpResult>> SignUpAsync(
        SignUpRequest request,
        UserManager<QuartUser> users,
        IBreachedPasswordCheck breaches,
        IdentityDb db,
        IEmailOutbox emails,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var fullName = AccountRules.CleanName(request.FullName);
        var email = AccountRules.CleanEmail(request.Email);
        var language = request.Language ?? "fr";
        var errors = new List<FieldError>();
        if (!AccountRules.IsName(fullName))
        {
            errors.Add(new FieldError(AccountRules.NameInvalid, "fullName"));
        }
        if (!AccountRules.IsEmail(email))
        {
            errors.Add(new FieldError(AccountRules.EmailInvalid, "email"));
        }
        if (!AccountRules.Languages.Contains(language))
        {
            errors.Add(new FieldError(AccountRules.LanguageInvalid, "language"));
        }
        if (AccountRules.CheckPassword(request.Password) is { } passwordError)
        {
            errors.Add(passwordError);
        }
        else if (await breaches.IsBreachedAsync(request.Password!, cancellationToken))
        {
            errors.Add(new FieldError(AccountRules.PasswordBreached, "password"));
        }
        if (errors.Count > 0)
        {
            return Problems.Validation(errors);
        }

        if (await users.FindByEmailAsync(email) is { } existing)
        {
            if (existing.EmailConfirmed)
            {
                await emails.EnqueueAsync(new EmailRequest(email, EmailTemplates.AlreadyRegistered, existing.Language, new Dictionary<string, string>()), cancellationToken);
            }
            else
            {
                // The address is not confirmed, so nobody has proved it is theirs. This attempt's password
                // and name travel with this attempt's link and apply only if that link is opened: a
                // stranger who signed up first with someone else's address must not end up owning the
                // account the real owner later confirms.
                await SendLinkAsync(
                    db, emails, clock, existing, AccountLink.VerifyEmail, cancellationToken,
                    pendingPasswordHash: users.PasswordHasher.HashPassword(existing, request.Password!), pendingFullName: fullName);
            }
            return TypedResults.Accepted((string?)null);
        }

        var user = new QuartUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            FullName = fullName,
            DisplayName = AccountRules.DisplayNameOf(fullName),
            Language = language,
            CreatedAt = clock.GetCurrentInstant(),
        };
        var created = await users.CreateAsync(user, request.Password!);
        if (!created.Succeeded)
        {
            return Problems.Validation(new FieldError(ErrorCodes.Validation, "email"));
        }

        await SendLinkAsync(db, emails, clock, user, AccountLink.VerifyEmail, cancellationToken);
        return TypedResults.Accepted((string?)null);
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> VerifyEmailAsync(
        TokenRequest request, IdentityDb db, IClock clock, CancellationToken cancellationToken)
    {
        var (link, problem) = await FindLinkAsync(db, clock, request.Token, AccountLink.VerifyEmail, cancellationToken);
        if (link is null)
        {
            return problem!;
        }

        var user = await db.Users.SingleAsync(x => x.Id == link.UserId, cancellationToken);
        var now = clock.GetCurrentInstant();
        user.EmailConfirmed = true;
        if (link.PendingPasswordHash is not null)
        {
            user.PasswordHash = link.PendingPasswordHash;
            user.SecurityStamp = Guid.NewGuid().ToString();
            if (link.PendingFullName is { } fullName)
            {
                user.FullName = fullName;
                user.DisplayName = AccountRules.DisplayNameOf(fullName);
            }
        }
        link.UsedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        // The other links sent for this account are finished too, with whatever password they carried.
        await RetireLinksAsync(db, user.Id, AccountLink.VerifyEmail, now, cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Accepted> ResendVerificationAsync(
        EmailOnlyRequest request, UserManager<QuartUser> users, IdentityDb db, IEmailOutbox emails, IClock clock, CancellationToken cancellationToken)
    {
        if (await users.FindByEmailAsync(AccountRules.CleanEmail(request.Email)) is { EmailConfirmed: false } user)
        {
            await SendLinkAsync(db, emails, clock, user, AccountLink.VerifyEmail, cancellationToken);
        }
        return TypedResults.Accepted((string?)null);
    }

    private static async Task<Results<Ok<Me>, ProblemHttpResult>> SignInAsync(
        SignInRequest request, HttpContext http, UserManager<QuartUser> users)
    {
        var user = await users.FindByEmailAsync(AccountRules.CleanEmail(request.Email));
        if (user is null)
        {
            // Spend the same time as for a real account, so the answer's speed does not say whether the
            // address has one.
            users.PasswordHasher.VerifyHashedPassword(UnknownUser, UnknownUserHash.Value, request.Password ?? string.Empty);
            return Problems.Unauthorized(InvalidCredentials);
        }
        if (await users.IsLockedOutAsync(user))
        {
            return Problems.Forbidden(LockedOut);
        }
        if (!await users.CheckPasswordAsync(user, request.Password ?? string.Empty))
        {
            await users.AccessFailedAsync(user);
            return await users.IsLockedOutAsync(user) ? Problems.Forbidden(LockedOut) : Problems.Unauthorized(InvalidCredentials);
        }
        if (!user.EmailConfirmed)
        {
            return Problems.Forbidden(EmailNotVerified);
        }

        await users.ResetAccessFailedCountAsync(user);
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())], IdentityConstants.ApplicationScheme);
        await http.SignInAsync(
            IdentityConstants.ApplicationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
        return TypedResults.Ok(ToMe(user));
    }

    private static async Task<NoContent> SignOutAsync(HttpContext http)
    {
        // Deletes this browser's session row through the ticket store, then clears the cookie.
        await http.SignOutAsync(IdentityConstants.ApplicationScheme);
        return TypedResults.NoContent();
    }

    private static async Task<NoContent> SignOutEverywhereAsync(HttpContext http, IdentityDb db, CancellationToken cancellationToken)
    {
        var userId = http.CurrentUserId();
        await db.Sessions.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await http.SignOutAsync(IdentityConstants.ApplicationScheme);
        return TypedResults.NoContent();
    }

    /// <summary>Always answers the same way, whether or not the account exists (M2-05).</summary>
    private static async Task<Accepted> ForgotPasswordAsync(
        EmailOnlyRequest request, UserManager<QuartUser> users, IdentityDb db, IEmailOutbox emails, IClock clock, CancellationToken cancellationToken)
    {
        if (await users.FindByEmailAsync(AccountRules.CleanEmail(request.Email)) is { } user)
        {
            await SendLinkAsync(db, emails, clock, user, AccountLink.ResetPassword, cancellationToken);
        }
        return TypedResults.Accepted((string?)null);
    }

    /// <summary>A successful reset ends every session of the account (FR-005) and proves the email address.</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> ResetPasswordAsync(
        ResetPasswordRequest request,
        UserManager<QuartUser> users,
        IBreachedPasswordCheck breaches,
        IdentityDb db,
        IClock clock,
        CancellationToken cancellationToken)
    {
        if (AccountRules.CheckPassword(request.Password) is { } passwordError)
        {
            return Problems.Validation(passwordError);
        }
        var (link, problem) = await FindLinkAsync(db, clock, request.Token, AccountLink.ResetPassword, cancellationToken);
        if (link is null)
        {
            return problem!;
        }
        if (await breaches.IsBreachedAsync(request.Password!, cancellationToken))
        {
            return Problems.Validation(new FieldError(AccountRules.PasswordBreached, "password"));
        }

        var user = await users.FindByIdAsync(link.UserId.ToString());
        if (user is null)
        {
            return Problems.Validation(new FieldError(LinkInvalid, "token"));
        }
        user.PasswordHash = users.PasswordHasher.HashPassword(user, request.Password!);
        user.EmailConfirmed = true;
        await users.UpdateSecurityStampAsync(user);
        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);

        var now = clock.GetCurrentInstant();
        link.UsedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        // Any other reset link still in a mailbox dies with this one.
        await RetireLinksAsync(db, user.Id, AccountLink.ResetPassword, now, cancellationToken);
        await db.Sessions.Where(x => x.UserId == user.Id).ExecuteDeleteAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<Me>, ProblemHttpResult>> GetMeAsync(HttpContext http, IdentityDb db, CancellationToken cancellationToken)
    {
        var userId = http.CurrentUserId();
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId, cancellationToken);
        return user is null ? Problems.Unauthorized() : TypedResults.Ok(ToMe(user));
    }

    private static async Task<Results<Ok<Me>, ProblemHttpResult>> UpdateMeAsync(
        UpdateMeRequest request, HttpContext http, IdentityDb db, CancellationToken cancellationToken)
    {
        var userId = http.CurrentUserId();
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (user is null)
        {
            return Problems.Unauthorized();
        }

        if (request.DisplayName is not null)
        {
            var displayName = AccountRules.CleanName(request.DisplayName);
            if (!AccountRules.IsName(displayName) || displayName.Length > 40)
            {
                return Problems.Validation(new FieldError(AccountRules.NameInvalid, "displayName"));
            }
            user.DisplayName = displayName;
        }
        if (request.Language is not null)
        {
            if (!AccountRules.Languages.Contains(request.Language))
            {
                return Problems.Validation(new FieldError(AccountRules.LanguageInvalid, "language"));
            }
            user.Language = request.Language;
        }
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(ToMe(user));
    }

    private static Me ToMe(QuartUser user) =>
        new(user.Id, user.FullName, user.DisplayName, user.Email!, user.Language, user.IsPlatformAdmin);

    private static Task<int> RetireLinksAsync(IdentityDb db, Guid userId, string purpose, Instant now, CancellationToken cancellationToken) =>
        db.AccountLinks.Where(x => x.UserId == userId && x.Purpose == purpose && x.UsedAt == null)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.UsedAt, now), cancellationToken);

    private static async Task SendLinkAsync(
        IdentityDb db, IEmailOutbox emails, IClock clock, QuartUser user, string purpose, CancellationToken cancellationToken,
        string? pendingPasswordHash = null, string? pendingFullName = null)
    {
        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var verify = purpose == AccountLink.VerifyEmail;
        var now = clock.GetCurrentInstant();
        var lifetime = verify ? VerifyLifetime : ResetLifetime;
        // A link's age is its lifetime minus what is left of it. One was sent a moment ago: say nothing more.
        var recent = now + lifetime - LinkEmailInterval;
        if (await db.AccountLinks.AnyAsync(x => x.UserId == user.Id && x.Purpose == purpose && x.UsedAt == null && x.ExpiresAt > recent, cancellationToken))
        {
            return;
        }
        db.AccountLinks.Add(new AccountLink
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Purpose = purpose,
            TokenHash = Hash(token),
            ExpiresAt = now + lifetime,
            PendingPasswordHash = pendingPasswordHash,
            PendingFullName = pendingFullName,
        });
        await db.SaveChangesAsync(cancellationToken);
        await emails.EnqueueAsync(
            new EmailRequest(
                user.Email!,
                verify ? EmailTemplates.VerifyEmail : EmailTemplates.ResetPassword,
                user.Language,
                new Dictionary<string, string> { ["token"] = token, ["name"] = user.DisplayName }),
            cancellationToken);
    }

    /// <summary>Finds a usable link, or says exactly why it is not: unknown, already used, or expired.</summary>
    private static async Task<(AccountLink? Link, ProblemHttpResult? Problem)> FindLinkAsync(
        IdentityDb db, IClock clock, string? token, string purpose, CancellationToken cancellationToken)
    {
        var hash = Hash(token ?? string.Empty);
        var link = await db.AccountLinks.SingleOrDefaultAsync(x => x.TokenHash == hash && x.Purpose == purpose, cancellationToken);
        if (link is null)
        {
            return (null, Problems.Validation(new FieldError(LinkInvalid, "token")));
        }
        if (link.UsedAt is not null)
        {
            return (null, Problems.Validation(new FieldError(LinkUsed, "token")));
        }
        if (link.ExpiresAt <= clock.GetCurrentInstant())
        {
            return (null, Problems.Validation(new FieldError(LinkExpired, "token")));
        }
        return (link, null);
    }

    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

public sealed record SignUpRequest(string? FullName, string? Email, string? Password, string? Language);

public sealed record SignInRequest(string? Email, string? Password);

public sealed record EmailOnlyRequest(string? Email);

public sealed record TokenRequest(string? Token);

public sealed record ResetPasswordRequest(string? Token, string? Password);

public sealed record UpdateMeRequest(string? DisplayName, string? Language);

/// <summary>The signed-in account. Memberships come from <c>GET /api/workplaces</c>.</summary>
public sealed record Me(Guid Id, string FullName, string DisplayName, string Email, string Language, bool IsPlatformAdmin);
