using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NodaTime;
using Npgsql;
using Quart.Modules.Workplaces.Persistence;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;

namespace Quart.Modules.Workplaces;

/// <summary>
/// Entry point of the Workplaces module: the only things the API host calls.
/// Workplaces, memberships, levels, join codes, permissions (M2) and the Edit Generator page's template and
/// rules (M3). Other modules ask through <see cref="IWorkplaceAccess"/> and <see cref="IWorkplaceDirectory"/>.
/// </summary>
public static class WorkplacesModule
{
    internal const string JoinRateLimitPolicy = "join";

    /// <summary>Needs an <see cref="NpgsqlDataSource"/> (with NodaTime enabled) registered by the host.</summary>
    public static IServiceCollection AddWorkplacesModule(this IServiceCollection services)
    {
        services.AddDbContext<WorkplacesDb>((provider, options) => Configure(options, provider.GetRequiredService<NpgsqlDataSource>()));
        services.TryAddSingleton<IClock>(SystemClock.Instance);
        services.AddScoped<WorkplaceReader>();
        services.AddScoped<IWorkplaceAccess>(provider => provider.GetRequiredService<WorkplaceReader>());
        services.AddScoped<IWorkplaceDirectory>(provider => provider.GetRequiredService<WorkplaceReader>());
        // Guessing a join code is rate limited per address (FR-007, M2-11).
        services.AddRateLimiter(options => options.AddPolicy(JoinRateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = context.RequestServices.GetRequiredService<IConfiguration>().GetValue("Workplaces:JoinsPerMinute", 10),
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                })));
        return services;
    }

    public static IEndpointRouteBuilder MapWorkplacesModule(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapWorkplaces();
        endpoints.MapTemplate();
        return endpoints;
    }

    /// <summary>Applies this module's pending migrations.</summary>
    public static async Task MigrateWorkplacesModuleAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<WorkplacesDb>().Database.MigrateAsync(cancellationToken);
    }

    internal static void Configure(DbContextOptionsBuilder options, NpgsqlDataSource dataSource) =>
        options.UseNpgsql(dataSource, npgsql => npgsql
            .UseNodaTime()
            .MigrationsHistoryTable("__ef_migrations", WorkplacesDb.Schema));
}

/// <summary>What the other modules may ask about a workplace, answered from this module's own tables.</summary>
internal sealed class WorkplaceReader(WorkplacesDb db, IUserDirectory users) : IWorkplaceAccess, IWorkplaceDirectory
{
    public async Task<MemberAccess?> FindAsync(Guid workplaceId, Guid userId, CancellationToken cancellationToken)
    {
        var membership = await db.Memberships.AsNoTracking()
            .SingleOrDefaultAsync(x => x.WorkplaceId == workplaceId && x.UserId == userId && x.LeftAt == null, cancellationToken);
        if (membership is null)
        {
            return null;
        }
        var grants = await GrantsAsync([membership.Id], cancellationToken);
        return new MemberAccess(workplaceId, membership.Id, userId, membership.Role, membership.Level, membership.WorksShifts, PermissionsOf(membership, grants));
    }

    public async Task<IReadOnlyList<WorkplaceMember>> GetMembersAsync(Guid workplaceId, CancellationToken cancellationToken)
    {
        var memberships = await db.Memberships.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && x.LeftAt == null)
            .OrderBy(x => x.JoinedAt)
            .ToListAsync(cancellationToken);
        var grants = await GrantsAsync(memberships.Select(x => x.Id).ToList(), cancellationToken);
        var names = await users.GetAsync(memberships.Select(x => x.UserId).ToList(), cancellationToken);
        return memberships
            // An account deleted since (FR-009) no longer appears among the people who can be scheduled.
            .Where(x => names.ContainsKey(x.UserId))
            .Select(x => new WorkplaceMember(
                x.Id, x.UserId, names[x.UserId].DisplayName, names[x.UserId].Language, x.Role, x.Level, x.WorksShifts,
                x.DesiredWeeklyHours, x.MaxWeeklyHours, PermissionsOf(x, grants)))
            .ToList();
    }

    public async Task<WorkplaceTemplate?> GetTemplateAsync(Guid workplaceId, CancellationToken cancellationToken)
    {
        var workplace = await db.Workplaces.AsNoTracking().SingleOrDefaultAsync(x => x.Id == workplaceId, cancellationToken);
        if (workplace is null)
        {
            return null;
        }
        var settings = ReadSettings(workplace);
        var blocks = await db.ShiftBlocks.AsNoTracking()
            .Include(x => x.Requirements)
            .Include(x => x.Conflicts)
            .Where(x => x.WorkplaceId == workplaceId)
            .OrderBy(x => x.StartTime).ThenBy(x => x.EndTime)
            .ToListAsync(cancellationToken);
        return new WorkplaceTemplate(
            workplace.Name,
            DateTimeZoneProviders.Tzdb[workplace.TimeZone],
            new WorkplaceRules(
                settings.PeriodWeeks,
                settings.LimitConsecutiveShifts ? settings.MaxConsecutiveShifts : null,
                settings.OpeningFairness,
                settings.ClosingFairness,
                settings.ClaimsNeedApproval,
                settings.TradesNeedApproval,
                settings.PublishChecks),
            blocks.Select(block => new TemplateBlock(
                block.Id,
                block.Days.Select(day => (IsoDayOfWeek)day).ToList(),
                block.StartTime,
                block.EndTime,
                block.Headcount,
                block.Requirements.OrderBy(x => x.Level).Select(x => new TemplateRequirement(x.Level, x.MinCount)).ToList())).ToList(),
            blocks.SelectMany(block => block.Conflicts.Select(x => new TemplateConflict(block.Id, x.MembershipA, x.MembershipB))).ToList());
    }

    internal static WorkplaceSettings ReadSettings(Workplace workplace) =>
        JsonSerializer.Deserialize<WorkplaceSettings>(workplace.Settings, JsonSerializerOptions.Web) ?? new WorkplaceSettings();

    internal static string WriteSettings(WorkplaceSettings settings) => JsonSerializer.Serialize(settings, JsonSerializerOptions.Web);

    private async Task<ILookup<Guid, Permission>> GrantsAsync(IReadOnlyCollection<Guid> membershipIds, CancellationToken cancellationToken)
    {
        var rows = await db.MembershipPermissions.AsNoTracking()
            .Where(x => membershipIds.Contains(x.MembershipId))
            .ToListAsync(cancellationToken);
        return rows
            .Where(x => Enum.TryParse<Permission>(x.Permission, out _))
            .ToLookup(x => x.MembershipId, x => Enum.Parse<Permission>(x.Permission));
    }

    private static IReadOnlySet<Permission> PermissionsOf(Membership membership, ILookup<Guid, Permission> grants)
    {
        var permissions = new HashSet<Permission>(Roles.PermissionsOf(membership.Role));
        permissions.UnionWith(grants[membership.Id]);
        return permissions;
    }
}
