using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Quart.Modules.Jobs.Persistence;

namespace Quart.Modules.Jobs;

/// <summary>
/// Entry point of the Jobs module: the only things the API host calls.
/// The scheduled-job table and the tick endpoint that runs whatever is due (AD-029).
/// </summary>
public static class JobsModule
{
    /// <summary>Needs an <see cref="NpgsqlDataSource"/> (with NodaTime enabled) registered by the host.</summary>
    public static IServiceCollection AddJobsModule(this IServiceCollection services)
    {
        services.AddDbContext<JobsDbContext>((provider, options) =>
            Configure(options, provider.GetRequiredService<NpgsqlDataSource>()));
        return services;
    }

    public static IEndpointRouteBuilder MapJobsModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }

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
