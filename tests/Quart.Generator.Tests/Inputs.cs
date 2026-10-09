namespace Quart.Generator.Tests;

/// <summary>Small hand-built inputs for tests: two days of an opening and a closing, and three people.</summary>
internal static class Inputs
{
    public static GeneratorShift Shift(string id, string date = "2026-10-05", string start = "10:00", string end = "16:00", int headcount = 2, string blockId = "opening") =>
        new(id, blockId, DateOnly.Parse(date), TimeOnly.Parse(start), TimeOnly.Parse(end), headcount, []);

    public static GeneratorMember Member(string id, int level = 1, decimal desired = 10, decimal? max = null) =>
        new(id, level, desired, max);

    public static MemberAvailability Available(string memberId, params string[] shiftIds) =>
        new(memberId, Submitted: true, shiftIds);

    public static GeneratorRules Rules { get; } = new(MaxConsecutiveShifts: 3, OpeningFairness: false, ClosingFairness: false);

    public static GeneratorInput Input(
        IReadOnlyList<GeneratorShift> shifts,
        IReadOnlyList<GeneratorMember> members,
        IReadOnlyList<MemberAvailability> availability,
        IReadOnlyList<Assignment>? locked = null,
        IReadOnlyList<ConflictPair>? conflicts = null,
        int seed = 1) =>
        new(shifts, members, availability, locked ?? [], conflicts ?? [], Rules, seed);

    /// <summary>Monday and Tuesday, an opening and a closing each, two people per shift.</summary>
    public static GeneratorShift[] TwoDays { get; } =
    [
        Shift("mon-open", "2026-10-05", "10:00", "16:00"),
        Shift("mon-close", "2026-10-05", "16:00", "23:00", blockId: "closing"),
        Shift("tue-open", "2026-10-06", "10:00", "16:00"),
        Shift("tue-close", "2026-10-06", "16:00", "23:00", blockId: "closing"),
    ];

    public static GeneratorMember[] ThreePeople { get; } = [Member("ana", level: 3), Member("ben", level: 2), Member("cleo")];
}
