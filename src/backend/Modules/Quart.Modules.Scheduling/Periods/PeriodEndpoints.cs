using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Scheduling.Drafts;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Scheduling.Periods;

using Availability = Persistence.Availability;
using Period = Persistence.Period;

/// <summary>Periods: real, dated shifts copied from the template, so later template edits cannot corrupt them (M4-01).</summary>
internal static class PeriodEndpoints
{
    public const string StartNotMonday = "period.start_not_monday";
    public const string Overlaps = "period.overlaps";
    public const string TemplateEmpty = "period.template_empty";
    public const string UnfinishedExists = "period.unfinished_exists";
    public const string AlreadyStarted = "period.already_started";
    public const string DueRequired = "period.due_required";
    public const string DueInPast = "period.due_in_past";
    public const string DueAfterStart = "period.due_after_start";

    private static readonly NodaTime.Text.LocalTimePattern DueTimePattern = NodaTime.Text.LocalTimePattern.CreateWithInvariantCulture("HH:mm");

    public static void MapPeriods(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/periods");
        group.MapGet("/current", GetCurrentAsync).AllowAnyMember().WithName("GetCurrentPeriods");
        group.MapPost("/", CreateAsync).RequirePermission(Permission.ManageSchedule).WithName("CreatePeriod");
        group.MapDelete("/{periodId:guid}", CancelPeriod.RunAsync).RequirePermission(Permission.ManageSchedule).WithName("CancelPeriod");
    }

    /// <summary>
    /// The two periods anyone cares about: the published one that is running or coming up, and the next one
    /// still collecting availability or being built.
    /// </summary>
    private static async Task<Ok<CurrentPeriods>> GetCurrentAsync(Guid workplaceId, HttpContext http, SchedulingDb db, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var periods = await db.Periods.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId)
            .OrderBy(x => x.StartDate)
            .ToListAsync(cancellationToken);
        // Published and not over yet, soonest first. The first is the one being worked now; the others were
        // published ahead of time and staff must be able to read them before the current one ends.
        var published = periods.Where(x => x.Version > 0 && x.EndDate >= Support.Today(clock, x.TimeZone)).ToList();
        var live = published.FirstOrDefault();
        var next = periods.FirstOrDefault(x => x.Status != Period.Published);
        // 4.3: a Building Schedule page that went quiet counts as left, unsaved, before anyone reads the lock.
        if (next is { SessionSeenAt: not null })
        {
            var tracked = await db.Periods.SingleAsync(x => x.Id == next.Id, cancellationToken);
            if (await BuildSession.SettleAsync(db, tracked, clock.GetCurrentInstant(), cancellationToken))
            {
                await db.SaveChangesAsync(cancellationToken);
                next = tracked;
            }
        }

