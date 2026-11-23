using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Npgsql;
using Quart.Generator;
using Quart.Modules.Scheduling.Availability;
using Quart.Modules.Scheduling.Drafts;
using Quart.Modules.Scheduling.Periods;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Scheduling;

namespace Quart.Modules.Scheduling.Published;

using Assignment = Persistence.Assignment;

/// <summary>What staff open the app for: the published schedule of a period (M5-06). Never the draft (AD-012).</summary>
internal static class PublishedScheduleEndpoints
{
    public const string NotPublished = "schedule.not_published";

    public static void MapPublishedSchedule(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/api/workplaces/{workplaceId:guid}/periods/{periodId:guid}/schedule", GetAsync)
            .AllowAnyMember()
            .WithName("GetPublishedSchedule");

    private static async Task<Results<Ok<ScheduleView>, ProblemHttpResult>> GetAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, IWorkplaceDirectory directory, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (period.Version == 0)
        {
            return Problems.Conflict(NotPublished);
        }

        var member = http.Member();
        var shifts = await db.Shifts.AsNoTracking()
            .Where(x => x.PeriodId == period.Id)
            .OrderBy(x => x.Date).ThenBy(x => x.StartTime).ThenBy(x => x.EndTime)
            .ToListAsync(cancellationToken);
        var live = await db.Assignments.AsNoTracking().Where(x => x.PeriodId == period.Id && !x.IsDraft).ToListAsync(cancellationToken);
        var names = (await directory.GetMembersAsync(workplaceId, cancellationToken)).ToDictionary(x => x.MembershipId);
        var parts = DayParts.Of(shifts.Select(x => new GeneratorShift(
            DraftBuilder.Id(x.Id), DraftBuilder.Id(x.SourceBlockId), x.Date.ToDateOnly(), x.StartTime.ToTimeOnly(), x.EndTime.ToTimeOnly(), x.Headcount, [])));

        return TypedResults.Ok(new ScheduleView(
            Support.Summarize(period),
            shifts.Select(shift => new ScheduleShift(
                shift.Id,
                shift.SourceBlockId,
                shift.Date.ToDateOnly(),
                Support.Time(shift.StartTime),
                Support.Time(shift.EndTime),
                shift.Hours,
                shift.StartsAt.ToDateTimeOffset(),
                shift.Headcount,
                DraftEndpoints.PartOf(parts[DraftBuilder.Id(shift.Id)]),
                live.Where(x => x.ShiftId == shift.Id)
                    .Select(x => new SchedulePerson(
                        x.MembershipId,
                        // Someone who has left keeps their past shifts, without their name (FR-009).
                        names.GetValueOrDefault(x.MembershipId)?.DisplayName,
                        // 3.1: levels only for people who manage them.
                        member.Can(Permission.ManageLevels) ? names.GetValueOrDefault(x.MembershipId)?.Level : null,
                        x.MembershipId == member.MembershipId))
                    .OrderBy(x => x.Name, StringComparer.CurrentCultureIgnoreCase)
                    .ToList(),
                shift.Note,
                shift.Name)).ToList()));
    }
}

public sealed record ScheduleView(PeriodSummary Period, IReadOnlyList<ScheduleShift> Shifts);

/// <param name="StartsAt">The instant the shift begins, to tell upcoming from completed.</param>
/// <param name="Part">"opening", "closing", "mid" or "only".</param>
/// <param name="Note">The manager's note on the shift, for the whole team (FR-145); null for none.</param>
/// <param name="Name">The shift's custom name, or null to be called by its part (M3-04).</param>
public sealed record ScheduleShift(
    Guid Id,
    Guid BlockId,
    DateOnly Date,
    string Start,
    string End,
    decimal Hours,
    DateTimeOffset StartsAt,
    int Headcount,
    string Part,
    IReadOnlyList<SchedulePerson> People,
    string? Note = null,
    string? Name = null);

/// <param name="Name">Null for someone who has left the workplace.</param>
public sealed record SchedulePerson(Guid MembershipId, string? Name, int? Level, bool IsMe);

/// <summary>
/// The published schedule as the Marketplace module changes it (M7). Each change locks the shift rows it
/// touches, so two people tapping Claim at the same instant are served one after the other (AD-013), and
/// the database refuses any double booking (AD-011). The admin's draft follows every change, so a later
/// Update never undoes a claim or a trade (FR-162).
/// </summary>
internal sealed class ScheduleLedger(SchedulingDb db, IWorkplaceDirectory directory, IClock clock) : IScheduleLedger
{
    public async Task<IReadOnlyList<LiveShift>> GetUpcomingAsync(Guid workplaceId, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var published = db.Periods.Where(x => x.WorkplaceId == workplaceId && x.Version > 0).Select(x => x.Id);
        var shifts = await db.Shifts.AsNoTracking()
            .Include(x => x.Requirements)
            .Where(x => published.Contains(x.PeriodId) && x.StartsAt > now)
            .OrderBy(x => x.StartsAt)
            .ToListAsync(cancellationToken);
        return await ToLiveAsync(workplaceId, shifts, cancellationToken);
    }

