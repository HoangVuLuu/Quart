using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NodaTime;
using Npgsql;
using Quart.Modules.Marketplace.Persistence;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Marketplace;

/// <summary>
/// Entry point of the Marketplace module: the only things the API host calls.
/// Give-aways, claims, trades and approvals (M7). It changes the published schedule only through
/// <see cref="Quart.SharedKernel.Scheduling.IScheduleLedger"/>, which the Scheduling module implements.
/// </summary>
public static class MarketplaceModule
{
    /// <summary>Needs an <see cref="NpgsqlDataSource"/> (with NodaTime enabled) registered by the host.</summary>
    public static IServiceCollection AddMarketplaceModule(this IServiceCollection services)
    {
        services.AddDbContext<MarketplaceDb>((provider, options) => Configure(options, provider.GetRequiredService<NpgsqlDataSource>()));
        services.TryAddSingleton<IClock>(SystemClock.Instance);
        services.AddScoped<IJobHandler, MarketplaceRetention>();
        services.AddScoped<IJobHandler, OfferUnclaimedHandler>();
        services.AddScoped<IJobHandler, TradeExpiryHandler>();
        services.AddSingleton(new NightlyJob(MarketplaceRetention.JobType));
        return services;
    }

    public static IEndpointRouteBuilder MapMarketplaceModule(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapMarketplace();
        return endpoints;
    }

    /// <summary>Applies this module's pending migrations.</summary>
    public static async Task MigrateMarketplaceModuleAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<MarketplaceDb>().Database.MigrateAsync(cancellationToken);
    }

    internal static void Configure(DbContextOptionsBuilder options, NpgsqlDataSource dataSource) =>
        options.UseNpgsql(dataSource, npgsql => npgsql
            .UseNodaTime()
            .MigrationsHistoryTable("__ef_migrations", MarketplaceDb.Schema));
}
