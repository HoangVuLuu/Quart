using System.Text.Json;
using static Quart.Generator.Tests.Inputs;

namespace Quart.Generator.Tests;

/// <summary>The input and result contract (AD-003), and the greedy construction (M1-04).</summary>
public sealed class ScheduleGeneratorTests
{
    private readonly ScheduleGenerator generator = new();

    /// <summary>One shift of one person a day, so only the rule under test decides who gets it.</summary>
    private static GeneratorShift Solo(string id, string date = "2026-10-05", string start = "10:00", string end = "16:00", string blockId = "opening") =>
        Shift(id, date, start, end, headcount: 1, blockId);

    [Fact]
    public void Returns_the_seed_it_was_given()
    {
        var input = Input(TwoDays, ThreePeople, [], seed: 1337);

        Assert.Equal(1337, generator.Generate(input).Seed);
    }

    [Fact]
    public void Fills_a_level_requirement_first()
    {
        // BR-011 before hours: cleo and ben want hours, ana wants none, but the shift needs a level 3.
        var shift = Shift("mon-open") with { LevelRequirements = [new LevelRequirement(3, 1)] };
        var input = Input([shift], [Member("ana", level: 3, desired: 0), Member("ben", level: 2, desired: 30), Member("cleo", desired: 30)],
            [Available("ana", "mon-open"), Available("ben", "mon-open"), Available("cleo", "mon-open")]);

        var people = generator.Generate(input).Assignments.Select(assignment => assignment.MemberId).ToList();

        Assert.Contains("ana", people);
        Assert.Equal(2, people.Count);
    }

    [Fact]
    public void Gives_the_shift_to_whoever_is_furthest_below_their_desired_hours()
    {
        // BR-012
        var input = Input([Solo("mon-open")], [Member("ana", desired: 0), Member("ben", desired: 20), Member("cleo", desired: 6)],
            [Available("ana", "mon-open"), Available("ben", "mon-open"), Available("cleo", "mon-open")]);

        Assert.Equal([new Assignment("mon-open", "ben")], generator.Generate(input).Assignments);
    }

    [Fact]
    public void Counts_hours_already_given_when_choosing_the_next_shift()
    {
        // Both want 6 hours a week. Whoever gets the scarcer shift first has their 6; the other takes the next.
        var shifts = new[] { Solo("mon-open"), Solo("tue-open", "2026-10-06") };
        var input = Input(shifts, [Member("ana", desired: 6), Member("ben", desired: 6)],
            [Available("ana", "mon-open", "tue-open"), Available("ben", "mon-open", "tue-open")]);

        var people = generator.Generate(input).Assignments.Select(assignment => assignment.MemberId).Order().ToList();

        Assert.Equal(["ana", "ben"], people);
    }

    [Fact]
    public void Avoids_both_shifts_of_a_day_when_someone_else_can_take_one()
    {
        // BR-015. ana wants many hours and is the only one free in the morning; ben can close.
        var shifts = new[] { Solo("mon-open"), Solo("mon-close", start: "16:00", end: "23:00", blockId: "closing") };
        var input = Input(shifts, [Member("ana", desired: 40), Member("ben", desired: 6)],
            [Available("ana", "mon-open", "mon-close"), Available("ben", "mon-close")]);

        Assert.Equal([new("mon-open", "ana"), new("mon-close", "ben")], generator.Generate(input).Assignments);
    }

    [Fact]
    public void Gives_both_shifts_of_a_day_as_a_last_resort()
    {
        var shifts = new[] { Solo("mon-open"), Solo("mon-close", start: "16:00", end: "23:00", blockId: "closing") };
        var input = Input(shifts, [Member("ana", desired: 13)], [Available("ana", "mon-open", "mon-close")]);

        Assert.Equal(2, generator.Generate(input).Assignments.Count);
    }

    [Fact]
    public void Never_goes_above_someones_maximum_weekly_hours()
    {
        // BR-006: ana could take all four shifts and wants to, but her maximum is 13 hours a week.
        var input = Input(TwoDays, [Member("ana", desired: 40, max: 13)], [Available("ana", "mon-open", "mon-close", "tue-open", "tue-close")]);

        var result = generator.Generate(input);

        Assert.True(result.Members.Single().Hours <= 13);
        Assert.DoesNotContain(result.Issues, issue => issue.HardRule);
    }

    [Fact]
    public void Leaves_a_slot_open_rather_than_place_someone_who_is_not_available()
    {
        var input = Input(TwoDays, ThreePeople, [Available("cleo", "tue-open")]);

        var result = generator.Generate(input);

        Assert.Equal([new Assignment("tue-open", "cleo")], result.Assignments);
    }

    [Fact]
    public void Never_places_someone_who_did_not_submit()
    {
        var input = Input(TwoDays, ThreePeople, [new MemberAvailability("ana", Submitted: false, ["mon-open"])]);

        Assert.Empty(generator.Generate(input).Assignments);
    }

    [Fact]
    public void Never_puts_more_people_on_a_shift_than_its_headcount()
    {
        var input = Input([Solo("solo")], ThreePeople, [Available("ana", "solo"), Available("ben", "solo")]);

        Assert.Single(generator.Generate(input).Assignments);
    }

    [Fact]
    public void Keeps_locked_assignments_and_counts_them_toward_the_headcount()
    {
        var input = Input(
            TwoDays,
            ThreePeople,
            [Available("ana", "mon-open"), Available("ben", "mon-open"), Available("cleo", "mon-open")],
            locked: [new Assignment("mon-open", "cleo")]);

        var onMonday = generator.Generate(input).Assignments.Where(assignment => assignment.ShiftId == "mon-open").ToList();

        Assert.Equal(2, onMonday.Count);
        Assert.Equal(new Assignment("mon-open", "cleo"), onMonday[0]);
    }

