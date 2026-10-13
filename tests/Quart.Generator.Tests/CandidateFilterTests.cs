using static Quart.Generator.Tests.Inputs;

namespace Quart.Generator.Tests;

/// <summary>The one candidate filter (M1-03): one focused test per hard rule (spec 7.3, BR-036), and how locks and removals count.</summary>
public sealed class CandidateFilterTests
{
    // Monday to Sunday of one week, an opening (10:00-16:00) and a closing (16:00-23:00) each day.
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

    /// <summary>Everyone available for everything, so only the rule under test can say no.</summary>
    private static GeneratorInput Everyone(
        IReadOnlyList<GeneratorShift> shifts,
        IReadOnlyList<GeneratorMember>? members = null,
        IReadOnlyList<Assignment>? locked = null,
        IReadOnlyList<ConflictPair>? conflicts = null,
        IReadOnlyList<BusyTime>? busy = null,
        int? maxConsecutive = 3)
    {
        members ??= ThreePeople;
        return Input(shifts, members, members.Select(m => Available(m.Id, shifts.Select(s => s.Id).ToArray())).ToList(),
            locked, conflicts, busy: busy, rules: Rules with { MaxConsecutiveShifts = maxConsecutive });
    }

    private static CandidateFilter With(GeneratorInput input, params (string ShiftId, string MemberId)[] placed)
    {
        var filter = new CandidateFilter(input);
        foreach (var (shiftId, memberId) in placed)
        {
            filter.Assign(shiftId, memberId);
        }
        return filter;
    }

    [Fact]
    public void Someone_available_for_an_open_shift_is_a_candidate()
    {
        Assert.True(With(Everyone(Week)).CanAssign("d0-open", "ana"));
    }

    [Fact]
    public void Only_people_available_for_that_exact_shift_are_candidates()
    {
        // BR-001
        var input = Input(Week, ThreePeople, [Available("ana", "d0-close")]);
        var filter = With(input);

        Assert.False(filter.CanAssign("d0-open", "ana"));
        Assert.True(filter.CanAssign("d0-close", "ana"));
    }

    [Fact]
    public void Someone_who_never_sent_availability_is_never_a_candidate()
    {
        // FR-099: "not sent" is never treated as available, whatever the entry lists.
        var input = Input(Week, ThreePeople, [new MemberAvailability("ana", Submitted: false, ["d0-open"])]);

        Assert.False(With(input).CanAssign("d0-open", "ana"));
    }

    [Theory]
    [InlineData("2026-10-05T15:00", "2026-10-05T18:00", false)]
    [InlineData("2026-10-04T22:00", "2026-10-05T11:00", false)] // runs past midnight into it
    [InlineData("2026-10-05T16:00", "2026-10-05T20:00", true)] // starts as the opening ends
    public void Nobody_is_placed_over_a_busy_time_at_another_workplace(string start, string end, bool candidate)
    {
        // BR-002 across workplaces.
        var busy = new BusyTime("ana", DateTime.Parse(start, System.Globalization.CultureInfo.InvariantCulture), DateTime.Parse(end, System.Globalization.CultureInfo.InvariantCulture));

        Assert.Equal(candidate, With(Everyone(Week, busy: [busy])).CanAssign("d0-open", "ana"));
    }

    [Fact]
    public void Nobody_is_placed_on_two_shifts_that_overlap()
    {
        // BR-002 in this workplace. An opener and a mid may overlap (FR-063).
        var mid = Shift("d0-mid", "2026-10-05", "12:00", "18:00", blockId: "mid");
        var filter = With(Everyone([Week[0], mid, Week[1]], maxConsecutive: null), ("d0-open", "ana"));

        Assert.False(filter.CanAssign("d0-mid", "ana"));
        Assert.True(filter.CanAssign("d0-close", "ana")); // back to back is not an overlap
        Assert.True(filter.CanAssign("d0-mid", "ben"));
    }

