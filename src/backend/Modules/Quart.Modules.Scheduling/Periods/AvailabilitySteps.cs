using System.Globalization;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Scheduling.Periods;

using Availability = Persistence.Availability;
using Period = Persistence.Period;

/// <summary>
/// The automatic side of an availability cycle (FR-091, M4-05): the request on the day the workplace chose,
/// reminders 48 and 24 hours before the deadline to people who have not sent, and a note to the admins at
/// the deadline. Nothing locks by itself: building starts only when an admin starts it (FR-100).
/// </summary>
internal static class AvailabilitySteps
{
    public const string JobType = "scheduling.availability_step";

    public const string Request = "request";
    public const string Reminder48 = "48h";
    public const string Reminder24 = "24h";
    public const string Due = "due";

    /// <summary>The request goes out at this local time on its day.</summary>
    public static readonly LocalTime RequestTime = new(9, 0);

    /// <summary>When the request goes out: <paramref name="daysBefore"/> days before the start, or now when that has passed or is 0.</summary>
    public static Instant RequestAt(LocalDate start, int daysBefore, DateTimeZone zone, Instant now)
    {
        if (daysBefore <= 0)
        {
            return now;
        }
        var planned = Support.InstantOf(start.PlusDays(-daysBefore), RequestTime, zone);
        return planned > now ? planned : now;
    }

    /// <summary>
    /// Schedules every step still ahead. One job per period and step: opening the same period twice, or a
    /// retried request, adds nothing (the dedupe key).
    /// </summary>
    public static async Task ScheduleAsync(IJobScheduler jobs, Period period, Instant now, CancellationToken cancellationToken)
    {
        var steps = new List<(string Kind, Instant At)>();
        if (period.RequestAt is { } requestAt && requestAt > now)
        {
            steps.Add((Request, requestAt));
        }
        if (period.AvailabilityDueAt is { } due)
        {
            steps.Add((Reminder48, due - Duration.FromHours(48)));
            steps.Add((Reminder24, due - Duration.FromHours(24)));
            steps.Add((Due, due));
        }
        foreach (var (kind, at) in steps.Where(step => step.At > now))
        {
            await jobs.ScheduleAsync(
                new JobRequest(JobType, at)
                {
                    WorkplaceId = period.WorkplaceId,
                    Payload = new AvailabilityStepPayload(period.Id, kind),
                    DedupeKey = $"availability:{period.Id}:{kind}",
                },
                cancellationToken);
        }
    }

    /// <summary>Asks everyone who works shifts for their availability (FR-091, FR-215).</summary>
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

internal sealed record AvailabilityStepPayload(Guid PeriodId, string Kind);

/// <summary>
/// Runs one step. It looks at the period as it is now, so a reminder never reaches someone who has already
/// sent, and nothing happens once building has started or the period is gone. A step is marked done before
/// anyone is notified: after a crash in between, a reminder is lost rather than sent twice.
/// </summary>
internal sealed class AvailabilityStepHandler(SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier) : IJobHandler
{
    public string Type => AvailabilitySteps.JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var step = job.ReadPayload<AvailabilityStepPayload>();
        var period = await db.Periods.SingleOrDefaultAsync(x => x.Id == step.PeriodId, cancellationToken);
        if (period is null || period.Status != Period.Collecting || period.LockedAt is not null || period.StepsDone.Contains(step.Kind))
        {
            return JobOutcome.Done;
        }
        // Reminders and the due note follow the request; before it, nobody has been asked yet.
        if (step.Kind != AvailabilitySteps.Request && !period.StepsDone.Contains(AvailabilitySteps.Request))
        {
            return JobOutcome.Done;
        }

        period.StepsDone = [.. period.StepsDone, step.Kind];
        await db.SaveChangesAsync(cancellationToken);

        var members = await directory.GetMembersAsync(period.WorkplaceId, cancellationToken);
        if (step.Kind == AvailabilitySteps.Request)
        {
            await AvailabilitySteps.SendRequestAsync(notifier, members, period, cancellationToken);
            return JobOutcome.Done;
        }

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
