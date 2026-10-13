using static Quart.Generator.Tests.Inputs;

namespace Quart.Generator.Tests;

/// <summary>The one rulebook (AD-002): one focused test per issue type (FR-143), its boundaries, and the score.</summary>
public sealed class EvaluatorTests
{
    // Monday to Sunday of one week, an opening (10:00-16:00, 6 h) and a closing (16:00-23:00, 7 h) each day.
    private static readonly GeneratorShift[] Week = Enumerable.Range(0, 7)
        .SelectMany(day =>
        {
            var date = new DateOnly(2026, 10, 5).AddDays(day).ToString("yyyy-MM-dd");
            return new[]
            {
                Shift($"d{day}-open", date, "10:00", "16:00"),
                Shift($"d{day}-close", date, "16:00", "23:00", blockId: "closing"),
            };
        })
        .ToArray();

    private static Assignment On(string shiftId, string memberId) => new(shiftId, memberId);

    /// <summary>Everyone available for everything, so only the rule under test can fire.</summary>
    private static GeneratorInput Everyone(IReadOnlyList<GeneratorShift> shifts, IReadOnlyList<GeneratorMember> members, IReadOnlyList<ConflictPair>? conflicts = null) =>
        Input(shifts, members, members.Select(m => Available(m.Id, shifts.Select(s => s.Id).ToArray())).ToList(), conflicts: conflicts);

    private static List<GeneratorIssue> IssuesOf(string code, GeneratorInput input, params Assignment[] assignments) =>
        Evaluator.Evaluate(input, assignments).Issues.Where(issue => issue.Code == code).ToList();

    [Fact]
    public void A_schedule_with_nothing_wrong_scores_0_and_has_no_issues()
    {
        var shift = Shift("solo", headcount: 1);
        var input = Everyone([shift], [Member("ana", desired: 6)]);

        var evaluation = Evaluator.Evaluate(input, [On("solo", "ana")]);

        Assert.Equal(0, evaluation.Score);
        Assert.Empty(evaluation.Issues);
    }

    [Fact]
    public void Below_headcount_names_the_shift_and_the_count()
    {
        var input = Everyone([Week[0]], ThreePeople);

        var issue = Assert.Single(IssuesOf(IssueCodes.BelowHeadcount, input, On("d0-open", "ana")));

        Assert.Equal(["d0-open"], issue.ShiftIds);
        Assert.Equal("1", issue.Parameters["assigned"]);
        Assert.Equal("2", issue.Parameters["headcount"]);
    }

    [Fact]
    public void A_full_shift_is_not_below_headcount()
    {
        var input = Everyone([Week[0]], ThreePeople);

        Assert.Empty(IssuesOf(IssueCodes.BelowHeadcount, input, On("d0-open", "ana"), On("d0-open", "ben")));
    }

    [Fact]
    public void Above_headcount_names_the_shift_and_the_count()
    {
        // Only a lock or a manual edit can overfill a shift (BR-003, BR-004).
        var input = Everyone([Week[0]], ThreePeople);

        var issue = Assert.Single(IssuesOf(IssueCodes.AboveHeadcount, input, On("d0-open", "ana"), On("d0-open", "ben"), On("d0-open", "cleo")));

        Assert.Equal(["d0-open"], issue.ShiftIds);
        Assert.Empty(issue.MemberIds);
        Assert.Equal("3", issue.Parameters["assigned"]);
        Assert.Equal("2", issue.Parameters["headcount"]);
        Assert.True(issue.HardRule);
    }

    [Fact]
    public void Missing_level_names_the_level_required_and_present()
    {
        var shift = Week[0] with { LevelRequirements = [new LevelRequirement(3, 1)] };
        var input = Everyone([shift], ThreePeople); // ana is level 3, ben 2, cleo 1

        var issue = Assert.Single(IssuesOf(IssueCodes.MissingLevel, input, On("d0-open", "ben"), On("d0-open", "cleo")));

        Assert.Equal(["d0-open"], issue.ShiftIds);
        Assert.Equal("3", issue.Parameters["level"]);
        Assert.Equal("1", issue.Parameters["required"]);
        Assert.Equal("0", issue.Parameters["present"]);
    }