    public async Task<LiveShift?> FindAsync(Guid workplaceId, Guid shiftId, CancellationToken cancellationToken)
    {
        var published = db.Periods.Where(x => x.WorkplaceId == workplaceId && x.Version > 0).Select(x => x.Id);
        var shifts = await db.Shifts.AsNoTracking()
            .Include(x => x.Requirements)
            .Where(x => x.Id == shiftId && published.Contains(x.PeriodId))
            .ToListAsync(cancellationToken);
        return (await ToLiveAsync(workplaceId, shifts, cancellationToken)).FirstOrDefault();
    }

    public Task<bool> HasUpcomingAsync(Guid workplaceId, Guid membershipId, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var periods = db.Periods.Where(x => x.WorkplaceId == workplaceId).Select(x => x.Id);
        return db.Assignments.AnyAsync(x => x.MembershipId == membershipId && x.StartsAt > now && periods.Contains(x.PeriodId), cancellationToken);
    }

    public async Task<LedgerResult> TransferAsync(Guid workplaceId, Guid shiftId, Guid? from, LedgerPerson to, string source, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var shifts = await LockShiftsAsync(workplaceId, [shiftId], cancellationToken);
        if (shifts.Count != 1)
        {
            return LedgerResult.NotAvailable;
        }
        var shift = shifts[0];
        var holders = await db.Assignments.Where(x => x.ShiftId == shiftId && !x.IsDraft).ToListAsync(cancellationToken);
        if (holders.Any(x => x.MembershipId == to.MembershipId))
        {
            return LedgerResult.Overlap;
        }
        if (from is { } giver ? holders.All(x => x.MembershipId != giver) : holders.Count >= shift.Headcount)
        {
            return LedgerResult.Taken;
        }

        if (from is { } leaving)
        {
            await RemoveAsync(shiftId, leaving, cancellationToken);
        }
        await AddAsync(shift, to, source, cancellationToken);
        return await CommitAsync(shift.PeriodId, transaction, cancellationToken);
    }

    public async Task<LedgerResult> SwapAsync(Guid workplaceId, Guid shiftA, LedgerPerson a, Guid shiftB, LedgerPerson b, bool requireLevels, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var shifts = await LockShiftsAsync(workplaceId, [shiftA, shiftB], cancellationToken);
        if (shifts.Count != 2)
        {
            return LedgerResult.NotAvailable;
        }
        var first = shifts.Single(x => x.Id == shiftA);
        var second = shifts.Single(x => x.Id == shiftB);
        var holders = await db.Assignments.Where(x => (x.ShiftId == shiftA || x.ShiftId == shiftB) && !x.IsDraft).ToListAsync(cancellationToken);
        var onA = holders.Where(x => x.ShiftId == shiftA).Select(x => x.MembershipId).ToList();
        var onB = holders.Where(x => x.ShiftId == shiftB).Select(x => x.MembershipId).ToList();
        if (!onA.Contains(a.MembershipId) || !onB.Contains(b.MembershipId))
        {
            return LedgerResult.Taken;
        }
        if (onA.Contains(b.MembershipId) || onB.Contains(a.MembershipId))
        {
            return LedgerResult.Overlap;
        }
        if (requireLevels)
        {
            var levels = (await directory.GetMembersAsync(workplaceId, cancellationToken)).ToDictionary(x => x.MembershipId, x => x.Level);
            levels[a.MembershipId] = a.Level;
            levels[b.MembershipId] = b.Level;
            bool Covered(Shift shift, IEnumerable<Guid> people) =>
                shift.Requirements.All(r => people.Count(id => levels.GetValueOrDefault(id) >= r.Level) >= r.MinCount);
            if (!Covered(first, onA.Where(x => x != a.MembershipId).Append(b.MembershipId))
                || !Covered(second, onB.Where(x => x != b.MembershipId).Append(a.MembershipId)))
            {
                return LedgerResult.MissingLevel;
            }
        }

        // Both people leave before either arrives, so the no-double-booking rule sees the final state only.
        await RemoveAsync(shiftA, a.MembershipId, cancellationToken);
        await RemoveAsync(shiftB, b.MembershipId, cancellationToken);
        await AddAsync(first, b, Assignment.Trade, cancellationToken);
        await AddAsync(second, a, Assignment.Trade, cancellationToken);
        var result = await CommitAsync(first.PeriodId, transaction, cancellationToken);
        if (result == LedgerResult.Applied && second.PeriodId != first.PeriodId)
        {
            await ScheduleHistory.BumpAsync(db, second.PeriodId, clock.GetCurrentInstant(), cancellationToken);
        }
        return result;
    }

    /// <summary>Locks the rows of published shifts that have not started, in a fixed order so two changes never deadlock.</summary>
    private async Task<List<Shift>> LockShiftsAsync(Guid workplaceId, Guid[] shiftIds, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var locked = await db.Shifts
            .FromSql($"SELECT * FROM scheduling.shift WHERE id = ANY({shiftIds}) AND workplace_id = {workplaceId} ORDER BY id FOR UPDATE")
            .ToListAsync(cancellationToken);
        var periodIds = locked.Select(x => x.PeriodId).Distinct().ToList();
        var published = await db.Periods.Where(x => periodIds.Contains(x.Id) && x.Version > 0).Select(x => x.Id).ToListAsync(cancellationToken);
        var usable = locked.Where(x => published.Contains(x.PeriodId) && x.StartsAt > now).ToList();
        foreach (var shift in usable)
        {
            await db.Entry(shift).Collection(x => x.Requirements).LoadAsync(cancellationToken);
        }
        return usable;
    }

