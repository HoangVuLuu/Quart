using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.SharedKernel.Access;

/// <summary>
/// Step-up (AD-044, M2-06): this browser's session confirmed the password recently. The Identity module
/// owns sessions, so it answers; other modules only ask through <see cref="StepUp.RequireRecentConfirmation{TBuilder}"/>.
/// </summary>
public interface IRecentConfirmation
{
    Task<bool> IsRecentAsync(HttpContext http, CancellationToken cancellationToken);
}

public static class StepUp
{
    /// <summary>How long a confirmed password keeps counting (AD-044).</summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(10);

    public const string Required = "auth.step_up_required";

    /// <summary>
    /// The password must have been confirmed in this session within <see cref="Window"/>; otherwise 403 with
    /// <see cref="Required"/>, and the web app asks for it and tries again. Add it after the workplace guard,
    /// so a stranger still gets 404 and never learns that the action exists.
    /// </summary>
    public static TBuilder RequireRecentConfirmation<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            if (http.User.UserId() is null)
            {
                return Problems.Unauthorized();
            }
            var check = http.RequestServices.GetRequiredService<IRecentConfirmation>();
            return await check.IsRecentAsync(http, http.RequestAborted) ? await next(context) : Problems.Forbidden(Required);
        });
        return builder;
    }
}
