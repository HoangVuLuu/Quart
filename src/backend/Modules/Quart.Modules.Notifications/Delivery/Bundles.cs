using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Notifications.Email;
using Quart.Modules.Notifications.Persistence;
using Quart.Modules.Notifications.Push;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Notifications.Delivery;

/// <summary>How alerts leave the app by push and email (M8-07).</summary>
public sealed class NotificationOptions
{
    public const string Section = "Notifications";

    /// <summary>
    /// How long a new alert waits for others of its kind before going out (FR-213; Hoang, 2026-11-22: five
    /// minutes). Zero sends every alert on its own, on the next tick.
    /// </summary>
    public int BundleMinutes { get; set; } = 5;
}

/// <summary>Which bundle to send. IDs only (decision 0012).</summary>
internal sealed record DeliverBundlePayload(Guid BundleId);

/// <summary>
/// Bundling (M8-07, FR-213). An alert that is pushed or emailed opens a bundle, or joins the open one of the same
/// kind for the same person in the same workplace. When the bundle is due, one push per browser and one email go
/// out for all of it: the alert's own sentence when it is alone, "3 shifts are up for grabs" when there are more.
/// The Alerts tab still lists each alert on its own.
/// </summary>
internal static class Bundles
{
    /// <summary>Whether an alert of this kind ever leaves the app.</summary>
    public static bool LeavesTheApp(string type) => !NotificationTypes.NotPushed.Contains(type) || NotificationEmails.IsEmailed(type);

    /// <summary>
    /// Puts each new alert in a bundle and returns the bundles it opened, for <see cref="ScheduleAsync"/> once
    /// the alerts are saved. Alerts already stored can be joined until their bundle's time comes; after that, a
    /// new bundle starts, so nothing joins a bundle that may be going out.
    /// </summary>
    public static async Task<IReadOnlyList<(Guid Id, Instant At)>> AssignAsync(NotificationsDbContext db, IReadOnlyList<Notification> added, Duration wait, Instant now, CancellationToken cancellationToken)
    {
        var bundled = added.Where(x => LeavesTheApp(x.Type)).ToList();
        if (bundled.Count == 0)
        {
            return [];
        }

        var people = bundled.Select(x => x.UserId).Distinct().ToList();
        var open = wait > Duration.Zero
            ? await db.Notifications.AsNoTracking()
                .Where(x => people.Contains(x.UserId) && x.BundleId != null && x.DeliveredAt == null && x.DeliverAt > now)
                .Select(x => new { x.UserId, x.WorkplaceId, x.Type, x.BundleId, x.DeliverAt })
                .ToListAsync(cancellationToken)
            : [];
        var bundles = open
            .GroupBy(x => (x.UserId, x.WorkplaceId, x.Type))
            .ToDictionary(x => x.Key, x => (Id: x.First().BundleId!.Value, At: x.First().DeliverAt!.Value));

        var opened = new List<(Guid Id, Instant At)>();
        foreach (var notification in bundled)
        {
            var key = (notification.UserId, notification.WorkplaceId, notification.Type);
            if (wait <= Duration.Zero || !bundles.TryGetValue(key, out var bundle))
            {
                bundle = (notification.Id, now + wait);
                opened.Add(bundle);
                if (wait > Duration.Zero)
                {
                    bundles[key] = bundle;
                }
            }
            notification.BundleId = bundle.Id;
            notification.DeliverAt = bundle.At;
        }
        return opened;
    }

    /// <summary>One delivery per bundle, when it is due: on the first tick after it, so up to 5 minutes later.</summary>
    public static async Task ScheduleAsync(IJobScheduler jobs, IReadOnlyList<(Guid Id, Instant At)> opened, CancellationToken cancellationToken)
    {
        foreach (var (id, at) in opened)
        {
            await jobs.ScheduleAsync(
                new JobRequest(DeliverBundleHandler.JobType, at)
                {
                    Payload = new DeliverBundlePayload(id),
                    DedupeKey = $"deliver:{id}",
                },
                cancellationToken);
        }
    }
}

