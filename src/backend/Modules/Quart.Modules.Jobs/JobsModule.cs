using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NodaTime;
using Npgsql;
using Quart.Modules.Jobs.Persistence;
using Quart.Modules.Jobs.Tick;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Jobs;

/// <summary>
/// Entry point of the Jobs module: the only things the API host calls.
/// The scheduled-job table and the tick that runs whatever is due (AD-029, docs/runbooks/background-jobs.md).
/// Other modules schedule work through <see cref="IJobScheduler"/> and run it with their own
/// <see cref="IJobHandler"/>; they never reference this module.
/// </summary>
public static class JobsModule
{
    /// <summary>Log category for the tick; kept at Information in every environment, one summary line per tick.</summary>
    public const string LogCategory = "Quart.Modules.Jobs";

    /// <summary>Needs an <see cref="NpgsqlDataSource"/> (with NodaTime enabled) registered by the host.</summary>
    public static IServiceCollection AddJobsModule(this IServiceCollection services)
    {
        services.AddDbContext<JobsDbContext>((provider, options) =>
            Configure(options, provider.GetRequiredService<NpgsqlDataSource>()));

        services.TryAddSingleton<IClock>(SystemClock.Instance);
        services.AddSingleton<JobStore>();
        services.AddSingleton<JobRunner>();
        services.AddSingleton<IJobScheduler, JobScheduler>();
        services.AddSingleton<ITickStatus, TickStatus>();
        services.AddScoped<IJobHandler, HeartbeatHandler>();
        return services;
    }

    public static IEndpointRouteBuilder MapJobsModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }

    /// <summary>
    /// Runs one tick: every job that is due, then returns. The <c>tick</c> command and, in Development,
    /// <c>POST /internal/tick</c> call it. Safe to run several at once.
    /// </summary>
    public static Task<TickResult> RunTickAsync(this IServiceProvider services, CancellationToken cancellationToken = default) =>
        services.GetRequiredService<JobRunner>().RunAsync(cancellationToken);

    /// <summary>Applies this module's pending migrations. Development startup and the M0-08 migrate step call it.</summary>
    public static async Task MigrateJobsModuleAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<JobsDbContext>();
        await context.Database.MigrateAsync(cancellationToken);
    }

    internal static void Configure(DbContextOptionsBuilder options, NpgsqlDataSource dataSource) =>
        options.UseNpgsql(dataSource, npgsql => npgsql
            .UseNodaTime()
            .MigrationsHistoryTable("__ef_migrations", JobsDbContext.Schema));
}
