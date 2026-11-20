using System.Globalization;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Scheduling.Drafts;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Scheduling.Periods;

using Availability = Persistence.Availability;
using Period = Persistence.Period;

/// <summary>
/// The automatic side of an availability cycle (FR-091, M4-05): reminders 48 and 24 hours before the
/// deadline to people who have not sent, and a note to the admins at the deadline. The request itself goes
/// out when the period is opened. Nothing locks by itself: building starts only when an admin starts it (FR-100).
/// </summary>
internal static class AvailabilitySteps
{
    public const string JobType = "scheduling.availability_step";

    public const string Reminder48 = "48h";
    public const string Reminder24 = "24h";
    public const string Due = "due";

    /// <summary>When each step happens for a deadline: reminders 48 and 24 hours before it, and the note at it.</summary>
    public static IReadOnlyList<(string Kind, Instant At)> StepsFor(Instant due) =>
        [(Reminder48, due - Duration.FromHours(48)), (Reminder24, due - Duration.FromHours(24)), (Due, due)];

    /// <summary>
    /// Schedules every step still ahead of the period's deadline. One job per period, step and deadline:
    /// a retried request adds nothing (the dedupe key), and the jobs of an earlier deadline do nothing.
    /// </summary>
    public static async Task ScheduleAsync(IJobScheduler jobs, Period period, Instant now, CancellationToken cancellationToken)
    {
        if (period.AvailabilityDueAt is not { } due)
        {
            return;
        }
        foreach (var (kind, at) in StepsFor(due).Where(step => step.At > now))
        {
            await jobs.ScheduleAsync(
                new JobRequest(JobType, at)
                {
                    WorkplaceId = period.WorkplaceId,
                    Payload = new AvailabilityStepPayload(period.Id, kind, due.ToUnixTimeTicks()),
                    // One job per period, step and deadline: a changed deadline gets jobs of its own (FR-091).
                    DedupeKey = $"availability:{period.Id}:{kind}:{due.ToUnixTimeTicks()}",
                },
                cancellationToken);
        }
    }

    /// <summary>Asks everyone who works shifts for their availability, as soon as the period is opened (FR-091, FR-215).</summary>
    public static Task SendRequestAsync(INotifier notifier, IReadOnlyList<WorkplaceMember> members, Period period, CancellationToken cancellationToken)
    {
        var parameters = new Dictionary<string, string>
        {
            ["periodStart"] = Support.IsoDate(period.StartDate),
            ["weeks"] = period.Weeks.ToString(CultureInfo.InvariantCulture),
        };
        return notifier.NotifyAsync(
            members.Where(x => x.WorksShifts)
                .Select(x => new NotificationRequest(period.WorkplaceId, x.MembershipId, x.UserId, NotificationTypes.AvailabilityRequested, parameters))
                .ToList(),
            cancellationToken);
    }
}

/// <param name="DueTicks">The deadline the step was scheduled for; a step for an older deadline does nothing.</param>
internal sealed record AvailabilityStepPayload(Guid PeriodId, string Kind, long DueTicks);

/// <summary>
/// Runs one step. It looks at the period as it is now, so a reminder never reaches someone who has already
/// sent, and nothing happens once building has started or the period is gone. A step is marked done before
/// anyone is notified: after a crash in between, a reminder is lost rather than sent twice.
/// </summary>
internal sealed class AvailabilityStepHandler(SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier, IClock clock) : IJobHandler
{
    /// <summary>How long to wait before trying again while the manager is building.</summary>
    public static readonly Duration RetryWhileBuilding = Duration.FromMinutes(5);

    public string Type => AvailabilitySteps.JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var step = job.ReadPayload<AvailabilityStepPayload>();
        var period = await db.Periods.SingleOrDefaultAsync(x => x.Id == step.PeriodId, cancellationToken);
        // Gone (cancelled), published, done already, or for a deadline that has since changed: nothing to send.
        if (period is null || period.Version > 0 || period.StepsDone.Contains(step.Kind)
            || period.AvailabilityDueAt?.ToUnixTimeTicks() != step.DueTicks)
        {
            return JobOutcome.Done;
        }
        // The manager is on Building Schedule, so availability is locked for now (FR-100, 2026-11-18). A
        // closed app ends the visit after its timeout; otherwise wait a little and try again, so nothing is lost.
        var now = clock.GetCurrentInstant();
        if (await BuildSession.SettleAsync(db, period, now, cancellationToken))
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        if (period.LockedAt is not null)
        {
            return JobOutcome.RunAgain(now + RetryWhileBuilding);
        }
        period.StepsDone = [.. period.StepsDone, step.Kind];
        await db.SaveChangesAsync(cancellationToken);

        var members = await directory.GetMembersAsync(period.WorkplaceId, cancellationToken);

        var sent = await db.Availabilities.AsNoTracking()
            .Where(x => x.PeriodId == period.Id && x.Status == Availability.Sent)
            .Select(x => x.MembershipId)
            .ToListAsync(cancellationToken);
        var workers = members.Where(x => x.WorksShifts).ToList();
        var periodStart = Support.IsoDate(period.StartDate);
        var notifications = step.Kind == AvailabilitySteps.Due
            ? members.Where(x => x.Can(Permission.ManageSchedule))
                .Select(x => new NotificationRequest(period.WorkplaceId, x.MembershipId, x.UserId, NotificationTypes.AvailabilityDue, new Dictionary<string, string>
                {
                    ["periodStart"] = periodStart,
                    ["sent"] = workers.Count(w => sent.Contains(w.MembershipId)).ToString(CultureInfo.InvariantCulture),
                    ["total"] = workers.Count.ToString(CultureInfo.InvariantCulture),
                }))
            : workers.Where(x => !sent.Contains(x.MembershipId))
                .Select(x => new NotificationRequest(period.WorkplaceId, x.MembershipId, x.UserId, NotificationTypes.AvailabilityReminder, new Dictionary<string, string> { ["periodStart"] = periodStart }));
        await notifier.NotifyAsync(notifications.ToList(), cancellationToken);
        return JobOutcome.Done;
    }
}
