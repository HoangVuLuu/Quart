using System.Globalization;

namespace Quart.Generator;

/// <summary>The grade of a schedule: its score and everything wrong with it.</summary>
/// <param name="Score">0 is perfect; every problem takes points off, so a higher score is a better schedule.</param>
/// <param name="Issues">Grouped by type in <see cref="IssueCodes.All"/> order, then in the input's order of shifts and members.</param>
public sealed record Evaluation(int Score, IReadOnlyList<GeneratorIssue> Issues);

/// <summary>
/// The one rulebook (AD-002, spec 7.1). It grades any schedule, whoever built it: the generator
/// optimises this score, and the issues dashboard shows this list. They cannot disagree because they
/// are the same code, so never write a second set of checks anywhere else.
/// </summary>
public static class Evaluator
{
    // Points taken off per problem. Spec 7.4 orders the soft goals: fill every slot, then levels, then
    // hours, then fairness, then avoiding doubles; the weights fall in that order. Filling a slot always
    // pays: it moves someone at most one shift (6 or 7 hours, 60 or 70 points) from their target, far
    // less than the 1 000 an empty slot costs.

    /// <summary>
    /// A hard rule broken (spec 7.3, BR-036): someone unavailable or who never sent availability, a
    /// shift past the consecutive limit, an incompatible pair. The generator never does this; only a
    /// manual edit or a lock can, and nothing else a schedule gains may pay for it.
    /// </summary>
    public const int HardRuleWeight = 10_000;

    /// <summary>Per missing person on a shift (BR-010, the highest soft goal).</summary>
    public const int EmptySlotWeight = 1_000;

    /// <summary>Per person missing from a level requirement (BR-011).</summary>
    public const int MissingLevelWeight = 500;

    /// <summary>Per hour away from a person's desired hours over the period, in either direction (BR-012).</summary>
    public const int HoursWeight = 10;

    // BR-013 and BR-014 (fairness) come with M1-05, between hours and doubles.

    /// <summary>
    /// Per extra shift someone works in one day (BR-015, the lowest goal: a last resort, not forbidden).
    /// Just under one shift's worth of hours, so getting people to their hours wins over avoiding a
    /// double. Keeping doubles to a last resort is the algorithm's job (M1-05), not only this weight's.
    /// </summary>
    public const int DoubleShiftWeight = 50;

    /// <summary>Under or over hours is reported only beyond this many hours over the period (BR-033).</summary>
    public const decimal HoursTolerance = 2m;

    /// <summary>Grades <paramref name="assignments"/> against <paramref name="input"/>.</summary>
    /// <exception cref="ArgumentException">
    /// The input is not valid, or an assignment names an unknown shift or member, or puts someone on the same shift twice.
    /// </exception>
    public static Evaluation Evaluate(GeneratorInput input, IReadOnlyList<Assignment> assignments)
    {
        GeneratorInputValidator.ThrowIfInvalid(input);
        var context = new Context(input, assignments);

        var issues = new List<GeneratorIssue>();
        var penalty = 0L;
        penalty += Headcount(context, issues);
        penalty += Levels(context, issues);
        penalty += Availability(context, issues);
        penalty += Hours(context, issues);
        penalty += Consecutive(context, issues);
        penalty += Doubles(context, issues);
        penalty += Pairs(context, issues);

        var ordered = issues.OrderBy(issue => IssueOrder[issue.Code]).ToList(); // stable: keeps input order within a type
        return new Evaluation(checked((int)-penalty), ordered);
    }

    private static readonly Dictionary<string, int> IssueOrder =
        IssueCodes.All.Select((code, index) => (code, index)).ToDictionary(pair => pair.code, pair => pair.index);

    private static long Headcount(Context context, List<GeneratorIssue> issues)
    {
        var penalty = 0L;
        foreach (var shift in context.Input.Shifts)
        {
            var assigned = context.OnShift(shift.Id).Count;
            if (assigned < shift.Headcount)
            {
                penalty += (long)(shift.Headcount - assigned) * EmptySlotWeight;
                issues.Add(Issue(IssueCodes.BelowHeadcount, [shift.Id], [], ("assigned", Number(assigned)), ("headcount", Number(shift.Headcount))));
            }
        }
        return penalty;
    }

