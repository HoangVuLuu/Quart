using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NodaTime;
using Quart.Modules.Notifications.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Notifications;

/// <summary>
/// Nightly cleanup (M6-05): alerts after 60 days (spec 13) and outbox emails, with their address, after 7.
/// An email still unsent by then was given up on long before (the retries stop after about a day).
/// </summary>
internal sealed class NotificationRetention(NotificationsDbContext db, IClock clock, ILogger<NotificationRetention> logger) : IJobHandler
{
    public const string JobType = "notifications.retention";

    public string Type => JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var alertsBefore = now - Duration.FromDays(Retention.NotificationDays);
        var emailsBefore = now - Duration.FromDays(Retention.EmailDays);
        var alerts = await Retention.InBatchesAsync(
            token => db.Notifications
                .Where(x => db.Notifications.Where(n => n.CreatedAt < alertsBefore).OrderBy(n => n.Id).Take(Retention.BatchSize).Select(n => n.Id).Contains(x.Id))
                .ExecuteDeleteAsync(token),
            cancellationToken);
        var emails = await Retention.InBatchesAsync(
            token => db.OutboxMessages
                .Where(x => db.OutboxMessages.Where(m => m.CreatedAt < emailsBefore).OrderBy(m => m.Id).Take(Retention.BatchSize).Select(m => m.Id).Contains(x.Id))
                .ExecuteDeleteAsync(token),
            cancellationToken);
        logger.LogInformation("Retention: deleted {Notifications} notifications and {Emails} emails", alerts.Deleted, emails.Deleted);
        return JobOutcome.RunAgain(alerts.More || emails.More ? now : Retention.NextNight(now));
    }
}
