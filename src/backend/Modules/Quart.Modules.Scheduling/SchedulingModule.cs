using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NodaTime;
using Npgsql;
using Quart.Generator;
using Quart.Modules.Scheduling.Availability;
using Quart.Modules.Scheduling.Drafts;
using Quart.Modules.Scheduling.Lab;
using Quart.Modules.Scheduling.Periods;
using Quart.Modules.Scheduling.Persistence;
using Quart.Modules.Scheduling.Published;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Scheduling;

namespace Quart.Modules.Scheduling;

/// <summary>
/// Entry point of the Scheduling module: the only things the API host calls.
/// Periods and availability (M4), drafts, generation and publishing (M5). The only module that uses
/// Quart.Generator. The Marketplace module changes the published schedule through <see cref="IScheduleLedger"/>.
/// </summary>
public static class SchedulingModule
{
    /// <summary>
    /// Needs an <see cref="NpgsqlDataSource"/> (with NodaTime enabled) registered by the host, and the host
    /// must call <c>UseRateLimiter</c>: the lab endpoints are rate limited.
    /// </summary>
    public static IServiceCollection AddSchedulingModule(this IServiceCollection services)
    {
        services.AddDbContext<SchedulingDb>((provider, options) => Configure(options, provider.GetRequiredService<NpgsqlDataSource>()));
        services.TryAddSingleton<IClock>(SystemClock.Instance);
        services.AddSingleton<IScheduleGenerator, ScheduleGenerator>();
        services.AddScoped<DraftBuilder>();
        services.AddScoped<IScheduleLedger, ScheduleLedger>();
        services.AddScoped<IMemberLeftHandler, ReleaseShiftsOnLeave>();
        services.AddScoped<IJobHandler, AvailabilityStepHandler>();
        services.AddLab();
        return services;
    }

    /// <param name="includeLab">
    /// Maps the generator lab under /api/lab (M1-01). The host passes true only when <c>Features:Lab</c>
    /// is on, which is Development and staging and never Production.
    /// </param>
    public static IEndpointRouteBuilder MapSchedulingModule(this IEndpointRouteBuilder endpoints, bool includeLab = false)
    {
        endpoints.MapPeriods();
        endpoints.MapAvailability();
        endpoints.MapDrafts();
        endpoints.MapPublishedSchedule();
        if (includeLab)
        {
            endpoints.MapLab();
        }
        return endpoints;
    }

    /// <summary>Applies this module's pending migrations.</summary>
    public static async Task MigrateSchedulingModuleAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<SchedulingDb>().Database.MigrateAsync(cancellationToken);
    }

    internal static void Configure(DbContextOptionsBuilder options, NpgsqlDataSource dataSource) =>
        options.UseNpgsql(dataSource, npgsql => npgsql
            .UseNodaTime()
            .MigrationsHistoryTable("__ef_migrations", SchedulingDb.Schema));
}