    private static long Levels(Context context, List<GeneratorIssue> issues)
    {
        var penalty = 0L;
        foreach (var shift in context.Input.Shifts)
        {
            var levels = context.OnShift(shift.Id).Select(memberId => context.Members[memberId].Level).ToList();
            foreach (var requirement in shift.LevelRequirements)
            {
                // Levels are a ladder: a level 3 counts toward a level 2 requirement (FR-066).
                var present = levels.Count(level => level >= requirement.Level);
                if (present < requirement.MinCount)
                {
                    penalty += (long)(requirement.MinCount - present) * MissingLevelWeight;
                    issues.Add(Issue(IssueCodes.MissingLevel, [shift.Id], [],
                        ("level", Number(requirement.Level)), ("required", Number(requirement.MinCount)), ("present", Number(present))));
                }
            }
        }
        return penalty;
    }

    private static long Availability(Context context, List<GeneratorIssue> issues)
    {
        var penalty = 0L;
        foreach (var shift in context.Input.Shifts)
        {
            foreach (var memberId in context.OnShift(shift.Id))
            {
                if (!context.Submitted.Contains(memberId))
                {
                    penalty += HardRuleWeight;
                    issues.Add(Issue(IssueCodes.NotSubmitted, [shift.Id], [memberId]));
                }
                else if (!context.Available.Contains((memberId, shift.Id)))
                {
                    penalty += HardRuleWeight;
                    issues.Add(Issue(IssueCodes.Unavailable, [shift.Id], [memberId]));
                }
            }
        }
        return penalty;
    }

    private static long Hours(Context context, List<GeneratorIssue> issues)
    {
        var penalty = 0L;
        foreach (var member in context.Input.Members)
        {
            // Someone who never sent availability cannot be scheduled, so their missing hours are not a
            // problem with the schedule. The "not sent" list already tells the admin about them.
            if (!context.Submitted.Contains(member.Id))
            {
                continue;
            }

            var hours = context.ShiftsOf(member.Id).Sum(shift => HoursOf(shift));
            var target = member.DesiredWeeklyHours * context.Weeks;
            var gap = hours - target;
            penalty += (long)Math.Round(Math.Abs(gap) * HoursWeight, MidpointRounding.AwayFromZero);
            if (Math.Abs(gap) > HoursTolerance)
            {
                issues.Add(Issue(gap < 0 ? IssueCodes.UnderHours : IssueCodes.OverHours, [], [member.Id],
                    ("hours", Number(hours)), ("target", Number(target))));
            }
        }
        return penalty;
    }

    private static long Consecutive(Context context, List<GeneratorIssue> issues)
    {
        if (context.Input.Rules.MaxConsecutiveShifts is not int max)
        {
            return 0;
        }

        var penalty = 0L;
        foreach (var member in context.Input.Members)
        {
            // Every shift counts as one, whatever its day; a calendar day without one of the person's
            // shifts ends the run (BR-005). Opening and closing Monday, then opening Tuesday, is 3.
            var run = new List<GeneratorShift>();
            foreach (var shift in context.ShiftsOf(member.Id).Append(null))
            {
                if (shift is not null && (run.Count == 0 || shift.Date.DayNumber - run[^1].Date.DayNumber <= 1))
                {
                    run.Add(shift);
                    continue;
                }

                if (run.Count > max)
                {
                    penalty += (long)(run.Count - max) * HardRuleWeight;
                    issues.Add(Issue(IssueCodes.ConsecutiveShifts, run.Select(s => s.Id).ToList(), [member.Id],
                        ("count", Number(run.Count)), ("max", Number(max))));
                }
                run = shift is null ? [] : [shift];
            }
        }
        return penalty;
    }

    private static long Doubles(Context context, List<GeneratorIssue> issues)
    {
        var penalty = 0L;
        foreach (var member in context.Input.Members)
        {
            foreach (var day in context.ShiftsOf(member.Id).GroupBy(shift => shift.Date).Where(day => day.Count() > 1))
            {
                penalty += (long)(day.Count() - 1) * DoubleShiftWeight;
                issues.Add(Issue(IssueCodes.DoubleShift, day.Select(shift => shift.Id).ToList(), [member.Id],
                    ("date", day.Key.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), ("count", Number(day.Count()))));
            }
        }
        return penalty;
    }