    [Fact]
    public void A_higher_level_satisfies_a_lower_requirement()
    {
        // Levels are a ladder (FR-066): the level 3 counts toward "at least 2 of level 2".
        var shift = Week[0] with { LevelRequirements = [new LevelRequirement(2, 2)] };
        var input = Everyone([shift], ThreePeople);

        Assert.Empty(IssuesOf(IssueCodes.MissingLevel, input, On("d0-open", "ana"), On("d0-open", "ben")));
        Assert.Single(IssuesOf(IssueCodes.MissingLevel, input, On("d0-open", "ana"), On("d0-open", "cleo")));
    }

    [Fact]
    public void Someone_on_a_shift_they_are_not_available_for_is_reported()
    {
        var input = Input(Week[..2], ThreePeople, [Available("ana", "d0-close")]);

        var issue = Assert.Single(IssuesOf(IssueCodes.Unavailable, input, On("d0-open", "ana")));

        Assert.Equal(["d0-open"], issue.ShiftIds);
        Assert.Equal(["ana"], issue.MemberIds);
        Assert.Empty(IssuesOf(IssueCodes.NotSubmitted, input, On("d0-open", "ana")));
    }

    [Theory]
    [InlineData(false)] // sent nothing at all
    [InlineData(true)] // has an entry, marked not submitted
    public void Someone_on_a_shift_who_never_sent_availability_is_reported(bool hasEntry)
    {
        var availability = hasEntry ? [new MemberAvailability("ana", Submitted: false, ["d0-open"])] : new List<MemberAvailability>();
        var input = Input([Week[0]], ThreePeople, availability);

        var issue = Assert.Single(IssuesOf(IssueCodes.NotSubmitted, input, On("d0-open", "ana")));

        Assert.Equal(["ana"], issue.MemberIds);
        Assert.Empty(IssuesOf(IssueCodes.Unavailable, input, On("d0-open", "ana")));
    }

    [Theory]
    [InlineData("2026-10-05T15:00", "2026-10-05T18:00", true)] // overlaps the end of the opening
    [InlineData("2026-10-04T22:00", "2026-10-05T11:00", true)] // runs past midnight into it
    [InlineData("2026-10-05T16:00", "2026-10-05T20:00", false)] // starts as the opening ends: half-open
    [InlineData("2026-10-05T06:00", "2026-10-05T10:00", false)] // ends as it starts
    public void A_shift_that_overlaps_a_busy_time_at_another_workplace_reads_as_unavailable(string start, string end, bool reported)
    {
        // BR-002 across workplaces. The issue reads "not available" and says nothing of where (FR-094).
        var busy = new BusyTime("ana", DateTime.Parse(start, System.Globalization.CultureInfo.InvariantCulture), DateTime.Parse(end, System.Globalization.CultureInfo.InvariantCulture));
        var input = Everyone([Week[0]], ThreePeople) with { BusyTimes = [busy] };

        Assert.Equal(reported ? 1 : 0, IssuesOf(IssueCodes.Unavailable, input, On("d0-open", "ana")).Count);
    }

    [Theory]
    [InlineData("10", true)] // 6 h worked of 10 wanted: 4 under
    [InlineData("8", false)] // exactly 2 under: not reported (BR-033)
    [InlineData("8.5", true)] // 2.5 under
    public void Under_desired_hours_is_reported_beyond_2_hours(string desired, bool reported)
    {
        var input = Everyone([Week[0]], [Member("ana", desired: decimal.Parse(desired, System.Globalization.CultureInfo.InvariantCulture))]);

        var issues = IssuesOf(IssueCodes.UnderHours, input, On("d0-open", "ana"));

        if (!reported)
        {
            Assert.Empty(issues);
            return;
        }
        var issue = Assert.Single(issues);
        Assert.Equal(["ana"], issue.MemberIds);
        Assert.Empty(issue.ShiftIds);
        Assert.Equal("6", issue.Parameters["hours"]);
        Assert.Equal(desired, issue.Parameters["target"]);
    }

