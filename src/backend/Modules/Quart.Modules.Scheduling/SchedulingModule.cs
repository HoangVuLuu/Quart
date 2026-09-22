using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.Modules.Scheduling;

/// <summary>
/// Entry point of the Scheduling module: the only two things the API host calls.
/// Periods, availability, drafts, generation, publishing. Built in M5 and M6. The only module that uses Quart.Generator.
/// </summary>
public static class SchedulingModule
{
    public static IServiceCollection AddSchedulingModule(this IServiceCollection services)
    {
        return services;
    }

    public static IEndpointRouteBuilder MapSchedulingModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }
}