    [Fact]
    public void A_lock_wins_even_when_the_person_is_unavailable_or_the_shift_is_full()
    {
        // BR-004: locks are preserved exactly, even when they break another rule.
        var input = Input([Solo("solo")], ThreePeople, [], locked: [new Assignment("solo", "ana"), new Assignment("solo", "ben")]);

        var result = generator.Generate(input);

        Assert.Equal([new("solo", "ana"), new("solo", "ben")], result.Assignments);
    }

    [Fact]
    public void Leaves_a_slot_open_rather_than_break_a_hard_rule()
    {
        // FR-125. ana is the only one free on Monday and Tuesday, and the limit is 3 in a row: one of the
        // four shifts stays open and is reported, not filled.
        var input = Input(TwoDays, [Member("ana", desired: 26)], [Available("ana", "mon-open", "mon-close", "tue-open", "tue-close")]);

        var result = generator.Generate(input);

        Assert.Equal(3, result.Assignments.Count);
        Assert.Contains(result.Issues, issue => issue.Code == IssueCodes.BelowHeadcount);
        Assert.DoesNotContain(result.Issues, issue => issue.HardRule);
    }

    [Fact]
    public void Never_puts_a_conflict_pair_on_the_same_shift()
    {
        var input = Input(TwoDays, ThreePeople, [Available("ana", "mon-open"), Available("ben", "mon-open"), Available("cleo", "mon-open")],
            conflicts: [new ConflictPair("opening", "ana", "ben")]);

        var people = generator.Generate(input).Assignments.Select(assignment => assignment.MemberId).ToList();

        Assert.Equal(2, people.Count);
        Assert.False(people.Contains("ana") && people.Contains("ben"));
    }

    [Fact]
    public void Lists_assignments_in_the_order_of_the_input_shifts()
    {
        var input = Input(
            [TwoDays[3], TwoDays[0]],
            [Member("ana", desired: 13)],
            [Available("ana", "mon-open", "tue-close")]);

        var result = generator.Generate(input);

        Assert.Equal(["tue-close", "mon-open"], result.Assignments.Select(assignment => assignment.ShiftId));
    }

    [Fact]
    public void Reports_what_the_evaluator_finds_in_its_schedule()
    {
        // One rulebook (AD-002): the result carries the evaluator's own verdict, not a second set of checks.
        var input = Input(TwoDays, ThreePeople, [Available("ana", "mon-open", "mon-close")]);

        var result = generator.Generate(input);
        var evaluation = Evaluator.Evaluate(input, result.Assignments);

        Assert.Equal(evaluation.Score, result.Score);
        Assert.Equal(evaluation.Issues.Select(issue => issue.Code), result.Issues.Select(issue => issue.Code));
        Assert.Equal(evaluation.Members, result.Members, (a, b) => JsonSerializer.Serialize(a) == JsonSerializer.Serialize(b));
        Assert.Contains(result.Issues, issue => issue.Code == IssueCodes.BelowHeadcount);
        Assert.True(result.Score < 0);
    }

    [Fact]
    public void The_same_input_and_seed_give_the_same_result_byte_for_byte()
    {
        // FR-122, M1-04: compared as JSON, on the sample with every random choice in play.
        var first = JsonSerializer.Serialize(generator.Generate(Samples.Presotea));
        var second = JsonSerializer.Serialize(generator.Generate(Samples.Presotea));

        Assert.Equal(first, second);
    }

    [Fact]
    public void Another_seed_gives_another_schedule()
    {
        // FR-122: "Generate again" picks a new seed and gets a different valid schedule.
        var schedules = Enumerable.Range(1, 5)
            .Select(seed => JsonSerializer.Serialize(generator.Generate(Samples.Presotea with { Seed = seed }).Assignments))
            .Distinct();

        Assert.True(schedules.Count() > 1);
    }

    [Fact]
    public void On_the_sample_every_shift_that_can_have_a_level_3_gets_one()
    {
        // M1-04: every shift with a level 3 available for it gets one, unless a hard rule stops every one
        // of them (they are all at their limit of shifts in a row). Checked over several seeds.
        foreach (var seed in Enumerable.Range(1, 20))
        {
            var input = Samples.Presotea with { Seed = seed };
            var result = generator.Generate(input);

            Assert.DoesNotContain(result.Issues, issue => issue.Code == IssueCodes.MissingLevel);
            Assert.DoesNotContain(result.Issues, issue => issue.HardRule);
        }
    }

    [Fact]
    public void Refuses_an_input_that_is_not_valid()
    {
        var input = Input(TwoDays, ThreePeople, [Available("nobody", "mon-open")]);

        Assert.Throws<ArgumentException>(() => generator.Generate(input));
    }

    [Fact]
    public void An_input_and_a_result_survive_a_round_trip_through_json()
    {
        // The lab and, later, stored drafts carry both as JSON with web naming (camelCase).
        var input = Input(TwoDays, ThreePeople, [Available("ana", "mon-open")], locked: [new Assignment("mon-close", "ben")],
            conflicts: [new ConflictPair("opening", "ana", "cleo")]);
        var options = JsonSerializerOptions.Web;

        var json = JsonSerializer.Serialize(input, options);
        var back = JsonSerializer.Deserialize<GeneratorInput>(json, options)!;

        Assert.Contains("\"lockedAssignments\":[{\"shiftId\":\"mon-close\",\"memberId\":\"ben\"}]", json);
        Assert.Contains("\"date\":\"2026-10-05\",\"start\":\"10:00:00\"", json);
        Assert.Equal(JsonSerializer.Serialize(generator.Generate(input), options), JsonSerializer.Serialize(generator.Generate(back), options));
    }
}
