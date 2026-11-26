using System.Globalization;

namespace Quart.Generator;

/// <summary>The grade of a schedule: its score and everything wrong with it.</summary>
/// <param name="Score">0 is perfect; every problem takes points off, so a higher score is a better schedule.</param>
/// <param name="Issues">Grouped by type in <see cref="IssueCodes.All"/> order, then in the input's order of shifts and members.</param>
/// <param name="Members">Each member's totals, in the input's order of members.</param>
public sealed record Evaluation(int Score, IReadOnlyList<GeneratorIssue> Issues, IReadOnlyList<MemberSummary> Members);

/// <summary>
/// The one rulebook (AD-002, spec 7.1). It grades any schedule, whoever built it: the generator
/// optimises this score, and the issues dashboard shows this list. They cannot disagree because they
/// are the same code, so never write a second set of checks anywhere else.
/// </summary>
public static class Evaluator
{
    // Points taken off per problem. Spec 7.4 orders the soft goals (Hoang, 2026-11-26): fill every slot,
    // then levels, then avoid doubles, then people below their desired hours before people who reached
    // them, then an equal number of shifts, then opening and closing fairness, then hours close to desired.
    // Each goal outweighs every goal below it put together, for any one change the generator makes (adding,
    // replacing or swapping one person), so the score and the greedy construction agree on the order and
    // local search never undoes it. Filling a slot always pays: at most a double (6 000), an extra shift
    // (2 000), the equal-shifts cost of a 14th shift in one week (2 600) and a little fairness and hours,
    // far less than the 30 000 an empty slot costs. The levels gap is held for realistic weeks (up to about
    // 10 shifts per person); fairness is a fraction, so in rare near-ties it can still edge out a goal above.

    /// <summary>
    /// A hard rule broken (spec 7.3, BR-036, <see cref="IssueCodes.HardRules"/>): someone unavailable
    /// or who never sent availability, an overfilled shift, overlapping shifts, a week past someone's
    /// maximum hours, a shift past the consecutive limit, an incompatible pair. The generator never does this (its
    /// <see cref="CandidateFilter"/> stops it); only a manual edit or a lock can, and nothing else a
    /// schedule gains may pay for it.
    /// </summary>
    public const int HardRuleWeight = 300_000;

    /// <summary>Per missing person on a shift (BR-010, the highest soft goal).</summary>
    public const int EmptySlotWeight = 30_000;

    /// <summary>Per person missing from a level requirement (BR-011).</summary>
    public const int MissingLevelWeight = 15_000;

    /// <summary>
    /// Per extra shift someone works in one day (BR-015). Above everything about hours and shares: someone
    /// who already reached their hours but is free that day goes before someone below their hours who would
    /// need a double (Hoang, 2026-11-26).
    /// </summary>
    public const int DoubleShiftWeight = 6_000;

    /// <summary>
    /// Per extra shift, in each week (BR-012): a shift the person could lose and still have their desired
    /// hours that week, counting their shortest shifts first. Reaching your hours never stops you getting
    /// shifts, it puts you last in line: a shift goes to someone still below their hours whenever that
    /// avoids a double. Bigger than the equal-shifts cost of a gap of up to 9 shifts in one week between two people.
    /// </summary>
    public const int ExtraShiftWeight = 2_000;

    /// <summary>
    /// Times n × (n - 1), where n is a person's number of shifts in one week (BR-012). The first shift of
    /// a week is free and each additional one costs more than the one before (2, 4, 6... times this), so
    /// a schedule with nothing wrong still scores 0. Moving a shift from
    /// someone with more to someone with fewer always scores higher, which is what makes the counts as
    /// equal as possible. Per week, so each person's shifts also spread over the weeks. Counts shifts, not
    /// hours: an opening and a closing count the same. The smallest such gain (twice this) is above what
    /// one change usually does to fairness and hours.
    /// </summary>
    public const int EqualShiftsWeight = 100;