    private static long Pairs(Context context, List<GeneratorIssue> issues)
    {
        var penalty = 0L;
        foreach (var shift in context.Input.Shifts)
        {
            var onShift = context.OnShift(shift.Id);
            foreach (var pair in context.Input.ConflictPairs.Where(pair => pair.BlockId == shift.BlockId))
            {
                // A lock can force a pair together; the lock wins and the pair is flagged (BR-036).
                if (onShift.Contains(pair.MemberA) && onShift.Contains(pair.MemberB))
                {
                    penalty += HardRuleWeight;
                    issues.Add(Issue(IssueCodes.IncompatiblePair, [shift.Id], [pair.MemberA, pair.MemberB]));
                }
            }
        }
        return penalty;
    }

    /// <summary>The full shift length; no unpaid break is deducted (BR-031).</summary>
    private static decimal HoursOf(GeneratorShift shift) => (decimal)(shift.End - shift.Start).TotalMinutes / 60m;

    private static string Number(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static GeneratorIssue Issue(string code, IReadOnlyList<string> shiftIds, IReadOnlyList<string> memberIds, params (string Key, string Value)[] parameters) =>
        new(code, shiftIds, memberIds, parameters.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal));

    /// <summary>The input indexed once for every check.</summary>
    private sealed class Context
    {
        private readonly Dictionary<string, List<string>> onShift;
        private readonly Dictionary<string, List<GeneratorShift>> shiftsOf;

        public Context(GeneratorInput input, IReadOnlyList<Assignment> assignments)
        {
            ArgumentNullException.ThrowIfNull(assignments);
            Input = input;
            Members = input.Members.ToDictionary(member => member.Id, StringComparer.Ordinal);
            var shifts = input.Shifts.ToDictionary(shift => shift.Id, StringComparer.Ordinal);
            Submitted = input.Availability.Where(entry => entry.Submitted).Select(entry => entry.MemberId).ToHashSet(StringComparer.Ordinal);
            Available = input.Availability.Where(entry => entry.Submitted)
                .SelectMany(entry => entry.ShiftIds.Select(shiftId => (entry.MemberId, shiftId)))
                .ToHashSet();

            onShift = input.Shifts.ToDictionary(shift => shift.Id, _ => new List<string>(), StringComparer.Ordinal);
            shiftsOf = input.Members.ToDictionary(member => member.Id, _ => new List<GeneratorShift>(), StringComparer.Ordinal);
            foreach (var assignment in assignments)
            {
                if (assignment is null || !shifts.TryGetValue(assignment.ShiftId, out var shift) || !Members.ContainsKey(assignment.MemberId))
                {
                    throw new ArgumentException($"The assignment {assignment} names an unknown shift or member.", nameof(assignments));
                }
                if (onShift[shift.Id].Contains(assignment.MemberId))
                {
                    throw new ArgumentException($"{assignment.MemberId} is on {shift.Id} twice.", nameof(assignments));
                }
                onShift[shift.Id].Add(assignment.MemberId);
                shiftsOf[assignment.MemberId].Add(shift);
            }
            foreach (var list in shiftsOf.Values)
            {
                list.Sort((a, b) => (a.Date, a.Start, a.End).CompareTo((b.Date, b.Start, b.End)));
            }

            // Desired hours are weekly (BR-032); the period is as many weeks as its shifts span, counted from its first day.
            Weeks = input.Shifts.Count == 0
                ? 0
                : (input.Shifts.Max(shift => shift.Date.DayNumber) - input.Shifts.Min(shift => shift.Date.DayNumber)) / 7 + 1;
        }

        public GeneratorInput Input { get; }

        public Dictionary<string, GeneratorMember> Members { get; }

        public HashSet<string> Submitted { get; }

        public HashSet<(string MemberId, string ShiftId)> Available { get; }

        public int Weeks { get; }

        public List<string> OnShift(string shiftId) => onShift[shiftId];

        /// <summary>The member's shifts in time order.</summary>
        public List<GeneratorShift> ShiftsOf(string memberId) => shiftsOf[memberId];
    }
}
