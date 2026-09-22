using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.Modules.Announcements;

/// <summary>
/// Entry point of the Announcements module: the only two things the API host calls.
/// The News tab: posts, photos and reactions. Built in M8.
/// </summary>
public static class AnnouncementsModule
{
    public static IServiceCollection AddAnnouncementsModule(this IServiceCollection services)
    {
        return services;
    }

    public static IEndpointRouteBuilder MapAnnouncementsModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }
}