    /// <summary>
    /// Times the square of how many shifts someone is away from their expected openings, and again for
    /// closings, when that fairness switch is on (BR-013, BR-014, BR-020). Above hours on purpose: an
    /// opening is 6 hours and a closing 7, so trading one for the other moves hours by 1, and that must
    /// not block a fairer trade. Squared, so two people half a shift off cost less than one person a shift
    /// and a half off: a trade that evens two people out always scores higher, which is what keeps everyone
    /// within about one shift of fair. Expected is proportional to what each person is available for
    /// (BR-021, BR-022): see <see cref="MemberSummary.ExpectedOpenings"/>.
    /// </summary>
    public const int FairnessWeight = 20;

    /// <summary>
    /// Per hour away from a person's desired weekly hours, in either direction, counted in each week of
    /// the period (BR-012), the lowest goal: only a tie-breaker between schedules that are otherwise as
    /// good. Under and over hours are still reported over the whole period (BR-033).
    /// </summary>
    public const int HoursWeight = 1;

    /// <summary>Under or over hours is reported only beyond this many hours over the period (BR-033).</summary>
    public const decimal HoursTolerance = 2m;

    /// <summary>Grades <paramref name="assignments"/> against <paramref name="input"/>.</summary>
    /// <exception cref="ArgumentException">
    /// The input is not valid, or an assignment names an unknown shift or member, or puts someone on the same shift twice.
    /// </exception>
    public static Evaluation Evaluate(GeneratorInput input, IReadOnlyList<Assignment> assignments)
    {
        GeneratorInputValidator.ThrowIfInvalid(input);
        return Evaluate(new Rulebook(input), assignments);
    }

    /// <summary><see cref="Evaluate"/> for an input already checked and prepared once.</summary>
    internal static Evaluation Evaluate(Rulebook rulebook, IReadOnlyList<Assignment> assignments)
    {
        var context = new Context(rulebook, assignments);
        var issues = new List<GeneratorIssue>();
        var penalty = Penalty(context, issues);
        var ordered = issues.OrderBy(issue => IssueOrder[issue.Code]).ToList(); // stable: keeps input order within a type
        return new Evaluation(checked((int)-penalty), ordered, context.Summaries);
    }

    /// <summary>
    /// Only the score, the same as <see cref="Evaluate"/> gives, without writing out the issues: local
    /// search grades thousands of variations of one input (M1-05).
    /// </summary>
    internal static int Score(Rulebook rulebook, IReadOnlyList<Assignment> assignments) =>
        checked((int)-Penalty(new Context(rulebook, assignments), issues: null));

    /// <summary>Every check, in one place. With <paramref name="issues"/> null, nothing is written out.</summary>
    private static long Penalty(Context context, List<GeneratorIssue>? issues)
    {
        var penalty = 0L;
        penalty += Headcount(context, issues);
        penalty += Levels(context, issues);
        penalty += Availability(context, issues);
        penalty += Overlaps(context, issues);
        penalty += Hours(context, issues);
        penalty += MaxHours(context, issues);
        penalty += Consecutive(context, issues);
        penalty += Doubles(context, issues);
        penalty += Pairs(context, issues);
        penalty += Shares(context);
        penalty += Fairness(context);
        return penalty;
    }

    private static readonly Dictionary<string, int> IssueOrder =
        IssueCodes.All.Select((code, index) => (code, index)).ToDictionary(pair => pair.code, pair => pair.index);

    private static long Headcount(Context context, List<GeneratorIssue>? issues)
    {
        var penalty = 0L;
        foreach (var shift in context.Input.Shifts)
        {
            var assigned = context.OnShift(shift.Id).Count;
            if (assigned < shift.Headcount)
            {
                penalty += (long)(shift.Headcount - assigned) * EmptySlotWeight;
                issues?.Add(Issue(IssueCodes.BelowHeadcount, [shift.Id], [], ("assigned", Number(assigned)), ("headcount", Number(shift.Headcount))));
            }
            else if (assigned > shift.Headcount)
            {
                penalty += (long)(assigned - shift.Headcount) * HardRuleWeight;
                issues?.Add(Issue(IssueCodes.AboveHeadcount, [shift.Id], [], ("assigned", Number(assigned)), ("headcount", Number(shift.Headcount))));
            }
        }
        return penalty;
    }

