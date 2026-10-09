using static Quart.Generator.Tests.Inputs;

namespace Quart.Generator.Tests;

/// <summary>An input is checked for consistency before any generator sees it, with a code and a path per problem.</summary>
public sealed class GeneratorInputValidatorTests
{
    private static GeneratorInput Valid() => Input(
        TwoDays,
        ThreePeople,
        [Available("ana", "mon-open"), Available("ben", "tue-close")],
        locked: [new Assignment("mon-open", "ana")],
        conflicts: [new ConflictPair("closing", "ben", "cleo")]);

    [Fact]
    public void A_consistent_input_has_no_errors()
    {
        Assert.Empty(GeneratorInputValidator.Validate(Valid()));
    }

    [Fact]
    public void An_empty_input_is_valid()
    {
        Assert.Empty(GeneratorInputValidator.Validate(Input([], [], [])));
    }

    [Fact]
    public void A_missing_input_is_reported()
    {
        Assert.Equal([new InputError(GeneratorInputValidator.Required, "")], GeneratorInputValidator.Validate(null));
    }

    [Fact]
    public void Missing_lists_are_reported_by_name()
    {
        // JSON without a field arrives as null, whatever the type says.
        var input = new GeneratorInput(null!, null!, null!, null!, null!, null!, Seed: 1);

        Assert.Equal(
            ["shifts", "members", "availability", "lockedAssignments", "conflictPairs", "rules"],
            GeneratorInputValidator.Validate(input).Select(error => error.Path));
    }

    public static TheoryData<string, Func<GeneratorInput, GeneratorInput>, string, string> Broken => new()
    {
        {
            "duplicate shift id",
            input => input with { Shifts = [.. input.Shifts, Shift("mon-open")] },
            GeneratorInputValidator.Duplicate, "shifts[4].id"
        },
        {
            "shift with no id",
            input => input with { Shifts = [Shift(" ")] },
            GeneratorInputValidator.Required, "shifts[0].id"
        },
        {
            "shift ending before it starts",
            input => input with { Shifts = [Shift("late", start: "22:00", end: "02:00")] },
            GeneratorInputValidator.EndNotAfterStart, "shifts[0].end"
        },
        {
            "negative headcount",
            input => input with { Shifts = [Shift("x", headcount: -1)] },
            GeneratorInputValidator.OutOfRange, "shifts[0].headcount"
        },
        {
            "level requirement above level 3",
            input => input with { Shifts = [Shift("x") with { LevelRequirements = [new LevelRequirement(4, 1)] }] },
            GeneratorInputValidator.OutOfRange, "shifts[0].levelRequirements[0].level"
        },
        {
            "level requirement asking for more people than the headcount",
            input => input with { Shifts = [Shift("x", headcount: 2) with { LevelRequirements = [new LevelRequirement(3, 3)] }] },
            GeneratorInputValidator.OutOfRange, "shifts[0].levelRequirements[0].minCount"
        },
        {
            "duplicate member id",
            input => input with { Members = [.. input.Members, Member("ana")] },
            GeneratorInputValidator.Duplicate, "members[3].id"
        },
        {
            "member level 0",
            input => input with { Members = [Member("ana", level: 0), Member("ben"), Member("cleo")] },
            GeneratorInputValidator.OutOfRange, "members[0].level"
        },
        {
            "negative desired hours",
            input => input with { Members = [Member("ana", desired: -1), Member("ben"), Member("cleo")] },
            GeneratorInputValidator.OutOfRange, "members[0].desiredWeeklyHours"
        },
        {
            "availability for an unknown member",
            input => input with { Availability = [Available("zoe", "mon-open")] },
            GeneratorInputValidator.UnknownMember, "availability[0].memberId"
        },
        {
            "two availability entries for one member",
            input => input with { Availability = [Available("ana"), Available("ana")] },
            GeneratorInputValidator.Duplicate, "availability[1].memberId"
        },
        {
            "availability for an unknown shift",
            input => input with { Availability = [Available("ana", "mon-open", "sun-open")] },
            GeneratorInputValidator.UnknownShift, "availability[0].shiftIds[1]"
        },
        {
            "lock on an unknown shift",
            input => input with { LockedAssignments = [new Assignment("sun-open", "ana")] },
            GeneratorInputValidator.UnknownShift, "lockedAssignments[0].shiftId"
        },
        {
            "the same lock twice",
            input => input with { LockedAssignments = [new Assignment("mon-open", "ana"), new Assignment("mon-open", "ana")] },
            GeneratorInputValidator.Duplicate, "lockedAssignments[1]"
        },
        {
            "conflict pair on an unknown block",
            input => input with { ConflictPairs = [new ConflictPair("lunch", "ana", "ben")] },
            GeneratorInputValidator.UnknownBlock, "conflictPairs[0].blockId"
        },
        {
            "conflict pair of one person with themselves",
            input => input with { ConflictPairs = [new ConflictPair("opening", "ana", "ana")] },
            GeneratorInputValidator.SameMember, "conflictPairs[0].memberB"
        },
        {
            "conflict pair with an unknown member",
            input => input with { ConflictPairs = [new ConflictPair("opening", "ana", "zoe")] },
            GeneratorInputValidator.UnknownMember, "conflictPairs[0].memberB"
        },
        {
            "more than 4 consecutive shifts",
            input => input with { Rules = input.Rules with { MaxConsecutiveShifts = 5 } },
            GeneratorInputValidator.OutOfRange, "rules.maxConsecutiveShifts"
        },
    };

    [Theory]
    [MemberData(nameof(Broken))]
    public void Reports_what_is_wrong_and_where(string _, Func<GeneratorInput, GeneratorInput> breakIt, string code, string path)
    {
        var errors = GeneratorInputValidator.Validate(breakIt(Valid()));

        Assert.Contains(new InputError(code, path), errors);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(1)]
    [InlineData(4)]
    public void Max_consecutive_shifts_is_1_to_4_or_no_limit(int? max)
    {
        var input = Valid() with { Rules = Rules with { MaxConsecutiveShifts = max } };

        Assert.Empty(GeneratorInputValidator.Validate(input));
    }
}
