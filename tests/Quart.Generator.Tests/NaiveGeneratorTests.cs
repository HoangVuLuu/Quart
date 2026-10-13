using System.Text.Json;
using static Quart.Generator.Tests.Inputs;

namespace Quart.Generator.Tests;

/// <summary>The input and result contract (AD-003), through the simplest generator (M1-01).</summary>
public sealed class NaiveGeneratorTests
{
    private readonly NaiveGenerator generator = new();

    [Fact]
    public void Returns_the_seed_it_was_given()
    {
        var input = Input(TwoDays, ThreePeople, [], seed: 1337);

        Assert.Equal(1337, generator.Generate(input).Seed);
    }

    [Fact]
    public void First_available_people_win_in_input_order()
    {
        var input = Input(
            TwoDays,
            ThreePeople,
            [Available("ana", "mon-open"), Available("ben", "mon-open", "tue-close"), Available("cleo", "mon-open", "tue-close")]);

        var result = generator.Generate(input);

        Assert.Equal(
            [new("mon-open", "ana"), new("mon-open", "ben"), new("tue-close", "ben"), new("tue-close", "cleo")],
            result.Assignments);
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
        var shift = Shift("solo", headcount: 1);
        var input = Input([shift], ThreePeople, [Available("ana", "solo"), Available("ben", "solo")]);

        Assert.Equal([new Assignment("solo", "ana")], generator.Generate(input).Assignments);
    }

    [Fact]
    public void Keeps_locked_assignments_and_counts_them_toward_the_headcount()
    {
        var input = Input(
            TwoDays,
            ThreePeople,
            [Available("ana", "mon-open"), Available("ben", "mon-open"), Available("cleo", "mon-open")],
            locked: [new Assignment("mon-open", "cleo")]);

        var result = generator.Generate(input);

        Assert.Equal([new("mon-open", "cleo"), new("mon-open", "ana")], result.Assignments);
    }

    [Fact]
    public void A_lock_wins_even_when_the_person_is_unavailable_or_the_shift_is_full()
    {
        // BR-004: locks are preserved exactly, even when they break another rule.
        var solo = Shift("solo", headcount: 1);
        var input = Input([solo], ThreePeople, [], locked: [new Assignment("solo", "ana"), new Assignment("solo", "ben")]);

        var result = generator.Generate(input);

        Assert.Equal([new("solo", "ana"), new("solo", "ben")], result.Assignments);
    }

    [Fact]
    public void Lists_assignments_in_the_order_of_the_input_shifts()
    {
        var input = Input(
            [TwoDays[3], TwoDays[0]],
            ThreePeople,
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
        Assert.Contains(result.Issues, issue => issue.Code == IssueCodes.BelowHeadcount);
        Assert.True(result.Score < 0);
    }

    [Fact]
    public void Same_input_gives_the_same_result_byte_for_byte()
    {
        var input = Input(TwoDays, ThreePeople, [Available("ana", "mon-open", "tue-open"), Available("ben", "mon-close")]);

        var first = JsonSerializer.Serialize(generator.Generate(input));
        var second = JsonSerializer.Serialize(generator.Generate(input));

        Assert.Equal(first, second);
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