    [Fact]
    public void A_full_shift_takes_nobody_else()
    {
        // BR-003
        var filter = With(Everyone(Week), ("d0-open", "ana"), ("d0-open", "ben"));

        Assert.Equal(0, filter.OpenSlots("d0-open"));
        Assert.False(filter.CanAssign("d0-open", "cleo"));
    }

    [Fact]
    public void Someone_already_on_the_shift_is_not_a_candidate_again()
    {
        Assert.False(With(Everyone(Week), ("d0-open", "ana")).CanAssign("d0-open", "ana"));
    }

    [Fact]
    public void Locks_are_placed_first_and_count_toward_the_headcount()
    {
        // BR-004
        var filter = With(Everyone(Week, locked: [new Assignment("d0-open", "cleo")]));

        Assert.True(filter.IsAssigned("d0-open", "cleo"));
        Assert.True(filter.IsLocked("d0-open", "cleo"));
        Assert.Equal(1, filter.OpenSlots("d0-open"));
        Assert.Equal([new Assignment("d0-open", "cleo")], filter.Assignments);
    }

    [Fact]
    public void A_lock_is_kept_even_when_it_breaks_a_rule()
    {
        // BR-004: the filter only stops the generator. Here two locks overfill a shift of one with people
        // who sent no availability; the evaluator reports it all.
        var solo = Shift("solo", headcount: 1);
        var input = Input([solo], ThreePeople, [], locked: [new Assignment("solo", "ana"), new Assignment("solo", "ben")]);

        var filter = With(input);

        Assert.Equal([new("solo", "ana"), new("solo", "ben")], filter.Assignments);
        Assert.Equal(0, filter.OpenSlots("solo"));
    }

    [Fact]
    public void A_lock_cannot_be_removed()
    {
        var filter = With(Everyone(Week, locked: [new Assignment("d0-open", "cleo")]));

        Assert.Throws<InvalidOperationException>(() => filter.Unassign("d0-open", "cleo"));
    }

    [Fact]
    public void Three_shifts_in_a_row_are_allowed_and_a_fourth_is_not_when_the_limit_is_3()
    {
        // BR-005: opening and closing Monday, then opening Tuesday, is 3.
        var filter = With(Everyone(Week), ("d0-open", "ana"), ("d0-close", "ana"));

        Assert.True(filter.CanAssign("d1-open", "ana"));
        filter.Assign("d1-open", "ana");
        Assert.False(filter.CanAssign("d1-close", "ana"));
        Assert.False(filter.CanAssign("d2-open", "ana"));
    }

    [Fact]
    public void A_day_without_a_shift_resets_the_count()
    {
        var filter = With(Everyone(Week), ("d0-open", "ana"), ("d0-close", "ana"), ("d1-open", "ana"));

        Assert.True(filter.CanAssign("d3-open", "ana")); // Wednesday is free
    }

    [Fact]
    public void A_shift_that_would_join_two_runs_counts_both()
    {
        // Monday and Wednesday are two runs of 1 with a limit of 2; Tuesday would make one run of 3.
        var filter = With(Everyone(Week, maxConsecutive: 2), ("d0-open", "ana"), ("d2-open", "ana"));

        Assert.False(filter.CanAssign("d1-open", "ana"));
    }

    [Fact]
    public void Locked_shifts_count_toward_the_consecutive_limit()
    {
        var input = Everyone(Week, locked: [new Assignment("d0-open", "ana"), new Assignment("d0-close", "ana"), new Assignment("d1-open", "ana")]);

        Assert.False(With(input).CanAssign("d1-close", "ana"));
    }

    [Fact]
    public void No_limit_means_any_number_in_a_row()
    {
        var filter = With(Everyone(Week, maxConsecutive: null));
        foreach (var shift in Week)
        {
            Assert.True(filter.CanAssign(shift.Id, "ana"));
            filter.Assign(shift.Id, "ana");
        }
    }