    [Fact]
    public void Over_desired_hours_is_reported_beyond_2_hours()
    {
        // 6 + 7 = 13 hours against 10 wanted.
        var input = Everyone(Week[..2], [Member("ana", desired: 10)]);

        var issue = Assert.Single(IssuesOf(IssueCodes.OverHours, input, On("d0-open", "ana"), On("d0-close", "ana")));

        Assert.Equal("13", issue.Parameters["hours"]);
        Assert.Equal("10", issue.Parameters["target"]);
        Assert.Empty(IssuesOf(IssueCodes.UnderHours, input, On("d0-open", "ana"), On("d0-close", "ana")));
    }

    [Fact]
    public void Hours_count_the_full_shift_and_the_target_covers_every_week_of_the_period()
    {
        // Two weeks: the target is twice the weekly 10 hours. A 7-hour closing counts 7 (BR-031).
        var later = Shift("w2-close", "2026-10-18", "16:00", "23:00", blockId: "closing");
        var input = Everyone([Week[1], later], [Member("ana", desired: 10)]);

        var issue = Assert.Single(IssuesOf(IssueCodes.UnderHours, input, On("d0-close", "ana"), On("w2-close", "ana")));

        Assert.Equal("14", issue.Parameters["hours"]);
        Assert.Equal("20", issue.Parameters["target"]);
    }

    [Fact]
    public void Someone_who_never_sent_availability_is_not_reported_under_hours()
    {
        var input = Input([Week[0]], [Member("ana", desired: 20)], []);

        Assert.Empty(IssuesOf(IssueCodes.UnderHours, input));
    }

    [Fact]
    public void A_week_above_someones_maximum_hours_is_reported()
    {
        // BR-006: 13 hours in the first week against a maximum of 12. The second week is fine.
        var input = Everyone(Week, [Member("ana", desired: 6, max: 12)]);
        var secondWeek = Shift("next-mon", "2026-10-12");
        input = input with { Shifts = [.. input.Shifts, secondWeek], Availability = [Available("ana", [.. Week.Select(s => s.Id), "next-mon"])] };

        var issue = Assert.Single(IssuesOf(IssueCodes.OverMaxHours, input, On("d0-open", "ana"), On("d1-close", "ana"), On("next-mon", "ana")));

        Assert.Equal(["d0-open", "d1-close"], issue.ShiftIds);
        Assert.Equal(["ana"], issue.MemberIds);
        Assert.Equal("1", issue.Parameters["week"]);
        Assert.Equal("13", issue.Parameters["hours"]);
        Assert.Equal("12", issue.Parameters["max"]);
        Assert.True(issue.HardRule);
    }

    [Fact]
    public void Exactly_the_maximum_is_allowed_and_no_maximum_means_none()
    {
        var input = Everyone(Week, [Member("ana", desired: 6, max: 13), Member("ben", desired: 6)]);

        Assert.Empty(IssuesOf(IssueCodes.OverMaxHours, input,
            On("d0-open", "ana"), On("d1-close", "ana"), On("d0-open", "ben"), On("d1-close", "ben"), On("d2-close", "ben")));
    }

    [Fact]
    public void Each_member_is_summed_up_per_week_and_against_the_target()
    {
        var input = Everyone([.. Week, Shift("next-mon", "2026-10-12")], [Member("ana", desired: 10), Member("ben", desired: 4)]);

        var evaluation = Evaluator.Evaluate(input, [On("d0-open", "ana"), On("d1-close", "ana"), On("next-mon", "ana")]);

        var ana = evaluation.Members[0];
        Assert.Equal("ana", ana.MemberId);
        Assert.Equal(19m, ana.Hours);
        Assert.Equal(20m, ana.TargetHours); // 10 a week, over two weeks
        Assert.Equal([13m, 6m], ana.WeeklyHours);
        Assert.Equal([0m, 0m], evaluation.Members[1].WeeklyHours);
    }

    [Fact]
    public void Three_shifts_in_a_row_are_allowed_when_the_limit_is_3()
    {
        // Opening and closing Monday, then opening Tuesday: 3 consecutive shifts (BR-005).
        var input = Everyone(Week, [Member("ana", desired: 19)]);

        Assert.Empty(IssuesOf(IssueCodes.ConsecutiveShifts, input, On("d0-open", "ana"), On("d0-close", "ana"), On("d1-open", "ana")));
    }

