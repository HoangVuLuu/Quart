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
                member.WorksShifts && (next.LockedAt is null || mine?.ReopenedAt is not null),
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

    /// <summary>
    /// Copies the template into dated shifts and asks everyone who works shifts for their availability
    /// (FR-091, FR-092). One unpublished period at a time keeps "the next period" unambiguous.
    /// </summary>
    internal static string RulesJson(WorkplaceTemplate template) =>
        JsonSerializer.Serialize(
            new PeriodRules(template.Rules.MaxConsecutiveShifts, template.Rules.OpeningFairness, template.Rules.ClosingFairness, template.Rules.PublishChecks.ToDictionary()),
            JsonSerializerOptions.Web);

    private static async Task<Results<Ok<PeriodSummary>, ProblemHttpResult>> CreateAsync(
        Guid workplaceId, CreatePeriodRequest request, SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
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

        var period = new Period
        {
            Id = Guid.NewGuid(),
            WorkplaceId = workplaceId,
            StartDate = start,
            Weeks = request.Weeks,
            Status = Period.Collecting,
            TimeZone = template.TimeZone.Id,
            Rules = RulesJson(template),
            CreatedAt = clock.GetCurrentInstant(),
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

        var members = await directory.GetMembersAsync(workplaceId, cancellationToken);
        var parameters = new Dictionary<string, string> { ["periodStart"] = Support.IsoDate(start), ["weeks"] = request.Weeks.ToString(System.Globalization.CultureInfo.InvariantCulture) };
        await notifier.NotifyAsync(
            members.Where(x => x.WorksShifts)
                .Select(x => new NotificationRequest(workplaceId, x.MembershipId, x.UserId, NotificationTypes.AvailabilityRequested, parameters))
                .ToList(),
            cancellationToken);
        return TypedResults.Ok(Support.Summarize(period));
    }
}

/// <summary>The rules a period was created with, kept on the period (FR-068).</summary>
internal sealed record PeriodRules(int? MaxConsecutiveShifts, bool OpeningFairness, bool ClosingFairness, Dictionary<string, string> PublishChecks);

/// <param name="StartDate">A Monday.</param>
/// <param name="Weeks">1 to 4 (FR-090).</param>
public sealed record CreatePeriodRequest(DateOnly StartDate, int Weeks);

/// <param name="Status">"collecting", "building" or "published".</param>
/// <param name="Version">0 until first published.</param>
/// <param name="DraftSaved">An unpublished draft was saved: the Schedule page offers "Continue building" (4.3).</param>
public sealed record PeriodSummary(Guid Id, DateOnly StartDate, DateOnly EndDate, int Weeks, string Status, int Version, bool Locked, bool DraftSaved);

/// <param name="Live">The published period that is running or coming up; null when there is none.</param>
/// <param name="Next">The period still collecting availability or being built; null when there is none.</param>
/// <param name="Upcoming">Periods already published that start after <paramref name="Live"/>, soonest first.</param>
/// <param name="MyLiveWeeklyHours">Hours per week the caller asked for in the live period; null if none (BR-032).</param>
public sealed record CurrentPeriods(PeriodSummary? Live, NextPeriod? Next, IReadOnlyList<PeriodSummary> Upcoming, decimal? MyLiveWeeklyHours);

/// <param name="MyAvailability">"not_sent" or "sent".</param>
/// <param name="CanEditAvailability">False once building has started, unless an admin reopened it for the caller.</param>
/// <param name="SentCount">How many people have sent; only for those who manage the schedule.</param>
public sealed record NextPeriod(PeriodSummary Period, string MyAvailability, bool CanEditAvailability, int? SentCount);