/// <summary>
/// Sends one bundle: a push to each of the person's browsers, and an email when the kind is emailed and the
/// person has not turned email off in that workplace. Alerts the person already read in the app are left out;
/// when none is left, nothing is sent. The bundle is marked sent first: after a crash, an alert is lost rather
/// than sent twice.
/// </summary>
internal sealed class DeliverBundleHandler(NotificationsDbContext db, IUserDirectory users, IJobScheduler jobs, IClock clock) : IJobHandler
{
    public const string JobType = "notifications.deliver";

    public string Type => JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var bundleId = job.ReadPayload<DeliverBundlePayload>().BundleId;
        var now = clock.GetCurrentInstant();
        var alerts = await db.Notifications
            .Where(x => x.BundleId == bundleId && x.DeliveredAt == null)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(cancellationToken);
        if (alerts.Count == 0)
        {
            return JobOutcome.Done;
        }
        foreach (var alert in alerts)
        {
            alert.DeliveredAt = now;
        }

        var unread = alerts.Where(x => x.ReadAt is null).ToList();
        if (unread.Count == 0)
        {
            await db.SaveChangesAsync(cancellationToken);
            return JobOutcome.Done;
        }
        var latest = unread[^1];
        var count = unread.Count;

        var browsers = NotificationTypes.NotPushed.Contains(latest.Type)
            ? []
            : await db.PushSubscriptions.AsNoTracking()
                .Where(x => x.UserId == latest.UserId)
                .Select(x => x.Id)
                .ToListAsync(cancellationToken);
        var email = await EmailAsync(latest, count, now, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        foreach (var browser in browsers)
        {
            await jobs.ScheduleAsync(
                new JobRequest(SendPushHandler.JobType, now)
                {
                    Payload = new SendPushPayload(latest.Id, browser, count),
                    DedupeKey = $"push:{latest.Id}:{browser}",
                },
                cancellationToken);
        }
        if (email is not null)
        {
            await jobs.ScheduleAsync(
                new JobRequest(SendEmailHandler.JobType, now)
                {
                    Payload = new SendEmailPayload(email.Id),
                    DedupeKey = $"email:{email.Id}",
                },
                cancellationToken);
        }
        return JobOutcome.Done;
    }

    private async Task<OutboxMessage?> EmailAsync(Notification latest, int count, Instant now, CancellationToken cancellationToken)
    {
        if (!NotificationEmails.IsEmailed(latest.Type))
        {
            return null;
        }
        // No row: emails are on (Hoang, 2026-11-22), even for someone who also gets pushes.
        var turnedOff = await db.NotificationSettings.AsNoTracking()
            .AnyAsync(x => x.UserId == latest.UserId && x.WorkplaceId == latest.WorkplaceId && !x.Email, cancellationToken);
        // A deleted account is missing; an unconfirmed address gets nothing but its verification email.
        if (turnedOff || (await users.GetAsync([latest.UserId], cancellationToken)).GetValueOrDefault(latest.UserId) is not { EmailConfirmed: true } recipient)
        {
            return null;
        }

        var parameters = JsonSerializer.Deserialize<Dictionary<string, string>>(latest.Parameters) ?? [];
        parameters[NotificationEmails.RecipientParameter] = recipient.DisplayName;
        if (count > 1)
        {
            parameters[NotificationEmails.CountParameter] = count.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
        var message = new OutboxMessage
        {
            Id = Guid.NewGuid(),
            Recipient = recipient.Email,
            Template = (count > 1 ? NotificationEmails.BundlePrefix : NotificationEmails.TemplatePrefix) + latest.Type,
            Language = recipient.Language,
            Parameters = JsonSerializer.Serialize(parameters),
            CreatedAt = now,
        };
        db.OutboxMessages.Add(message);
        return message;
    }
}