    [Fact]
    public void A_fourth_shift_in_a_row_breaks_a_limit_of_3()
    {
        var input = Everyone(Week, [Member("ana", desired: 26)]);

        var issue = Assert.Single(IssuesOf(IssueCodes.ConsecutiveShifts, input,
            On("d0-open", "ana"), On("d0-close", "ana"), On("d1-open", "ana"), On("d1-close", "ana")));

        Assert.Equal(["ana"], issue.MemberIds);
        Assert.Equal(["d0-open", "d0-close", "d1-open", "d1-close"], issue.ShiftIds);
        Assert.Equal("4", issue.Parameters["count"]);
        Assert.Equal("3", issue.Parameters["max"]);
    }

    [Fact]
    public void A_day_without_a_shift_resets_the_count()
    {
        // Monday, Tuesday, then Thursday, Friday: two runs of 2, never 4.
        var input = Everyone(Week, [Member("ana", desired: 24)]);

        Assert.Empty(IssuesOf(IssueCodes.ConsecutiveShifts, input, On("d0-open", "ana"), On("d1-open", "ana"), On("d3-open", "ana"), On("d4-open", "ana")));
    }

    [Fact]
    public void Shifts_on_consecutive_days_count_across_the_day_boundary()
    {
        // Monday closing, Tuesday opening, Wednesday opening, Thursday opening: 4 in a row, one per day.
        var input = Everyone(Week, [Member("ana", desired: 25)]);

        var issue = Assert.Single(IssuesOf(IssueCodes.ConsecutiveShifts, input,
            On("d0-close", "ana"), On("d1-open", "ana"), On("d2-open", "ana"), On("d3-open", "ana")));

        Assert.Equal("4", issue.Parameters["count"]);
    }

    [Fact]
    public void No_limit_means_no_consecutive_issue()
    {
        var input = Everyone(Week, [Member("ana", desired: 91)]) with { Rules = Rules with { MaxConsecutiveShifts = null } };

        Assert.Empty(IssuesOf(IssueCodes.ConsecutiveShifts, input, Week.Select(shift => On(shift.Id, "ana")).ToArray()));
    }

    [Fact]
    public void Both_shifts_in_one_day_is_a_double()
    {
        var input = Everyone(Week, [Member("ana", desired: 13)]);

        var issue = Assert.Single(IssuesOf(IssueCodes.DoubleShift, input, On("d2-open", "ana"), On("d2-close", "ana")));

        Assert.Equal(["ana"], issue.MemberIds);
        Assert.Equal(["d2-open", "d2-close"], issue.ShiftIds);
        Assert.Equal("2026-10-07", issue.Parameters["date"]);
        Assert.Equal("2", issue.Parameters["count"]);
    }

    [Fact]
    public void One_shift_a_day_is_not_a_double()
    {
        var input = Everyone(Week, [Member("ana", desired: 13)]);

        Assert.Empty(IssuesOf(IssueCodes.DoubleShift, input, On("d2-open", "ana"), On("d3-close", "ana")));
    }

    [Fact]
    public void Two_shifts_that_overlap_in_time_are_reported()
    {
        // BR-002. Shift blocks on the same day may overlap (FR-063): an opener and a mid.
        var mid = Shift("d0-mid", "2026-10-05", "12:00", "18:00", blockId: "mid");
        var input = Everyone([Week[0], mid, Week[1]], [Member("ana", desired: 12)]);

        var issue = Assert.Single(IssuesOf(IssueCodes.OverlappingShifts, input, On("d0-open", "ana"), On("d0-mid", "ana")));

        Assert.Equal(["d0-open", "d0-mid"], issue.ShiftIds);
        Assert.Equal(["ana"], issue.MemberIds);
        Assert.True(issue.HardRule);
    }

    [Fact]
    public void Back_to_back_shifts_do_not_overlap()
    {
        // The opening ends at 16:00 as the closing starts: ranges are half-open (AD-011).
        var input = Everyone(Week, [Member("ana", desired: 13)]);

        Assert.Empty(IssuesOf(IssueCodes.OverlappingShifts, input, On("d0-open", "ana"), On("d0-close", "ana")));
    }

