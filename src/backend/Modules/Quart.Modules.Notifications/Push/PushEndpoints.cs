using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using NodaTime;
using Quart.Modules.Notifications.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;

namespace Quart.Modules.Notifications.Push;

/// <summary>
/// Turning push on and off for one browser (M8-06, FR-212). Everything acts on the signed-in person's own
/// subscriptions only. The browser's endpoint is accepted only as an https URL and is never sent back.
/// </summary>
internal static class PushEndpoints
{
    public const string Off = "push.off";
    public const string EndpointInvalid = "push.endpoint_invalid";
    public const string KeysInvalid = "push.keys_invalid";

    /// <summary>Browsers per person; the oldest goes when a new one arrives past this.</summary>
    public const int MaxPerPerson = 10;

    public static void Map(IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/push").RequireUser();
        group.MapGet("/key", GetKey).WithName("GetPushKey");
        group.MapPost("/subscriptions", SubscribeAsync).WithName("SubscribeToPush");
        group.MapDelete("/subscriptions/{subscriptionId:guid}", UnsubscribeAsync).WithName("UnsubscribeFromPush");
    }

    /// <summary>The VAPID public key the browser needs to subscribe; "push.off" where push is not set up.</summary>
    private static Results<Ok<PushKey>, ProblemHttpResult> GetKey(IOptions<PushOptions> options) =>
        options.Value.IsConfigured ? TypedResults.Ok(new PushKey(options.Value.PublicKey!)) : Problems.Of(StatusCodes.Status404NotFound, Off);

    /// <summary>
    /// Saves this browser for the signed-in person. Sending the same browser again updates it; a browser last
    /// used by someone else on a shared phone now belongs to this person, so the other stops getting pushes there.
    /// </summary>
    private static async Task<Results<Ok<PushSubscribed>, ProblemHttpResult>> SubscribeAsync(
        PushSubscriptionRequest request,
        HttpContext http,
        NotificationsDbContext db,
        IOptions<PushOptions> options,
        IClock clock,
        CancellationToken cancellationToken)
    {
        if (!options.Value.IsConfigured)
        {
            return Problems.Of(StatusCodes.Status404NotFound, Off);
        }
        if (!IsPushEndpoint(request.Endpoint))
        {
            return Problems.Validation(new FieldError(EndpointInvalid, "endpoint"));
        }
        if (!HasLength(request.Keys?.P256dh, 65) || !HasLength(request.Keys?.Auth, 16) || Decode(request.Keys!.P256dh!)[0] != 0x04)
        {
            return Problems.Validation(new FieldError(KeysInvalid, "keys"));
        }

        var userId = http.CurrentUserId();
        var now = clock.GetCurrentInstant();
        var label = Label(request.Label);
        var existing = await db.PushSubscriptions.SingleOrDefaultAsync(x => x.Endpoint == request.Endpoint, cancellationToken);
        if (existing is null)
        {
            existing = new PushSubscription
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Endpoint = request.Endpoint!,
                P256dh = request.Keys.P256dh!,
                Auth = request.Keys.Auth!,
                Label = label,
                CreatedAt = now,
            };
            db.PushSubscriptions.Add(existing);
        }
        else
        {
            existing.UserId = userId;
            existing.P256dh = request.Keys.P256dh!;
            existing.Auth = request.Keys.Auth!;
            existing.Label = label;
        }
        await db.SaveChangesAsync(cancellationToken);

        var surplus = await db.PushSubscriptions
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.LastSuccessAt ?? x.CreatedAt)
            .Skip(MaxPerPerson)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);
        if (surplus.Count > 0)
        {
            await db.PushSubscriptions.Where(x => surplus.Contains(x.Id)).ExecuteDeleteAsync(cancellationToken);
        }
        return TypedResults.Ok(new PushSubscribed(existing.Id));
    }

    /// <summary>Forgets one of the signed-in person's browsers. Someone else's answers 404, as if it did not exist.</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> UnsubscribeAsync(
        Guid subscriptionId, HttpContext http, NotificationsDbContext db, CancellationToken cancellationToken)
    {
        var userId = http.CurrentUserId();
        var deleted = await db.PushSubscriptions.Where(x => x.Id == subscriptionId && x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        return deleted == 0 ? Problems.NotFound() : TypedResults.NoContent();
    }

    /// <summary>An absolute https URL with a host and no user name or password in it.</summary>
    internal static bool IsPushEndpoint(string? endpoint) =>
        endpoint is { Length: > 0 and <= PushSubscription.EndpointMaxLength }
        && Uri.TryCreate(endpoint, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps
        && uri.UserInfo.Length == 0
        && !string.IsNullOrEmpty(uri.Host);

    private static bool HasLength(string? value, int bytes)
    {
        if (string.IsNullOrEmpty(value) || value.Length > 128)
        {
            return false;
        }
        try
        {
            return Decode(value).Length == bytes;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static byte[] Decode(string base64Url)
    {
        var base64 = base64Url.Replace('-', '+').Replace('_', '/').TrimEnd('=');
        return Convert.FromBase64String(base64.PadRight(base64.Length + ((4 - (base64.Length % 4)) % 4), '='));
    }

    private static string? Label(string? label)
    {
        var trimmed = label?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed[..Math.Min(trimmed.Length, PushSubscription.LabelMaxLength)];
    }
}

/// <param name="PublicKey">The VAPID public key, base64url, for <c>pushManager.subscribe</c>.</param>
public sealed record PushKey(string PublicKey);

/// <param name="Endpoint">The push service URL, from the browser's <c>PushSubscription.toJSON()</c>.</param>
/// <param name="Keys">The browser's <c>p256dh</c> and <c>auth</c> keys, base64url, as in <c>toJSON()</c>.</param>
/// <param name="Label">What the person would call this device, such as "iPhone · Safari". Optional.</param>
public sealed record PushSubscriptionRequest(string? Endpoint, PushSubscriptionKeys? Keys, string? Label);

public sealed record PushSubscriptionKeys(string? P256dh, string? Auth);

/// <param name="Id">Keep it to turn push off on this browser later.</param>
public sealed record PushSubscribed(Guid Id);
