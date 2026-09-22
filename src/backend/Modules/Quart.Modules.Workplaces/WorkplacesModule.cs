using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.Modules.Workplaces;

/// <summary>
/// Entry point of the Workplaces module: the only two things the API host calls.
/// Workplaces, memberships, permissions, levels, join codes, the shift template. Built in M3 and M4.
/// </summary>
public static class WorkplacesModule
{
    public static IServiceCollection AddWorkplacesModule(this IServiceCollection services)
    {
        return services;
    }

    public static IEndpointRouteBuilder MapWorkplacesModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }
}