    [Fact]
    public void An_incompatible_pair_on_a_shift_of_their_block_is_reported()
    {
        var input = Everyone(Week, ThreePeople, conflicts: [new ConflictPair("opening", "ana", "ben")]);

        var issue = Assert.Single(IssuesOf(IssueCodes.IncompatiblePair, input, On("d0-open", "ana"), On("d0-open", "ben")));

        Assert.Equal(["d0-open"], issue.ShiftIds);
        Assert.Equal(["ana", "ben"], issue.MemberIds);
    }

    [Fact]
    public void An_incompatible_pair_may_work_together_on_another_block()
    {
        // Pairs are set per shift block (BR-036): this one is only for openings.
        var input = Everyone(Week, ThreePeople, conflicts: [new ConflictPair("opening", "ana", "ben")]);

        Assert.Empty(IssuesOf(IssueCodes.IncompatiblePair, input, On("d0-close", "ana"), On("d0-close", "ben")));
    }

    [Fact]
    public void The_score_adds_up_the_weights()
    {
        // One empty slot, a missing level 3, ana 1 hour over (13 of 12 wanted, not reported) and a double.
        var opening = Week[0] with { LevelRequirements = [new LevelRequirement(3, 1)] };
        var input = Everyone([opening, Week[1]], [Member("ana", level: 2, desired: 12), Member("ben", level: 1, desired: 7)]);

        var evaluation = Evaluator.Evaluate(input, [On("d0-open", "ana"), On("d0-close", "ana"), On("d0-close", "ben")]);

        var expected = Evaluator.EmptySlotWeight + Evaluator.MissingLevelWeight + 1 * Evaluator.HoursWeight + Evaluator.DoubleShiftWeight;
        Assert.Equal(-expected, evaluation.Score);
    }

    [Fact]
    public void Breaking_a_hard_rule_costs_more_than_leaving_a_slot_empty()
    {
        var input = Input([Shift("solo", headcount: 1)], [Member("ana", desired: 0)], []);

        var empty = Evaluator.Evaluate(input, []).Score;
        var unsubmitted = Evaluator.Evaluate(input, [On("solo", "ana")]).Score;

        Assert.True(empty > unsubmitted, $"empty {empty} should beat placing someone who never sent availability {unsubmitted}");
    }

    [Fact]
    public void Issues_are_grouped_by_type_in_display_order()
    {
        var input = Input(Week, ThreePeople, [Available("ana", "d0-open", "d0-close")]);

        var codes = Evaluator.Evaluate(input, [On("d0-open", "ana"), On("d0-close", "ana"), On("d1-open", "ben")]).Issues
            .Select(issue => issue.Code)
            .Distinct()
            .ToList();

        Assert.Equal(IssueCodes.All.Where(codes.Contains), codes);
    }

    [Fact]
    public void Only_hard_rule_issues_are_marked_hard()
    {
        Assert.Equal(
            [IssueCodes.AboveHeadcount, IssueCodes.Unavailable, IssueCodes.NotSubmitted, IssueCodes.OverlappingShifts, IssueCodes.OverMaxHours,
                IssueCodes.ConsecutiveShifts, IssueCodes.IncompatiblePair],
            IssueCodes.All.Where(code => new GeneratorIssue(code, [], [], new Dictionary<string, string>()).HardRule));
    }

    [Fact]
    public void An_assignment_to_an_unknown_shift_or_member_is_refused()
    {
        var input = Everyone(Week, ThreePeople);

        Assert.Throws<ArgumentException>(() => Evaluator.Evaluate(input, [On("nope", "ana")]));
        Assert.Throws<ArgumentException>(() => Evaluator.Evaluate(input, [On("d0-open", "zoe")]));
    }

    [Fact]
    public void The_same_person_twice_on_a_shift_is_refused()
    {
        var input = Everyone(Week, ThreePeople);

        Assert.Throws<ArgumentException>(() => Evaluator.Evaluate(input, [On("d0-open", "ana"), On("d0-open", "ana")]));
    }
}
