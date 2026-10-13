using CsCheck;

namespace Quart.Generator.Tests;

/// <summary>
/// Property tests (AD-005, M1-03): over thousands of random inputs, nothing the generator does ever
/// breaks a hard rule (spec 7.3, BR-036). The only hard-rule issues allowed are those a lock forces
/// (BR-004). When one fails, CsCheck shrinks the input and prints it as JSON for the lab.
/// </summary>
public sealed class HardRulePropertyTests
{
    private static readonly ScheduleGenerator Generator = new();

    [Fact]
    public void Generated_schedules_never_break_a_hard_rule() =>
        RandomInputs.Any.Sample(
            input => AssertKeepsHardRules(input, Generator.Generate(input).Assignments),
            iter: 10_000,
            print: RandomInputs.Json,
            writeLine: TestContext.Current.TestOutputHelper!.WriteLine);

    [Fact]
    public void Placing_and_removing_people_through_the_filter_never_breaks_a_hard_rule()
    {
        // What local search will do (M1-05): put people on and take them off shifts at random, in any
        // order, only ever through the filter. Removing someone must free exactly what they held.
        RandomInputs.Any.Sample(
            input =>
            {
                var filter = new CandidateFilter(input);
                var random = new SeededRandom(input.Seed);
                for (var step = 0; step < 300 && input.Shifts.Count > 0; step++)
                {
                    var shiftId = input.Shifts[random.Next(input.Shifts.Count)].Id;
                    var memberId = input.Members[random.Next(input.Members.Count)].Id;
                    if (!filter.IsAssigned(shiftId, memberId))
                    {
                        if (filter.CanAssign(shiftId, memberId))
                        {
                            filter.Assign(shiftId, memberId);
                        }
                    }
                    else if (!filter.IsLocked(shiftId, memberId))
                    {
                        filter.Unassign(shiftId, memberId);
                    }
                }
                AssertKeepsHardRules(input, filter.Assignments);
            },
            iter: 3_000,
            print: RandomInputs.Json,
            writeLine: TestContext.Current.TestOutputHelper!.WriteLine);
    }

    /// <summary>
    /// Every lock survives; no shift is overfilled; nobody placed is busy elsewhere; and every hard-rule issue the evaluator finds
    /// concerns locked assignments only. So nobody is placed while unavailable, unsubmitted or busy
    /// elsewhere, on overlapping shifts, past the consecutive limit, or beside their conflict pair.
    /// </summary>
    private static void AssertKeepsHardRules(GeneratorInput input, IReadOnlyList<Assignment> assignments)
    {
        Assert.Empty(GeneratorInputValidator.Validate(input));
        var locks = input.LockedAssignments.ToHashSet();
        var placed = assignments.ToHashSet();
        var broken = new List<string>();

        broken.AddRange(locks.Where(lockAt => !placed.Contains(lockAt)).Select(lockAt => $"lock {lockAt} was dropped (BR-004)"));
        foreach (var shift in input.Shifts)
        {
            var on = assignments.Where(assignment => assignment.ShiftId == shift.Id).ToList();
            if (on.Count > shift.Headcount && on.Any(assignment => !locks.Contains(assignment)))
            {
                broken.Add($"{shift.Id} has {on.Count} people for a headcount of {shift.Headcount} (BR-003)");
            }
        }

        // Busy times are checked here directly as well, since the filter and the evaluator share that code.
        var shifts = input.Shifts.ToDictionary(shift => shift.Id);
        foreach (var assignment in placed.Where(assignment => !locks.Contains(assignment)))
        {
            var shift = shifts[assignment.ShiftId];
            var start = shift.Date.ToDateTime(shift.Start);
            var end = shift.Date.ToDateTime(shift.End);
            if (input.BusyTimes.Any(busy => busy.MemberId == assignment.MemberId && busy.Start < end && start < busy.End))
            {
                broken.Add($"{assignment} overlaps a busy time at another workplace (BR-002)");
            }
        }

        foreach (var issue in Evaluator.Evaluate(input, assignments).Issues.Where(issue => issue.HardRule))
        {
            // An overfilled shift names no one, so it concerns everyone on it.
            var members = issue.MemberIds.Count > 0
                ? issue.MemberIds
                : assignments.Where(assignment => issue.ShiftIds.Contains(assignment.ShiftId)).Select(assignment => assignment.MemberId).ToList();
            var unlocked = issue.ShiftIds
                .SelectMany(shiftId => members.Select(memberId => new Assignment(shiftId, memberId)))
                .Where(assignment => placed.Contains(assignment) && !locks.Contains(assignment))
                .ToList();
            if (unlocked.Count > 0)
            {
                broken.Add($"{issue.Code} on [{string.Join(", ", issue.ShiftIds)}] for [{string.Join(", ", issue.MemberIds)}], placed by the generator: {string.Join(", ", unlocked)}");
            }
        }

        Assert.True(broken.Count == 0, string.Join(Environment.NewLine, broken));
    }
}