    [Fact]
    public void Removing_someone_frees_their_place_in_the_run()
    {
        // What local search does (M1-05): take someone off, then try them elsewhere.
        var filter = With(Everyone(Week), ("d0-open", "ana"), ("d0-close", "ana"), ("d1-open", "ana"));

        filter.Unassign("d0-open", "ana");

        Assert.True(filter.CanAssign("d1-close", "ana"));
        Assert.True(filter.CanAssign("d0-open", "ben"));
    }

    [Fact]
    public void Nobody_goes_above_their_maximum_hours_in_a_week()
    {
        // BR-006: ana may work 13 hours a week. The opening (6 h) and a closing (7 h) fit; a third shift
        // that week does not, but the next week starts again from 0.
        var nextMonday = Shift("next-mon", "2026-10-12");
        var input = Everyone([.. Week, nextMonday], members: [Member("ana", max: 13), Member("ben")], maxConsecutive: null);
        var filter = With(input, ("d0-open", "ana"), ("d2-close", "ana"));

        Assert.Equal(13m, filter.WeekHours("ana", 0));
        Assert.False(filter.CanAssign("d4-open", "ana"));
        Assert.True(filter.CanAssign("next-mon", "ana"));
        Assert.True(filter.CanAssign("d4-open", "ben")); // no maximum
    }

    [Fact]
    public void Locked_hours_count_toward_the_maximum_and_removing_someone_gives_their_hours_back()
    {
        var input = Everyone(Week, members: [Member("ana", max: 13)], locked: [new Assignment("d0-close", "ana")], maxConsecutive: null);
        var filter = With(input, ("d2-open", "ana"));

        Assert.False(filter.CanAssign("d4-open", "ana"));
        filter.Unassign("d2-open", "ana");
        Assert.Equal(7m, filter.Hours("ana"));
        Assert.True(filter.CanAssign("d4-open", "ana"));
    }

    [Fact]
    public void A_conflict_pair_is_never_put_on_the_same_shift_of_their_block()
    {
        // BR-036
        var filter = With(Everyone(Week, conflicts: [new ConflictPair("opening", "ana", "ben")]), ("d0-open", "ana"));

        Assert.False(filter.CanAssign("d0-open", "ben"));
        Assert.True(filter.CanAssign("d0-open", "cleo"));
    }

    [Fact]
    public void A_conflict_pair_may_work_together_on_another_block()
    {
        var filter = With(Everyone(Week, conflicts: [new ConflictPair("opening", "ana", "ben")]), ("d0-close", "ana"));

        Assert.True(filter.CanAssign("d0-close", "ben"));
    }

    [Fact]
    public void A_pair_forced_together_by_locks_stays_together()
    {
        // BR-036: a lock wins over the pair; the evaluator flags it.
        var input = Everyone(Week, locked: [new Assignment("d0-open", "ana"), new Assignment("d0-open", "ben")],
            conflicts: [new ConflictPair("opening", "ana", "ben")]);

        var filter = With(input);

        Assert.True(filter.IsAssigned("d0-open", "ana"));
        Assert.True(filter.IsAssigned("d0-open", "ben"));
    }

    [Fact]
    public void Assigning_against_the_rules_throws()
    {
        var filter = With(Everyone(Week), ("d0-open", "ana"), ("d0-open", "ben"));

        Assert.Throws<InvalidOperationException>(() => filter.Assign("d0-open", "cleo"));
    }

    [Fact]
    public void Removing_someone_who_is_not_there_throws()
    {
        Assert.Throws<InvalidOperationException>(() => With(Everyone(Week)).Unassign("d0-open", "ana"));
    }

    [Fact]
    public void An_unknown_shift_or_member_is_refused()
    {
        var filter = With(Everyone(Week));

        Assert.Throws<ArgumentException>(() => filter.CanAssign("nope", "ana"));
        Assert.Throws<ArgumentException>(() => filter.CanAssign("d0-open", "nobody"));
    }
}
