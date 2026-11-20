using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Generator;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel.Directory;

namespace Quart.Modules.Scheduling.Drafts;

using Assignment = Persistence.Assignment;
using Period = Persistence.Period;

/// <summary>
/// Turns a period into the generator's input and back (M5-01). This is the only place NodaTime values
/// become plain dates and times, and the only place the evaluator is called for real data (AD-002): the
/// draft screen, the issues list and the publish checks all read the same evaluation.
/// </summary>
internal sealed class DraftBuilder(SchedulingDb db, IWorkplaceDirectory directory)
{
    /// <summary>Everything about a period the generator and the evaluator need, loaded once.</summary>
    public async Task<PeriodData> LoadAsync(Period period, CancellationToken cancellationToken)
    {
        var shifts = await db.Shifts.AsNoTracking()
            .Include(x => x.Requirements)
            .Where(x => x.PeriodId == period.Id)
            .OrderBy(x => x.Date).ThenBy(x => x.StartTime).ThenBy(x => x.EndTime)
            .ToListAsync(cancellationToken);
        var members = (await directory.GetMembersAsync(period.WorkplaceId, cancellationToken)).Where(x => x.WorksShifts).ToList();
        var availabilities = await db.Availabilities.AsNoTracking()
            .Include(x => x.Blocks)
            .Where(x => x.PeriodId == period.Id)
            .ToListAsync(cancellationToken);
        var conflicts = await db.PeriodConflicts.AsNoTracking().Where(x => x.PeriodId == period.Id).ToListAsync(cancellationToken);
        var busy = await BusyElsewhere.LoadAsync(db, period, members.Select(x => x.UserId).ToList(), cancellationToken);
        return new PeriodData(period, shifts, members, availabilities, conflicts, busy);
    }

    public Task<List<Assignment>> AssignmentsAsync(Guid periodId, bool draft, CancellationToken cancellationToken) =>
        db.Assignments.Where(x => x.PeriodId == periodId && x.IsDraft == draft).ToListAsync(cancellationToken);

    /// <param name="locked">Assignments the generator must keep exactly (BR-004).</param>
    public static GeneratorInput ToInput(PeriodData data, IEnumerable<Assignment> locked, int seed)
    {
        var rules = Support.RulesOf(data.Period);
        var memberIds = data.Members.Select(x => x.MembershipId).ToHashSet();
        var shiftIds = data.Shifts.Select(x => x.Id).ToHashSet();
        return new GeneratorInput(
            data.Shifts.Select(x => new GeneratorShift(
                Id(x.Id),
                Id(x.SourceBlockId),
                x.Date.ToDateOnly(),
                x.StartTime.ToTimeOnly(),
                x.EndTime.ToTimeOnly(),
                x.Headcount,
                x.Requirements.Select(r => new LevelRequirement(r.Level, r.MinCount)).ToList())).ToList(),
            // Someone with no number for this period (they have not sent) wants 0; their hours issues are dropped in Evaluate.
            data.Members.Select(x => new GeneratorMember(Id(x.MembershipId), x.Level, DesiredOf(data, x) ?? 0, x.MaxWeeklyHours)).ToList(),
            data.Availabilities
                .Where(x => memberIds.Contains(x.MembershipId))
                // FR-099: someone who has not sent is never treated as available, whatever their draft says.
                .Select(x => new MemberAvailability(
                    Id(x.MembershipId),
                    x.Status == Persistence.Availability.Sent,
                    x.Status == Persistence.Availability.Sent ? x.Blocks.Select(b => Id(b.ShiftId)).ToList() : []))
                .ToList(),
            // Shifts held at other workplaces (BR-002, M5-11): the generator never places someone on an overlapping
            // shift, and the evaluator reports a hand placement there as "not available" (FR-094).
            BusyTimesOf(data),
            locked.Where(x => memberIds.Contains(x.MembershipId) && shiftIds.Contains(x.ShiftId))
                .Select(x => new Generator.Assignment(Id(x.ShiftId), Id(x.MembershipId))).ToList(),
            data.Conflicts
                .Where(x => memberIds.Contains(x.MembershipA) && memberIds.Contains(x.MembershipB))
                .Select(x => new ConflictPair(Id(x.BlockId), Id(x.MembershipA), Id(x.MembershipB))).ToList(),
            new GeneratorRules(rules.MaxConsecutiveShifts, rules.OpeningFairness, rules.ClosingFairness),
            seed);
    }

    private static List<BusyTime> BusyTimesOf(PeriodData data)
    {
        var zone = DateTimeZoneProviders.Tzdb[data.Period.TimeZone];
        var memberOf = data.Members.ToDictionary(x => x.UserId, x => x.MembershipId);
        return data.Busy
            .Where(x => memberOf.ContainsKey(x.UserId))
            .Select(x => new BusyTime(
                Id(memberOf[x.UserId]),
                x.Start.InZone(zone).LocalDateTime.ToDateTimeUnspecified(),
                x.End.InZone(zone).LocalDateTime.ToDateTimeUnspecified()))
            .ToList();
    }

    /// <summary>Whether the person works at another workplace during this shift. Says nothing about where (FR-094).</summary>
    public static bool IsBusyElsewhere(PeriodData data, Guid membershipId, Shift shift)
    {
        var userId = data.Members.FirstOrDefault(x => x.MembershipId == membershipId)?.UserId;
        return userId is { } id && data.Busy.Any(x => x.UserId == id && x.Overlaps(shift));
    }

    /// <summary>
    /// The weekly hours the person asked for in this period's availability, capped at the manager's maximum
    /// (BR-032). Null when they have not sent it: there is no target to be under or over.
    /// </summary>
    public static decimal? DesiredOf(PeriodData data, WorkplaceMember member)
    {
        var availability = data.Availabilities.FirstOrDefault(x => x.MembershipId == member.MembershipId);
        if (availability is not { Status: Persistence.Availability.Sent, DesiredWeeklyHours: { } wanted })
        {
            return null;
        }
        return member.MaxWeeklyHours is { } max && wanted > max ? max : wanted;
    }

    /// <summary>Grades a set of assignments with the one rulebook (AD-002).</summary>
    public static Evaluation Evaluate(PeriodData data, IReadOnlyCollection<Assignment> assignments)
    {
        var input = ToInput(data, [], seed: 0);
        var memberIds = data.Members.Select(x => x.MembershipId).ToHashSet();
        // Someone who left since they were placed is no longer a member the evaluator knows.
        var graded = assignments
            .Where(x => memberIds.Contains(x.MembershipId))
            .Select(x => new Generator.Assignment(Id(x.ShiftId), Id(x.MembershipId)))
            .ToList();
        var evaluation = Evaluator.Evaluate(input, graded);
        // Without a number for the period there is nothing to be under or over (BR-032, BR-033).
        var noTarget = data.Members.Where(x => DesiredOf(data, x) is null).Select(x => Id(x.MembershipId)).ToHashSet();
        return evaluation with
        {
            Issues = evaluation.Issues
                .Where(x => !(x.Code is IssueCodes.UnderHours or IssueCodes.OverHours && x.MemberIds.All(noTarget.Contains)))
                .ToList(),
        };
    }

    public static string Id(Guid id) => id.ToString("D");
}

internal sealed record PeriodData(
    Period Period,
    IReadOnlyList<Shift> Shifts,
    IReadOnlyList<WorkplaceMember> Members,
    IReadOnlyList<Persistence.Availability> Availabilities,
    IReadOnlyList<PeriodConflict> Conflicts,
    IReadOnlyList<BusySlot> Busy);