    private static long Levels(Context context, List<GeneratorIssue>? issues)
    {
        var penalty = 0L;
        foreach (var shift in context.Input.Shifts)
        {
            foreach (var requirement in shift.LevelRequirements)
            {
                // Levels are a ladder: a level 3 counts toward a level 2 requirement (FR-066).
                var present = 0;
                foreach (var memberId in context.OnShift(shift.Id))
                {
                    if (context.Members[memberId].Level >= requirement.Level)
                    {
                        present++;
                    }
                }
                if (present < requirement.MinCount)
                {
                    penalty += (long)(requirement.MinCount - present) * MissingLevelWeight;
                    issues?.Add(Issue(IssueCodes.MissingLevel, [shift.Id], [],
                        ("level", Number(requirement.Level)), ("required", Number(requirement.MinCount)), ("present", Number(present))));
                }
            }
        }
        return penalty;
    }

    private static long Availability(Context context, List<GeneratorIssue>? issues)
    {
        var penalty = 0L;
        foreach (var shift in context.Input.Shifts)
        {
            foreach (var memberId in context.OnShift(shift.Id))
            {
                if (!context.Submitted.Contains(memberId))
                {
                    penalty += HardRuleWeight;
                    issues?.Add(Issue(IssueCodes.NotSubmitted, [shift.Id], [memberId]));
                }
                else if (!context.Available.Contains((memberId, shift.Id)))
                {
                    penalty += HardRuleWeight;
                    issues?.Add(Issue(IssueCodes.Unavailable, [shift.Id], [memberId]));
                }
            }
        }
        return penalty;
    }

    private static long Overlaps(Context context, List<GeneratorIssue>? issues)
    {
        var penalty = 0L;
        foreach (var member in context.Input.Members)
        {
            // Time order: once a later shift starts after this one ends, so do all the ones after it.
            var shifts = context.ShiftsOf(member.Id);
            for (var i = 0; i < shifts.Count; i++)
            {
                for (var j = i + 1; j < shifts.Count && HardRules.Overlap(shifts[i], shifts[j]); j++)
                {
                    penalty += HardRuleWeight;
                    issues?.Add(Issue(IssueCodes.OverlappingShifts, [shifts[i].Id, shifts[j].Id], [member.Id]));
                }
            }
        }
        return penalty;
    }

    private static long Hours(Context context, List<GeneratorIssue>? issues)
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

            var weekly = context.WeeklyHours(member.Id);
            var distance = 0m;
            foreach (var weekHours in weekly)
            {
                distance += Math.Abs(weekHours - member.DesiredWeeklyHours);
            }
            penalty += (long)Math.Round(distance * HoursWeight, MidpointRounding.AwayFromZero);

