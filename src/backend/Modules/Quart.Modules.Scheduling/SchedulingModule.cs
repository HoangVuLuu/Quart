using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Quart.Generator;
using Quart.Modules.Scheduling.Lab;

namespace Quart.Modules.Scheduling;

/// <summary>
/// Entry point of the Scheduling module: the only two things the API host calls.
/// Periods, availability, drafts, generation, publishing. Built in M5 and M6. The only module that uses Quart.Generator.
/// </summary>
public static class SchedulingModule
{
    /// <summary>The host must call <c>UseRateLimiter</c>: the lab endpoints are rate limited.</summary>
    public static IServiceCollection AddSchedulingModule(this IServiceCollection services)
    {
        services.AddSingleton<IScheduleGenerator, NaiveGenerator>();
        services.AddLab();
        return services;
    }

    /// <param name="includeLab">
    /// Maps the generator lab under /api/lab (M1-01). The host passes true only when <c>Features:Lab</c>
    /// is on, which is Development and staging and never Production.
    /// </param>
    public static IEndpointRouteBuilder MapSchedulingModule(this IEndpointRouteBuilder endpoints, bool includeLab = false)
    {
        if (includeLab)
        {
            endpoints.MapLab();
        }
        return endpoints;
    }
}
