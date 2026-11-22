using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Notifications.Persistence;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Notifications.Push;

/// <summary>Which notification, to which browser. IDs only (decision 0012).</summary>
/// <param name="Count">How many alerts of its kind it stands for (M8-07); the latest one is named.</param>
internal sealed record SendPushPayload(Guid NotificationId, Guid SubscriptionId, int Count = 1);

/// <summary>
/// Sends one notification to one browser (M8-06). The message carries the alert's type and parameters and the
/// recipient's language; the app's service worker writes the same sentence as the Alerts tab (Hoang,
/// 2026-11-22: the full alert on the lock screen). A browser that is gone (404, 410) is forgotten; a refused
/// message is dropped; anything else is tried again by the job runner, which gives up after about a day.
/// </summary>
internal sealed class SendPushHandler(NotificationsDbContext db, IPushSender sender, IUserDirectory users, IClock clock) : IJobHandler
{
    public const string JobType = "notifications.send_push";

    /// <summary>camelCase, like every API answer: the service worker reads it as JSON.</summary>
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public string Type => JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var payload = job.ReadPayload<SendPushPayload>();
        var subscription = await db.PushSubscriptions.SingleOrDefaultAsync(x => x.Id == payload.SubscriptionId, cancellationToken);
        var notification = await db.Notifications.AsNoTracking().SingleOrDefaultAsync(x => x.Id == payload.NotificationId, cancellationToken);
        // Gone, read already (a single alert), or the browser now belongs to someone else on a shared phone.
        if (subscription is null || notification is null || (payload.Count == 1 && notification.ReadAt is not null) || subscription.UserId != notification.UserId)
        {
            return JobOutcome.Done;
        }
        var language = (await users.GetAsync([notification.UserId], cancellationToken)).GetValueOrDefault(notification.UserId)?.Language;
        if (language is null)
        {
            return JobOutcome.Done;
        }

        var body = new PushMessageBody(
            notification.Id,
            notification.WorkplaceId,
            notification.Type,
            JsonSerializer.Deserialize<Dictionary<string, string>>(notification.Parameters) ?? [],
            language,
            Math.Max(1, payload.Count));
        var message = JsonSerializer.Serialize(body, Json);
        var result = await sender.SendAsync(new PushTarget(subscription.Endpoint, subscription.P256dh, subscription.Auth), message, cancellationToken);
        switch (result)
        {
            case PushResult.Delivered:
                subscription.LastSuccessAt = clock.GetCurrentInstant();
                await db.SaveChangesAsync(cancellationToken);
                return JobOutcome.Done;
            case PushResult.Gone:
                db.PushSubscriptions.Remove(subscription);
                await db.SaveChangesAsync(cancellationToken);
                return JobOutcome.Done;
            case PushResult.Refused:
                return JobOutcome.Done;
            default:
                throw new PushNotDeliveredException();
        }
    }
}

/// <summary>What the service worker receives, encrypted end to end. Kept small: push services cap it near 4 KB.</summary>
/// <param name="Id">The notification, so opening it can mark it read.</param>
/// <param name="WorkplaceId">So the app opens in the right workplace.</param>
/// <param name="Type">As in the Alerts tab, such as <c>schedule.published</c>.</param>
/// <param name="Parameters">The same whitelisted values as in the Alerts tab (FR-216).</param>
/// <param name="Language">The recipient's, so the text matches their app.</param>
/// <param name="Count">More than one: a bundle (M8-07, FR-213), shown as "3 shifts are up for grabs".</param>
public sealed record PushMessageBody(Guid Id, Guid WorkplaceId, string Type, IReadOnlyDictionary<string, string> Parameters, string Language, int Count = 1);

/// <summary>The push service did not take the message this time; the job runner tries again later.</summary>
internal sealed class PushNotDeliveredException() : Exception("The push service did not take the message.");
