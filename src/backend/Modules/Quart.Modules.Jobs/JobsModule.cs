using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.Modules.Jobs;

/// <summary>
/// Entry point of the Jobs module: the only two things the API host calls.
/// The scheduled-job table and the tick endpoint that runs whatever is due (AD-029). Starts in M2.
/// </summary>
public static class JobsModule
{
    public static IServiceCollection AddJobsModule(this IServiceCollection services)
    {
        return services;
    }

    public static IEndpointRouteBuilder MapJobsModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }
}
