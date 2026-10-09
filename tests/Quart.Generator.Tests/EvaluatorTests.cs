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
