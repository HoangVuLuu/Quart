using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.SharedKernel.Access;

/// <summary>
/// The authorization guard for every route under <c>/api/workplaces/{workplaceId}</c> (AD-026, AD-042).
/// It resolves the caller's membership first: nobody signed in gets 401, a non-member gets 404 (never
/// confirm that a workplace exists), and a member who lacks the permission gets 403.
/// </summary>
public static class WorkplaceGuard
{
    private const string ItemKey = "quart.member";

    /// <summary>The member must hold <paramref name="permission"/> in the workplace named by the route.</summary>
    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, Permission permission)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddGuard(permission);

    /// <summary>Any active member may call this. Said out loud, so an unguarded endpoint is never an accident.</summary>
    public static TBuilder AllowAnyMember<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddGuard(null);

    /// <summary>The membership the guard resolved for this request.</summary>
    public static MemberAccess Member(this HttpContext context) =>
        context.Items[ItemKey] as MemberAccess
        ?? throw new InvalidOperationException("This endpoint has no workplace guard: add RequirePermission or AllowAnyMember.");

    /// <summary>The signed-in user's ID, or null when nobody is signed in.</summary>
    public static Guid? UserId(this ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    /// <summary>For endpoints outside a workplace: somebody must be signed in, otherwise 401.</summary>
    public static TBuilder RequireUser<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter(async (context, next) =>
            context.HttpContext.User.UserId() is null ? Problems.Unauthorized() : await next(context));
        return builder;
    }

    /// <summary>The signed-in user's ID on an endpoint protected by <see cref="RequireUser{TBuilder}"/> or a workplace guard.</summary>
    public static Guid CurrentUserId(this HttpContext context) =>
        context.User.UserId() ?? throw new InvalidOperationException("Nobody is signed in: add RequireUser or a workplace guard.");

    private static TBuilder AddGuard<TBuilder>(this TBuilder builder, Permission? permission)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.Add(endpoint => endpoint.Metadata.Add(new WorkplaceGuardMetadata(permission)));
        builder.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            if (http.User.UserId() is not { } userId)
            {
                return Problems.Unauthorized();
            }
            if (!Guid.TryParse(http.Request.RouteValues["workplaceId"]?.ToString(), out var workplaceId))
            {
                return Problems.NotFound();
            }

            var access = http.RequestServices.GetRequiredService<IWorkplaceAccess>();
            var member = await access.FindAsync(workplaceId, userId, http.RequestAborted);
            if (member is null)
            {
                return Problems.NotFound();
            }
            if (permission is { } needed && !member.Can(needed))
            {
                return Problems.Forbidden();
            }

            http.Items[ItemKey] = member;
            return await next(context);
        });
        return builder;
    }
}

/// <summary>Marks a guarded endpoint. A test fails when a workplace route has none (M2-10).</summary>
/// <param name="Permission">Null means "any active member".</param>
public sealed record WorkplaceGuardMetadata(Permission? Permission);
