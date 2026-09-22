using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.Modules.Notifications;

/// <summary>
/// Entry point of the Notifications module: the only two things the API host calls.
/// In-app, email and push notifications, the outbox, bundling. Starts in M2.
/// </summary>
public static class NotificationsModule
{
    public static IServiceCollection AddNotificationsModule(this IServiceCollection services)
    {
        return services;
    }

    public static IEndpointRouteBuilder MapNotificationsModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }
}