        // The home cards and the tab bar need the open period's progress without a second request.
        NextPeriod? nextView = null;
        if (next is not null)
        {
            var mine = await db.Availabilities.AsNoTracking()
                .SingleOrDefaultAsync(x => x.PeriodId == next.Id && x.MembershipId == member.MembershipId, cancellationToken);
            int? sent = null;
            if (member.Can(Permission.ManageSchedule))
            {
                sent = await db.Availabilities.CountAsync(x => x.PeriodId == next.Id && x.Status == Availability.Sent, cancellationToken);
            }
            nextView = new NextPeriod(
                Support.Summarize(next),
                mine?.Status ?? Availability.NotSent,
                member.WorksShifts && next.LockedAt is null,
                sent);
        }
        // Home's "hours this week" target: the number the caller gave with the live period's availability (BR-032).
        var liveHours = live is null
            ? null
            : await db.Availabilities.AsNoTracking()
                .Where(x => x.PeriodId == live.Id && x.MembershipId == member.MembershipId && x.Status == Availability.Sent)
                .Select(x => x.DesiredWeeklyHours)
                .FirstOrDefaultAsync(cancellationToken);
        return TypedResults.Ok(new CurrentPeriods(live is null ? null : Support.Summarize(live), nextView, published.Skip(1).Select(Support.Summarize).ToList(), liveHours));
    }

    internal static string RulesJson(WorkplaceTemplate template) =>
        JsonSerializer.Serialize(
            new PeriodRules(template.Rules.MaxConsecutiveShifts, template.Rules.OpeningFairness, template.Rules.ClosingFairness, template.Rules.PublishChecks.ToDictionary()),
            JsonSerializerOptions.Web);

    /// <summary>
    /// Copies the template into dated shifts (FR-092) and sets up the availability cycle (FR-091): the request
    /// goes out now or on the day the workplace chose, with a deadline, reminders and a note to the admins.
    /// One unpublished period at a time keeps "the next period" unambiguous.
    /// </summary>
    private static async Task<Results<Ok<PeriodSummary>, ProblemHttpResult>> CreateAsync(
        Guid workplaceId, CreatePeriodRequest request, SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier, IJobScheduler jobs, IClock clock, CancellationToken cancellationToken)
    {
        var start = LocalDate.FromDateOnly(request.StartDate);
        if (start.DayOfWeek != IsoDayOfWeek.Monday)
        {
            return Problems.Validation(new FieldError(StartNotMonday, "startDate"));
        }
        var template = await directory.GetTemplateAsync(workplaceId, cancellationToken);
        if (template is null || template.Blocks.Count == 0)
        {
            return Problems.Conflict(TemplateEmpty);
        }

        // The length is set only in Edit generator rules (FR-090, 2026-11-18).
        var weeks = template.Rules.PeriodWeeks;
        var end = start.PlusDays((weeks * 7) - 1);
        var existing = await db.Periods.AsNoTracking().Where(x => x.WorkplaceId == workplaceId).ToListAsync(cancellationToken);
        if (existing.Any(x => x.Status != Period.Published))
        {
            return Problems.Conflict(UnfinishedExists);
        }
        if (existing.Any(x => x.StartDate <= end && start <= x.EndDate))
        {
            return Problems.Conflict(Overlaps);
        }

        var now = clock.GetCurrentInstant();
        if (CheckDue(request.DueDate, request.DueTime, start, weeks, template.TimeZone, now) is { } invalid)
        {
            return invalid;
        }
        var due = DueOf(request.DueDate!.Value, request.DueTime!, template.TimeZone);

        var period = new Period
        {
            Id = Guid.NewGuid(),
            WorkplaceId = workplaceId,
            StartDate = start,
            Weeks = weeks,
            Status = Period.Collecting,
            TimeZone = template.TimeZone.Id,
            Rules = RulesJson(template),
            CreatedAt = now,
            AvailabilityDueAt = due,
        };
        db.Periods.Add(period);
        for (var date = start; date <= end; date = date.PlusDays(1))
        {
            foreach (var block in template.Blocks.Where(block => block.Days.Contains(date.DayOfWeek)))
            {
                db.Shifts.Add(new Shift
                {
                    Id = Guid.NewGuid(),
                    PeriodId = period.Id,
                    WorkplaceId = workplaceId,
                    Date = date,
                    StartTime = block.Start,
                    EndTime = block.End,
                    Headcount = block.Headcount,
                    SourceBlockId = block.Id,
                    Name = block.Name,
                    // AD-028: stored as local date and time; the instant is only for ordering and overlap checks.
                    StartsAt = Support.InstantOf(date, block.Start, template.TimeZone),
                    EndsAt = Support.InstantOf(date, block.End, template.TimeZone),
                    Requirements = block.Requirements.Select(x => new ShiftRequirement { Id = Guid.NewGuid(), Level = x.Level, MinCount = x.MinCount }).ToList(),
                });
            }
        }
        db.PeriodConflicts.AddRange(template.Conflicts.Select(x => new PeriodConflict
        {
            Id = Guid.NewGuid(), PeriodId = period.Id, BlockId = x.BlockId, MembershipA = x.MembershipA, MembershipB = x.MembershipB,
        }));
        await db.SaveChangesAsync(cancellationToken);

        await AvailabilitySteps.ScheduleAsync(jobs, period, now, cancellationToken);
        await AvailabilitySteps.SendRequestAsync(notifier, await directory.GetMembersAsync(workplaceId, cancellationToken), period, cancellationToken);
        return TypedResults.Ok(Support.Summarize(period));
    }

    /// <summary>
    /// FR-091: a deadline in the workplace's own clock, in the future and before the first day; for a period
    /// opened after it has started (the first one at a new shop), any time before it ends.
    /// </summary>
    private static ProblemHttpResult? CheckDue(DateOnly? dueDate, string? dueTime, LocalDate start, int weeks, DateTimeZone zone, Instant now)
    {
        if (dueDate is null || DueTimePattern.Parse(dueTime ?? string.Empty) is not { Success: true })
        {
            return Problems.Validation(new FieldError(DueRequired, "dueDate"));
        }
        var due = DueOf(dueDate.Value, dueTime!, zone);
        if (due <= now)
        {
            return Problems.Validation(new FieldError(DueInPast, "dueDate"));
        }
        var startsAt = Support.InstantOf(start, LocalTime.Midnight, zone);
        var latest = startsAt > now ? startsAt : Support.InstantOf(start.PlusDays(weeks * 7), LocalTime.Midnight, zone);
        return due > latest ? Problems.Validation(new FieldError(DueAfterStart, "dueDate")) : null;
    }

    private static Instant DueOf(DateOnly dueDate, string dueTime, DateTimeZone zone) =>
        Support.InstantOf(LocalDate.FromDateOnly(dueDate), DueTimePattern.Parse(dueTime).Value, zone);
}

