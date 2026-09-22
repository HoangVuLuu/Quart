using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.Modules.Marketplace;

/// <summary>
/// Entry point of the Marketplace module: the only two things the API host calls.
/// Give-aways, claims, trades and approvals. Built in M7.
/// </summary>
public static class MarketplaceModule
{
    public static IServiceCollection AddMarketplaceModule(this IServiceCollection services)
    {
        return services;
    }

    public static IEndpointRouteBuilder MapMarketplaceModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }
}
