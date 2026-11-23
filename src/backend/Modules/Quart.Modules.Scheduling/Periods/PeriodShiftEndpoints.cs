using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using NodaTime.Text;
using Npgsql;
using Quart.Modules.Scheduling.Drafts;
using Quart.Modules.Scheduling.Persistence;
using Quart.Modules.Scheduling.Published;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Scheduling.Periods;

using Period = Persistence.Period;

/// <summary>
/// One period's own shifts (FR-092, M4-01, 2026-11-23), changed from the pen next to each day on Building and
/// Editing Schedule. The Editing Shift page saves the whole list at once. Shifts that have started never change.
/// On a published period the change is live at once: the people on a changed or removed shift are told, and the
/// schedule gets a new version (FR-164).
/// </summary>
internal static class PeriodShiftEndpoints
{
    public const string ShiftStarted = "period.shift_started";
    public const string ShiftUnknown = "period.shift_unknown";
    public const string DateOutside = "period.date_outside";
    public const string DoubleBooked = "period.shift_double_booked";

    public const string TimeInvalid = "template.time_invalid";
    public const string OffGrid = "template.off_grid";
    public const string CrossesMidnight = "template.crosses_midnight";
    public const string HeadcountInvalid = "template.headcount_invalid";
    public const string RequirementInvalid = "template.requirement_invalid";
    public const string RequirementExceedsHeadcount = "template.requirement_exceeds_headcount";
    public const string NameTooLong = "template.name_too_long";

    /// <summary>Four weeks with room for several shifts a day.</summary>
    public const int MaxShifts = 400;

    private static readonly LocalTimePattern TimePattern = LocalTimePattern.CreateWithInvariantCulture("HH:mm");

    public static void MapPeriodShifts(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/periods/{periodId:guid}/shifts");
        group.MapGet("/", GetAsync).RequirePermission(Permission.ManageSchedule).WithName("GetPeriodShifts");
        group.MapPut("/", SaveAsync).RequirePermission(Permission.ManageSchedule).WithName("SavePeriodShifts");
    }

