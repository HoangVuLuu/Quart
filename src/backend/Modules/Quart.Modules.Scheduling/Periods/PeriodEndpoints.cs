using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
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
    public const string WeeksInvalid = "period.weeks_invalid";
    public const string Overlaps = "period.overlaps";
    public const string TemplateEmpty = "period.template_empty";
    public const string UnfinishedExists = "period.unfinished_exists";
    public const string DueRequired = "period.due_required";
    public const string DueInPast = "period.due_in_past";
    public const string DueAfterStart = "period.due_after_start";
    public const string DueBeforeRequest = "period.due_before_request";

    private static readonly NodaTime.Text.LocalTimePattern DueTimePattern = NodaTime.Text.LocalTimePattern.CreateWithInvariantCulture("HH:mm");

    public static void MapPeriods(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/periods");
        group.MapGet("/current", GetCurrentAsync).AllowAnyMember().WithName("GetCurrentPeriods");
        group.MapPost("/", CreateAsync).RequirePermission(Permission.ManageSchedule).WithName("CreatePeriod");
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
                member.WorksShifts && (next.LockedAt is null || mine?.ReopenedAt is not null),
                sent);
        }
        return TypedResults.Ok(new CurrentPeriods(live is null ? null : Support.Summarize(live), nextView, published.Skip(1).Select(Support.Summarize).ToList()));
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
        if (request.Weeks is < 1 or > 4)
        {
            return Problems.Validation(new FieldError(WeeksInvalid, "weeks"));
        }
        var template = await directory.GetTemplateAsync(workplaceId, cancellationToken);
        if (template is null || template.Blocks.Count == 0)
        {
            return Problems.Conflict(TemplateEmpty);
        }

        var end = start.PlusDays((request.Weeks * 7) - 1);
        var existing = await db.Periods.AsNoTracking().Where(x => x.WorkplaceId == workplaceId).ToListAsync(cancellationToken);
        if (existing.Any(x => x.Status != Period.Published))
        {
            return Problems.Conflict(UnfinishedExists);
        }
        if (existing.Any(x => x.StartDate <= end && start <= x.EndDate))
        {
            return Problems.Conflict(Overlaps);
        }

        // FR-091: a deadline in the workplace's own clock, after the request and before the first day.
        // Checked after the dates, since it is measured against them.
        var now = clock.GetCurrentInstant();
        if (request.DueDate is not { } dueDate || DueTimePattern.Parse(request.DueTime ?? string.Empty) is not { Success: true } dueTime)
        {
            return Problems.Validation(new FieldError(DueRequired, "dueDate"));
        }
        var due = Support.InstantOf(LocalDate.FromDateOnly(dueDate), dueTime.Value, template.TimeZone);
        var requestAt = AvailabilitySteps.RequestAt(start, template.Rules.RequestDaysBefore, template.TimeZone, now);
        if (due <= now)
        {
            return Problems.Validation(new FieldError(DueInPast, "dueDate"));
        }
        // Before the first day; for a period opened after it has started (the first one at a new shop),
        // any time before it ends.
        var startsAt = Support.InstantOf(start, LocalTime.Midnight, template.TimeZone);
        var latest = startsAt > now ? startsAt : Support.InstantOf(start.PlusDays(request.Weeks * 7), LocalTime.Midnight, template.TimeZone);
        if (due > latest)
        {
            return Problems.Validation(new FieldError(DueAfterStart, "dueDate"));
        }
        if (due <= requestAt)
        {
            return Problems.Validation(new FieldError(DueBeforeRequest, "dueDate"));
        }

        var period = new Period
        {
            Id = Guid.NewGuid(),
            WorkplaceId = workplaceId,
            StartDate = start,
            Weeks = request.Weeks,
            Status = Period.Collecting,
            TimeZone = template.TimeZone.Id,
            Rules = RulesJson(template),
            CreatedAt = now,
            AvailabilityDueAt = due,
            RequestAt = requestAt,
            StepsDone = requestAt <= now ? [AvailabilitySteps.Request] : [],
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
        if (period.StepsDone.Contains(AvailabilitySteps.Request))
        {
            await AvailabilitySteps.SendRequestAsync(notifier, await directory.GetMembersAsync(workplaceId, cancellationToken), period, cancellationToken);
        }
        return TypedResults.Ok(Support.Summarize(period));
    }
}

/// <summary>The rules a period was created with, kept on the period (FR-068).</summary>
internal sealed record PeriodRules(int? MaxConsecutiveShifts, bool OpeningFairness, bool ClosingFairness, Dictionary<string, string> PublishChecks);

/// <param name="StartDate">A Monday.</param>
/// <param name="Weeks">1 to 4 (FR-090).</param>
/// <param name="DueDate">The day availability is due, in the workplace's time zone (FR-091). Required.</param>
/// <param name="DueTime">The time on that day, "HH:mm". Required.</param>
public sealed record CreatePeriodRequest(DateOnly StartDate, int Weeks, DateOnly? DueDate, string? DueTime);

/// <param name="Status">"collecting", "building" or "published".</param>
/// <param name="Version">0 until first published.</param>
/// <param name="DueAt">When availability is due; null for periods opened before deadlines existed (FR-091).</param>
/// <param name="RequestAt">When the availability request goes out or went out; null for periods from before.</param>
/// <param name="RequestSent">False while the request is still waiting for its day. Staff may fill in early either way.</param>
public sealed record PeriodSummary(
    Guid Id,
    DateOnly StartDate,
    DateOnly EndDate,
    int Weeks,
    string Status,
    int Version,
    bool Locked,
    DateTimeOffset? DueAt,
    DateTimeOffset? RequestAt,
    bool RequestSent);

/// <param name="Live">The published period that is running or coming up; null when there is none.</param>
/// <param name="Next">The period still collecting availability or being built; null when there is none.</param>
/// <param name="Upcoming">Periods already published that start after <paramref name="Live"/>, soonest first.</param>
public sealed record CurrentPeriods(PeriodSummary? Live, NextPeriod? Next, IReadOnlyList<PeriodSummary> Upcoming);

/// <param name="MyAvailability">"not_sent" or "sent".</param>
/// <param name="CanEditAvailability">False once building has started, unless an admin reopened it for the caller.</param>
/// <param name="SentCount">How many people have sent; only for those who manage the schedule.</param>
public sealed record NextPeriod(PeriodSummary Period, string MyAvailability, bool CanEditAvailability, int? SentCount);
