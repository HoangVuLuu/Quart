using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.Modules.Identity;

/// <summary>
/// Entry point of the Identity module: the only two things the API host calls.
/// Accounts, sign-in, email verification, password reset, two-factor, sessions. Built in M2.
/// </summary>
public static class IdentityModule
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services)
    {
        return services;
    }

    public static IEndpointRouteBuilder MapIdentityModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }
}