    private static async Task<Results<Ok<PeriodShifts>, NotFound>> GetAsync(
        Guid workplaceId, Guid periodId, SchedulingDb db, IWorkplaceDirectory directory, IClock clock, CancellationToken cancellationToken)
    {
        var period = await db.Periods.AsNoTracking().SingleOrDefaultAsync(x => x.Id == periodId && x.WorkplaceId == workplaceId, cancellationToken);
        if (period is null)
        {
            return TypedResults.NotFound();
        }
        var now = clock.GetCurrentInstant();
        var shifts = await db.Shifts.AsNoTracking()
            .Include(x => x.Requirements)
            .Where(x => x.PeriodId == periodId)
            .OrderBy(x => x.Date).ThenBy(x => x.StartTime).ThenBy(x => x.EndTime)
            .ToListAsync(cancellationToken);
        // "Reopen" on a closed day puts back what the generator rules give that date.
        var template = await directory.GetTemplateAsync(workplaceId, cancellationToken);
        var rules = new List<RulesShift>();
        for (var date = period.StartDate; template is not null && date <= period.EndDate; date = date.PlusDays(1))
        {
            rules.AddRange(TemplateShifts.ForDate(template, period.StartDate, date).Select(x => new RulesShift(
                x.Date.ToDateOnly(), x.SourceId, x.Name, Support.Time(x.Start), Support.Time(x.End), x.Headcount,
                x.Requirements.Select(r => new DraftRequirement(r.Level, r.MinCount)).ToList())));
        }
        var zone = DateTimeZoneProviders.Tzdb[period.TimeZone];
        return TypedResults.Ok(new PeriodShifts(
            Support.Summarize(period),
            shifts.Select(x => new PeriodShift(
                x.Id, x.Date.ToDateOnly(), x.SourceBlockId, x.Name, Support.Time(x.StartTime), Support.Time(x.EndTime), x.Headcount,
                x.Requirements.OrderBy(r => r.Level).Select(r => new DraftRequirement(r.Level, r.MinCount)).ToList(),
                x.AddedByHand, x.StartsAt <= now)).ToList(),
            rules,
            // A day can no longer change once its first shift has started, or once it is over.
            Enumerable.Range(0, period.Weeks * 7)
                .Select(period.StartDate.PlusDays)
                .Where(date => Support.InstantOf(date, shifts.Where(x => x.Date == date).Select(x => x.StartTime).DefaultIfEmpty(LocalTime.MaxValue).Min(), zone) <= now
                    || date.PlusDays(1).AtStartOfDayInZone(zone).ToInstant() <= now)
                .Select(date => date.ToDateOnly())
                .ToList()));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> SaveAsync(
        Guid workplaceId, Guid periodId, SavePeriodShifts request, SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier, IClock clock,
        CancellationToken cancellationToken)
    {
        var period = await db.Periods.SingleOrDefaultAsync(x => x.Id == periodId && x.WorkplaceId == workplaceId, cancellationToken);
        if (period is null)
        {
            return TypedResults.NotFound();
        }
        var (errors, parsed) = Validate(request, period);
        if (errors.Count > 0)
        {
            return Problems.Validation(errors);
        }

        var now = clock.GetCurrentInstant();
        var zone = DateTimeZoneProviders.Tzdb[period.TimeZone];
        var existing = await db.Shifts.Include(x => x.Requirements).Where(x => x.PeriodId == periodId).ToDictionaryAsync(x => x.Id, cancellationToken);
        var editable = existing.Values.Where(x => x.StartsAt > now).ToDictionary(x => x.Id);
        foreach (var item in parsed)
        {
            if (item.Id is { } id && !editable.ContainsKey(id))
            {
                return Problems.Conflict(existing.ContainsKey(id) ? ShiftStarted : ShiftUnknown);
            }
            if (item.Id is null && Support.InstantOf(item.Date, item.Start, zone) <= now)
            {
                return Problems.Conflict(ShiftStarted);
            }
        }

        var kept = parsed.Where(x => x.Id is not null).Select(x => x.Id!.Value).ToHashSet();
        var removed = editable.Values.Where(x => !kept.Contains(x.Id)).ToList();
        var moved = parsed
            .Where(x => x.Id is { } id && (editable[id].StartTime != x.Start || editable[id].EndTime != x.End))
            .Select(x => editable[x.Id!.Value])
            .ToList();
        var touchedIds = removed.Concat(moved).Select(x => x.Id).ToList();
        var holders = await db.Assignments.AsNoTracking()
            .Where(x => touchedIds.Contains(x.ShiftId) && !x.IsDraft)
            .ToListAsync(cancellationToken);
        var template = await directory.GetTemplateAsync(workplaceId, cancellationToken);
        var before = moved.ToDictionary(x => x.Id, x => (x.StartTime, x.EndTime));

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            // Removing a shift takes its people off it (the assignments go with it) and its availability answers.
            var removedIds = removed.Select(x => x.Id).ToList();
            await db.AvailabilityBlocks.Where(x => removedIds.Contains(x.ShiftId)).ExecuteDeleteAsync(cancellationToken);
            db.Shifts.RemoveRange(removed);

            foreach (var item in parsed)
            {
                if (item.Id is { } id)
                {
                    var shift = editable[id];
                    shift.Name = item.Name;
                    shift.Headcount = item.Headcount;
                    Retime(shift, item.Start, item.End, zone);
                    db.ShiftRequirements.RemoveRange(shift.Requirements);
                    db.ShiftRequirements.AddRange(item.Requirements.Select(r => new ShiftRequirement { Id = Guid.NewGuid(), ShiftId = shift.Id, Level = r.Level, MinCount = r.MinCount }));
                    continue;
                }
                // A day the manager reopens gets the generator's shifts back as they were; anything else is a shift
                // added by hand, which nobody gives availability for.
                var rulesIds = template is null ? [] : TemplateShifts.ForDate(template, period.StartDate, item.Date).Select(x => x.SourceId).ToHashSet();
                var fromRules = item.BlockId is { } blockId && rulesIds.Contains(blockId);
                var added = new Shift
                {
                    Id = Guid.NewGuid(),
                    PeriodId = period.Id,
                    WorkplaceId = workplaceId,
                    Date = item.Date,
                    Headcount = item.Headcount,
                    SourceBlockId = fromRules ? item.BlockId!.Value : Guid.NewGuid(),
                    Name = item.Name,
                    AddedByHand = !fromRules,
                };
                Retime(added, item.Start, item.End, zone);
                db.Shifts.Add(added);
                db.ShiftRequirements.AddRange(item.Requirements.Select(r => new ShiftRequirement { Id = Guid.NewGuid(), ShiftId = added.Id, Level = r.Level, MinCount = r.MinCount }));
            }
            await db.SaveChangesAsync(cancellationToken);

            // The people on a shift carry its times, for the no-double-booking rule (AD-011).
            foreach (var shift in moved)
            {
                await db.Assignments.Where(x => x.ShiftId == shift.Id)
                    .ExecuteUpdateAsync(set => set.SetProperty(x => x.StartsAt, shift.StartsAt).SetProperty(x => x.EndsAt, shift.EndsAt), cancellationToken);
            }
            // A visit to Building or Editing Schedule compares the draft with its saved copy: keep that copy in step,
            // so the shifts that went do not count as unsaved changes when the manager comes back.
            if (period.SavedDraft is not null)
            {
                period.SavedDraft = BuildSession.Snapshot(
                    await db.Assignments.AsNoTracking().Where(x => x.PeriodId == period.Id && x.IsDraft).ToListAsync(cancellationToken),
                    await db.Shifts.AsNoTracking().Where(x => x.PeriodId == period.Id).ToListAsync(cancellationToken));
                await db.SaveChangesAsync(cancellationToken);
            }
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation })
        {
            await transaction.RollbackAsync(cancellationToken);
            return Problems.Conflict(DoubleBooked);
        }
        catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.ExclusionViolation)
        {
            // New hours would put someone on two shifts at once (BR-002).
            await transaction.RollbackAsync(cancellationToken);
            return Problems.Conflict(DoubleBooked);
        }

        if (holders.Count > 0)
        {
            await ScheduleHistory.BumpAsync(db, period.Id, now, cancellationToken);
            var members = (await directory.GetMembersAsync(workplaceId, cancellationToken)).ToDictionary(x => x.MembershipId);
            var removedIds = removed.Select(x => x.Id).ToHashSet();
            await notifier.NotifyAsync(
                holders.Where(x => members.ContainsKey(x.MembershipId)).Select(x =>
                {
                    var gone = removedIds.Contains(x.ShiftId);
                    var shift = gone ? removed.Single(s => s.Id == x.ShiftId) : moved.Single(s => s.Id == x.ShiftId);
                    var parameters = new Dictionary<string, string>
                    {
                        ["date"] = Support.IsoDate(shift.Date),
                        ["start"] = Support.Time(shift.StartTime),
                        ["end"] = Support.Time(shift.EndTime),
                    };
                    if (!gone)
                    {
                        parameters["shiftId"] = shift.Id.ToString();
                        parameters["periodId"] = period.Id.ToString();
                    }
                    return new NotificationRequest(workplaceId, x.MembershipId, members[x.MembershipId].UserId,
                        gone ? NotificationTypes.ShiftRemoved : NotificationTypes.ShiftHoursChanged, parameters);
                }).ToList(),
                cancellationToken);
        }
        return TypedResults.NoContent();
    }

    private static void Retime(Shift shift, LocalTime start, LocalTime end, DateTimeZone zone)
    {
        shift.StartTime = start;
        shift.EndTime = end;
        shift.StartsAt = Support.InstantOf(shift.Date, start, zone);
        shift.EndsAt = Support.InstantOf(shift.Date, end, zone);
    }

    private sealed record Parsed(Guid? Id, LocalDate Date, Guid? BlockId, string? Name, LocalTime Start, LocalTime End, int Headcount, IReadOnlyList<DraftRequirement> Requirements);

    private static (List<FieldError> Errors, List<Parsed> Shifts) Validate(SavePeriodShifts request, Period period)
    {
        var errors = new List<FieldError>();
        var parsed = new List<Parsed>();
        var list = request.Shifts ?? [];
        if (list.Count > MaxShifts)
        {
            errors.Add(new FieldError(HeadcountInvalid, "shifts"));
            return (errors, parsed);
        }
        var ids = new HashSet<Guid>();
        for (var i = 0; i < list.Count; i++)
        {
            var item = list[i];
            var path = $"shifts[{i}]";
            var date = LocalDate.FromDateOnly(item.Date);
            if (date < period.StartDate || date > period.EndDate || (item.Id is { } id && !ids.Add(id)))
            {
                errors.Add(new FieldError(DateOutside, path));
                continue;
            }
            var start = TimePattern.Parse(item.Start ?? string.Empty);
            var end = TimePattern.Parse(item.End ?? string.Empty);
            if (!start.Success || !end.Success)
            {
                errors.Add(new FieldError(TimeInvalid, path));
                continue;
            }
            // FR-061, FR-062: on the 15-minute grid, and ending the day it starts.
            if (start.Value.Minute % 15 != 0 || end.Value.Minute % 15 != 0)
            {
                errors.Add(new FieldError(OffGrid, path));
            }
            if (end.Value <= start.Value)
            {
                errors.Add(new FieldError(CrossesMidnight, path));
            }
            var name = string.IsNullOrWhiteSpace(item.Name) ? null : item.Name.Trim();
            if (name?.Length > Shift.NameMaxLength)
            {
                errors.Add(new FieldError(NameTooLong, $"{path}.name"));
            }
            if (item.Headcount is < 1 or > 20)
            {
                errors.Add(new FieldError(HeadcountInvalid, $"{path}.headcount"));
            }
            var requirements = item.Requirements ?? [];
            if (requirements.Any(x => x.Level is < 1 or > 3 || x.MinCount < 1) || requirements.Select(x => x.Level).Distinct().Count() != requirements.Count)
            {
                errors.Add(new FieldError(RequirementInvalid, $"{path}.requirements"));
            }
            else if (requirements.Count > 0 && requirements.Max(x => x.MinCount) > item.Headcount)
            {
                // FR-065: counted inside the headcount; levels are a ladder, so the largest rule decides.
                errors.Add(new FieldError(RequirementExceedsHeadcount, $"{path}.requirements"));
            }
            parsed.Add(new Parsed(item.Id, date, item.BlockId, name, start.Value, end.Value, item.Headcount, requirements));
        }
        return (errors, parsed);
    }
}