/// <summary>
/// Cancels a period for good (FR-104, 2026-11-18): one that is not published yet, or a published one that has
/// not started. Everything in it is deleted (shifts, availability, notes, drafts, versions), so its dates are
/// free for a new period. Give-aways, claims and trades on its shifts close by themselves the next time the
/// Trade tab loads, as for any shift that no longer exists. Told: who sent availability or holds a shift in
/// it, except the admin who cancelled.
/// </summary>
internal static class CancelPeriod
{
    public static async Task<Results<NoContent, ProblemHttpResult>> RunAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var period = await db.Periods.AsNoTracking().FirstOrDefaultAsync(x => x.Id == periodId && x.WorkplaceId == workplaceId, cancellationToken);
        if (period is null)
        {
            return Problems.NotFound();
        }
        if (period.Version > 0 && Support.Today(clock, period.TimeZone) >= period.StartDate)
        {
            return Problems.Conflict(PeriodEndpoints.AlreadyStarted);
        }

        var sent = await db.Availabilities.Where(x => x.PeriodId == periodId && x.Status == Availability.Sent).Select(x => x.MembershipId).ToListAsync(cancellationToken);
        var holders = await db.Assignments.Where(x => x.PeriodId == periodId && !x.IsDraft).Select(x => x.MembershipId).ToListAsync(cancellationToken);
        var told = sent.Concat(holders).ToHashSet();
        told.Remove(http.Member().MembershipId);

        await using (var transaction = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            await db.ScheduleVersions.Where(x => x.PeriodId == periodId).ExecuteDeleteAsync(cancellationToken);
            await db.GenerationRuns.Where(x => x.PeriodId == periodId).ExecuteDeleteAsync(cancellationToken);
            // The rest goes with the period: shifts and their assignments, availability and its notes, conflicts.
            await db.Periods.Where(x => x.Id == periodId).ExecuteDeleteAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        var members = await directory.GetMembersAsync(workplaceId, cancellationToken);
        var parameters = new Dictionary<string, string>
        {
            ["periodStart"] = Support.IsoDate(period.StartDate),
            ["weeks"] = period.Weeks.ToString(System.Globalization.CultureInfo.InvariantCulture),
        };
        await notifier.NotifyAsync(
            members.Where(x => told.Contains(x.MembershipId))
                .Select(x => new NotificationRequest(workplaceId, x.MembershipId, x.UserId, NotificationTypes.PeriodCancelled, parameters))
                .ToList(),
            cancellationToken);
        return TypedResults.NoContent();
    }
}

/// <summary>The rules a period was created with, kept on the period (FR-068).</summary>
internal sealed record PeriodRules(int? MaxConsecutiveShifts, bool OpeningFairness, bool ClosingFairness, Dictionary<string, string> PublishChecks);

/// <param name="StartDate">A Monday. The length comes from the generator rules (FR-090).</param>
/// <param name="DueDate">The day availability is due, in the workplace's time zone (FR-091). Required.</param>
/// <param name="DueTime">The time on that day, "HH:mm". Required.</param>
public sealed record CreatePeriodRequest(DateOnly StartDate, DateOnly? DueDate, string? DueTime);

/// <param name="Status">"collecting", "building" or "published".</param>
/// <param name="Version">0 until first published.</param>
/// <param name="DraftSaved">An unpublished draft was saved: the Schedule page offers "Continue building" (4.3).</param>
/// <param name="DueAt">When availability is due; null for periods opened before deadlines existed (FR-091).</param>
public sealed record PeriodSummary(
    Guid Id,
    DateOnly StartDate,
    DateOnly EndDate,
    int Weeks,
    string Status,
    int Version,
    bool Locked,
    bool DraftSaved,
    DateTimeOffset? DueAt);

/// <param name="Live">The published period that is running or coming up; null when there is none.</param>
/// <param name="Next">The period still collecting availability or being built; null when there is none.</param>
/// <param name="Upcoming">Periods already published that start after <paramref name="Live"/>, soonest first.</param>
/// <param name="MyLiveWeeklyHours">Hours per week the caller asked for in the live period; null if none (BR-032).</param>
public sealed record CurrentPeriods(PeriodSummary? Live, NextPeriod? Next, IReadOnlyList<PeriodSummary> Upcoming, decimal? MyLiveWeeklyHours);

/// <param name="MyAvailability">"not_sent" or "sent".</param>
/// <param name="CanEditAvailability">False while the manager builds and once published (FR-100).</param>
/// <param name="SentCount">How many people have sent; only for those who manage the schedule.</param>
public sealed record NextPeriod(PeriodSummary Period, string MyAvailability, bool CanEditAvailability, int? SentCount);