            var hours = weekly.Sum();
            var target = member.DesiredWeeklyHours * context.Weeks;
            var gap = hours - target;
            if (Math.Abs(gap) > HoursTolerance)
            {
                issues?.Add(Issue(gap < 0 ? IssueCodes.UnderHours : IssueCodes.OverHours, [], [member.Id],
                    ("hours", Number(hours)), ("target", Number(target))));
            }
        }
        return penalty;
    }

    private static long MaxHours(Context context, List<GeneratorIssue>? issues)
    {
        var penalty = 0L;
        foreach (var member in context.Input.Members)
        {
            if (member.MaxWeeklyHours is not decimal max)
            {
                continue;
            }

            var weekly = context.WeeklyHours(member.Id);
            for (var week = 0; week < weekly.Length; week++)
            {
                if (weekly[week] > max)
                {
                    penalty += HardRuleWeight;
                    issues?.Add(Issue(IssueCodes.OverMaxHours,
                        context.ShiftsOf(member.Id).Where(shift => context.WeekOf(shift) == week).Select(shift => shift.Id).ToList(), [member.Id],
                        ("week", Number(week + 1)), ("hours", Number(weekly[week])), ("max", Number(max))));
                }
            }
        }
        return penalty;
    }

    private static long Consecutive(Context context, List<GeneratorIssue>? issues)
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
                    issues?.Add(Issue(IssueCodes.ConsecutiveShifts, run.Select(s => s.Id).ToList(), [member.Id],
                        ("count", Number(run.Count)), ("max", Number(max))));
                }
                run = shift is null ? [] : [shift];
            }
        }
        return penalty;
    }

    private static long Doubles(Context context, List<GeneratorIssue>? issues)
    {
        var penalty = 0L;
        foreach (var member in context.Input.Members)
        {
            // The shifts are in time order, so a day's shifts sit next to each other.
            var shifts = context.ShiftsOf(member.Id);
            for (var first = 0; first < shifts.Count;)
            {
                var next = first + 1;
                while (next < shifts.Count && shifts[next].Date == shifts[first].Date)
                {
                    next++;
                }
                var count = next - first;
                if (count > 1)
                {
                    penalty += (long)(count - 1) * DoubleShiftWeight;
                    issues?.Add(Issue(IssueCodes.DoubleShift, shifts.Skip(first).Take(count).Select(shift => shift.Id).ToList(), [member.Id],
                        ("date", shifts[first].Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), ("count", Number(count))));
                }
                first = next;
            }
        }
        return penalty;
    }

    private static long Pairs(Context context, List<GeneratorIssue>? issues)
    {
        var penalty = 0L;
        foreach (var shift in context.Input.Shifts)
        {
            var onShift = context.OnShift(shift.Id);
            if (!context.PairsByBlock.TryGetValue(shift.BlockId, out var pairs))
            {
                continue;
            }
            foreach (var pair in pairs)
            {
                // A lock can force a pair together; the lock wins and the pair is flagged (BR-036).
                if (onShift.Contains(pair.MemberA) && onShift.Contains(pair.MemberB))
                {
                    penalty += HardRuleWeight;
                    issues?.Add(Issue(IssueCodes.IncompatiblePair, [shift.Id], [pair.MemberA, pair.MemberB]));
                }
            }
        }
        return penalty;
    }

    /// <summary>
    /// The equal share of shifts (BR-012), per person and per week: extra shifts beyond desired hours, then
    /// a cost that grows faster with each shift. No issue type: like fairness, it only moves the score. Locks count too.
    /// </summary>
    private static long Shares(Context context)
    {
        var penalty = 0L;
        foreach (var member in context.Input.Members)
        {
            // Someone who never sent availability is never scheduled by the generator; any shifts they
            // have are locks, already flagged as a broken rule.
            if (!context.Submitted.Contains(member.Id))
            {
                continue;
            }

            var byWeek = new List<decimal>[context.Weeks];
            foreach (var shift in context.ShiftsOf(member.Id))
            {
                (byWeek[context.WeekOf(shift)] ??= []).Add(HardRules.Hours(shift));
            }
            foreach (var shifts in byWeek)
            {
                if (shifts is null)
                {
                    continue;
                }
                penalty += (long)shifts.Count * (shifts.Count - 1) * EqualShiftsWeight;
                penalty += (long)ExtraShifts(shifts, member.DesiredWeeklyHours) * ExtraShiftWeight;
            }
        }
        return penalty;
    }

    /// <summary>
    /// How many of one week's shifts the person could lose and still have <paramref name="desired"/>
    /// hours, losing the shortest first so as many count as possible.
    /// </summary>
    internal static int ExtraShifts(IReadOnlyList<decimal> shiftHours, decimal desired)
    {
        var left = shiftHours.Sum();
        var extra = 0;
        foreach (var hours in shiftHours.Order())
        {
            if (left - hours < desired)
            {
                break;
            }
            left -= hours;
            extra++;
        }
        return extra;
    }

    /// <summary>No issue type: fairness only moves the score, as FR-143 lists no fairness issue.</summary>
    private static long Fairness(Context context)
    {
        var rules = context.Input.Rules;
        if (!rules.OpeningFairness && !rules.ClosingFairness)
        {
            return 0;
        }

        var penalty = 0m;
        foreach (var summary in context.Summaries)
        {
            if (rules.OpeningFairness)
            {
                penalty += Squared(summary.Openings - summary.ExpectedOpenings) * FairnessWeight;
            }
            if (rules.ClosingFairness)
            {
                penalty += Squared(summary.Closings - summary.ExpectedClosings) * FairnessWeight;
            }
        }
        return (long)Math.Round(penalty, MidpointRounding.AwayFromZero);

        static decimal Squared(decimal shifts) => shifts * shifts;
    }

    private static List<MemberSummary> Summaries(Context context, Rulebook rulebook) =>
        context.Input.Members.Select(member =>
        {
            var shifts = context.ShiftsOf(member.Id);
            var weekly = context.WeeklyHours(member.Id);

            var openings = shifts.Count(shift => rulebook.Parts[shift.Id].HasFlag(DayPart.Opening));
            var closings = shifts.Count(shift => rulebook.Parts[shift.Id].HasFlag(DayPart.Closing));

            // BR-022: expected = the person's shifts times the share of openings (closings) among the
            // shifts they are available for. Someone only free in the evenings expects no openings. With
            // nothing available (any shifts are locks), whatever they have is what they expect.
            var free = rulebook.FreeFor[member.Id];
            decimal Expected(int availableOfKind, int actual) => free.Shifts == 0
                ? actual
                : Math.Round((decimal)shifts.Count * availableOfKind / free.Shifts, 2);

            return new MemberSummary(member.Id, weekly.Sum(), member.DesiredWeeklyHours * context.Weeks, weekly.ToArray(),
                openings, Expected(free.Openings, openings), closings, Expected(free.Closings, closings));
        }).ToList();

    private static string Number(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static GeneratorIssue Issue(string code, IReadOnlyList<string> shiftIds, IReadOnlyList<string> memberIds, params (string Key, string Value)[] parameters) =>
        new(code, shiftIds, memberIds, parameters.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal));

    /// <summary>
    /// What every grading of one input shares, worked out once: indexes, availability, the weeks, which
    /// shifts open and close their day (BR-034), and what each member is free for (BR-022).
    /// </summary>
    internal sealed class Rulebook
    {
        /// <param name="input">A valid input: <see cref="Evaluate(GeneratorInput, IReadOnlyList{Assignment})"/> checks it first.</param>
        public Rulebook(GeneratorInput input)
        {
            Input = input;
            Members = input.Members.ToDictionary(member => member.Id, StringComparer.Ordinal);
            Shifts = input.Shifts.ToDictionary(shift => shift.Id, StringComparer.Ordinal);
            Submitted = input.Availability.Where(entry => entry.Submitted).Select(entry => entry.MemberId).ToHashSet(StringComparer.Ordinal);
            Available = HardRules.Available(input);

            // Desired hours are weekly (BR-032); the period is as many weeks as its shifts span, counted from its first day.
            Weeks = HardRules.Weeks(input);
            FirstDay = HardRules.FirstDay(input);
            Parts = DayParts.Of(input.Shifts);
            PairsByBlock = input.ConflictPairs.GroupBy(pair => pair.BlockId, StringComparer.Ordinal)
                .ToDictionary(block => block.Key, block => block.ToList(), StringComparer.Ordinal);
            FreeFor = input.Members.ToDictionary(
                member => member.Id,
                member =>
                {
                    var free = input.Shifts.Where(shift => Available.Contains((member.Id, shift.Id))).ToList();
                    return (free.Count, free.Count(shift => Parts[shift.Id].HasFlag(DayPart.Opening)), free.Count(shift => Parts[shift.Id].HasFlag(DayPart.Closing)));
                },
                StringComparer.Ordinal);
        }

        public GeneratorInput Input { get; }

        public Dictionary<string, GeneratorMember> Members { get; }

        public Dictionary<string, GeneratorShift> Shifts { get; }

        public HashSet<string> Submitted { get; }

        public HashSet<(string MemberId, string ShiftId)> Available { get; }

        public int Weeks { get; }

        public DateOnly FirstDay { get; }

        public IReadOnlyDictionary<string, DayPart> Parts { get; }

        /// <summary>The conflict pairs of each shift block (BR-036).</summary>
        public Dictionary<string, List<ConflictPair>> PairsByBlock { get; }

        /// <summary>Per member, how many shifts they are available for, and how many of those open and close their day.</summary>
        public Dictionary<string, (int Shifts, int Openings, int Closings)> FreeFor { get; }
    }

    /// <summary>One schedule laid over a <see cref="Rulebook"/>, indexed once for every check.</summary>
    private sealed class Context
    {
        private readonly Rulebook rulebook;
        private readonly Dictionary<string, List<string>> onShift;
        private readonly Dictionary<string, List<GeneratorShift>> shiftsOf;
        private readonly Dictionary<string, decimal[]> weeklyHours;

        public Context(Rulebook rulebook, IReadOnlyList<Assignment> assignments)
        {
            ArgumentNullException.ThrowIfNull(assignments);
            this.rulebook = rulebook;
            var input = rulebook.Input;

            onShift = input.Shifts.ToDictionary(shift => shift.Id, _ => new List<string>(), StringComparer.Ordinal);
            shiftsOf = input.Members.ToDictionary(member => member.Id, _ => new List<GeneratorShift>(), StringComparer.Ordinal);
            weeklyHours = input.Members.ToDictionary(member => member.Id, _ => new decimal[rulebook.Weeks], StringComparer.Ordinal);
            foreach (var assignment in assignments)
            {
                if (assignment is null || !rulebook.Shifts.TryGetValue(assignment.ShiftId, out var shift) || !Members.ContainsKey(assignment.MemberId))
                {
                    throw new ArgumentException($"The assignment {assignment} names an unknown shift or member.", nameof(assignments));
                }
                if (onShift[shift.Id].Contains(assignment.MemberId))
                {
                    throw new ArgumentException($"{assignment.MemberId} is on {shift.Id} twice.", nameof(assignments));
                }
                onShift[shift.Id].Add(assignment.MemberId);
                shiftsOf[assignment.MemberId].Add(shift);
                weeklyHours[assignment.MemberId][HardRules.Week(shift, rulebook.FirstDay)] += HardRules.Hours(shift);
            }
            foreach (var list in shiftsOf.Values)
            {
                list.Sort((a, b) => (a.Date, a.Start, a.End).CompareTo((b.Date, b.Start, b.End)));
            }

            summaries = new Lazy<List<MemberSummary>>(() => Evaluator.Summaries(this, rulebook));
        }

        private readonly Lazy<List<MemberSummary>> summaries;

        /// <summary>Each member's totals, in the input's order of members. Worked out only when asked for.</summary>
        public List<MemberSummary> Summaries => summaries.Value;

        public GeneratorInput Input => rulebook.Input;

        public Dictionary<string, GeneratorMember> Members => rulebook.Members;

        public HashSet<string> Submitted => rulebook.Submitted;

        public HashSet<(string MemberId, string ShiftId)> Available => rulebook.Available;

        public int Weeks => rulebook.Weeks;

        public Dictionary<string, List<ConflictPair>> PairsByBlock => rulebook.PairsByBlock;

        /// <summary>The member's hours in each week of the period, the first week first (BR-031).</summary>
        public decimal[] WeeklyHours(string memberId) => weeklyHours[memberId];

        /// <summary>Which week of the period the shift falls in: 0 for the first.</summary>
        public int WeekOf(GeneratorShift shift) => HardRules.Week(shift, rulebook.FirstDay);

        public List<string> OnShift(string shiftId) => onShift[shiftId];

        /// <summary>The member's shifts in time order.</summary>
        public List<GeneratorShift> ShiftsOf(string memberId) => shiftsOf[memberId];
    }
}