/// <param name="Rules">What the generator rules give each date, for "Reopen" on a closed day.</param>
/// <param name="StartedDays">Days that can no longer change: their first shift has started, or they are over.</param>
public sealed record PeriodShifts(PeriodSummary Period, IReadOnlyList<PeriodShift> Shifts, IReadOnlyList<RulesShift> Rules, IReadOnlyList<DateOnly> StartedDays);

/// <param name="BlockId">The generator shift it came from; a random ID for a shift added by hand.</param>
/// <param name="AddedByHand">Added on Building or Editing Schedule: no availability, filled by hand (M4-01).</param>
/// <param name="Started">Has begun: it can no longer change.</param>
public sealed record PeriodShift(
    Guid Id, DateOnly Date, Guid BlockId, string? Name, string Start, string End, int Headcount,
    IReadOnlyList<DraftRequirement> Requirements, bool AddedByHand, bool Started);

/// <summary>A shift the generator rules give a date.</summary>
public sealed record RulesShift(DateOnly Date, Guid BlockId, string? Name, string Start, string End, int Headcount, IReadOnlyList<DraftRequirement> Requirements);

/// <summary>Every shift of the period that has not started, as the manager wants it. A shift left out is removed.</summary>
public sealed record SavePeriodShifts(IReadOnlyList<PeriodShiftSetup>? Shifts);

/// <param name="Id">An existing shift; null for a new one.</param>
/// <param name="BlockId">For a new shift: the generator shift it puts back ("Reopen"); null for one added by hand.</param>
/// <param name="Start">"HH:mm" on a 15-minute grid.</param>
public sealed record PeriodShiftSetup(
    Guid? Id, DateOnly Date, Guid? BlockId, string? Name, string? Start, string? End, int Headcount, IReadOnlyList<DraftRequirement>? Requirements);