    private Task<int> RemoveAsync(Guid shiftId, Guid membershipId, CancellationToken cancellationToken) =>
        // The published row and the draft's copy go together.
        db.Assignments.Where(x => x.ShiftId == shiftId && x.MembershipId == membershipId).ExecuteDeleteAsync(cancellationToken);

    private async Task AddAsync(Shift shift, LedgerPerson person, string source, CancellationToken cancellationToken)
    {
        var inDraft = await db.Assignments.AnyAsync(x => x.ShiftId == shift.Id && x.MembershipId == person.MembershipId && x.IsDraft, cancellationToken);
        foreach (var draft in inDraft ? new[] { false } : [false, true])
        {
            db.Assignments.Add(new Assignment
            {
                Id = Guid.NewGuid(),
                PeriodId = shift.PeriodId,
                ShiftId = shift.Id,
                MembershipId = person.MembershipId,
                UserId = person.UserId,
                IsDraft = draft,
                Source = source,
                StartsAt = shift.StartsAt,
                EndsAt = shift.EndsAt,
            });
        }
    }

    private async Task<LedgerResult> CommitAsync(Guid periodId, Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await ScheduleHistory.BumpAsync(db, periodId, clock.GetCurrentInstant(), cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return LedgerResult.Applied;
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation })
        {
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return LedgerResult.Overlap;
        }
    }

    private async Task<IReadOnlyList<LiveShift>> ToLiveAsync(Guid workplaceId, List<Shift> shifts, CancellationToken cancellationToken)
    {
        if (shifts.Count == 0)
        {
            return [];
        }
        var shiftIds = shifts.Select(x => x.Id).ToList();
        var holders = await db.Assignments.AsNoTracking().Where(x => shiftIds.Contains(x.ShiftId) && !x.IsDraft).ToListAsync(cancellationToken);
        var levels = (await directory.GetMembersAsync(workplaceId, cancellationToken)).ToDictionary(x => x.MembershipId, x => x.Level);
        return shifts.Select(shift => new LiveShift(
            shift.Id,
            shift.PeriodId,
            shift.Date,
            shift.StartTime,
            shift.EndTime,
            shift.StartsAt,
            shift.EndsAt,
            shift.Headcount,
            shift.Requirements.Select(x => new LiveRequirement(x.Level, x.MinCount)).ToList(),
            holders.Where(x => x.ShiftId == shift.Id)
                .Select(x => new LedgerPerson(x.MembershipId, x.UserId, levels.GetValueOrDefault(x.MembershipId)))
                .ToList())).ToList();
    }
}

/// <summary>
/// Nobody who has left stays on the schedule: their future shifts become open (FR-038, M5-10). Each published
/// period that changes gets a new version, like any other change to the live schedule (FR-164). Running it
/// twice changes nothing: the second run finds no shifts, so it adds no version.
/// </summary>
internal sealed class ReleaseShiftsOnLeave(SchedulingDb db, IClock clock) : IMemberLeftHandler
{
    public async Task HandleAsync(Guid workplaceId, Guid membershipId, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var periods = db.Periods.Where(x => x.WorkplaceId == workplaceId).Select(x => x.Id);
        var released = db.Assignments.Where(x => x.MembershipId == membershipId && x.StartsAt > now && periods.Contains(x.PeriodId));

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var changedLive = await released.Where(x => !x.IsDraft).Select(x => x.PeriodId).Distinct().ToListAsync(cancellationToken);
        await released.ExecuteDeleteAsync(cancellationToken);
        foreach (var periodId in changedLive.Order())
        {
            await ScheduleHistory.BumpAsync(db, periodId, now, cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
    }
}

/// <summary>Every change to the live schedule is a new version, kept as history (FR-164).</summary>
internal static class ScheduleHistory
{
    /// <summary>Raises the period's version and stores a snapshot of its live assignments, as they are now.</summary>
    public static async Task BumpAsync(SchedulingDb db, Guid periodId, Instant now, CancellationToken cancellationToken)
    {
        var period = await db.Periods.SingleAsync(x => x.Id == periodId, cancellationToken);
        var live = await db.Assignments.AsNoTracking().Where(x => x.PeriodId == periodId && !x.IsDraft).ToListAsync(cancellationToken);
        period.Version++;
        db.ScheduleVersions.Add(new ScheduleVersion
        {
            Id = Guid.NewGuid(),
            PeriodId = periodId,
            Version = period.Version,
            PublishedAt = now,
            PublishedBy = Guid.Empty,
            Snapshot = DraftEndpoints.Snapshot(live),
        });
        await db.SaveChangesAsync(cancellationToken);
    }
}
