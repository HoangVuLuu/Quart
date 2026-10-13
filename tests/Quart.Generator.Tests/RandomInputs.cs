using System.Text.Json;
using CsCheck;

namespace Quart.Generator.Tests;

/// <summary>
/// Random generator inputs for the property tests (AD-005): 1 to 30 people over 1 to 4 weeks, one to
/// three shift blocks a day at random times, so blocks often overlap (FR-063), random headcounts and
/// level requirements, maximum weekly hours, availability from none to everything, people who never sent it, busy times at
/// another workplace, conflict pairs, and locks that may themselves break any rule. CsCheck shrinks a
/// failing input towards a small one.
/// </summary>
internal static class RandomInputs
{
    private static readonly DateOnly FirstDay = new(2026, 10, 5); // a Monday

    public static Gen<GeneratorInput> Any { get; } =
        from people in Gen.Int[1, 30]
        from weeks in Gen.Int[1, 4]
        from blocks in Gen.Select(Gen.Int[6, 20], Gen.Int[2, 8]).Array[1, 3] // start hour and length
        from shifts in Shifts(weeks * 7, blocks)
        from members in Gen.Select(Gen.Int[1, 3], Gen.Int[0, 40], Gen.Int[0, 50]).Array[people] // level, desired hours, maximum (over 40: none)
        from availability in Availability(shifts).Array[people]
        from busy in Busy(weeks * 7).Array[people]
        from locks in Locks(shifts.Length, people)
        from pairs in Pairs(blocks.Length, people)
        from maxConsecutive in Gen.Int[0, 4] // 0 for no limit
        from fairness in Gen.Bool.Array[2]
        from seed in Gen.Int
        select Build(shifts, members, availability, busy, locks, pairs, maxConsecutive, fairness, seed);

    /// <summary>
    /// The input as the lab's <c>POST /api/lab/generate</c> takes it, so a shrunk counterexample can be
    /// pasted straight into the lab (and into its scenario import from M1-06).
    /// </summary>
    public static string Json(GeneratorInput input) => JsonSerializer.Serialize(input, JsonSerializerOptions.Web);

    private static Gen<GeneratorShift[]> Shifts(int days, (int Start, int Length)[] blocks) =>
        Gen.Select(Gen.Int[0, 9], Gen.Int[0, 3], Gen.Int[0, 3], Gen.Int[1, 3]).Array[days * blocks.Length]
            .Select(draws => draws
                .Select((draw, i) => (Draw: draw, Day: i / blocks.Length, Block: i % blocks.Length))
                .Where(shift => shift.Draw.Item1 > 0) // about one in ten is closed that day
                .Select(shift =>
                {
                    var (_, headcount, level, count) = shift.Draw;
                    var (start, length) = blocks[shift.Block];
                    IReadOnlyList<LevelRequirement> requirements = level > 0 && headcount > 0
                        ? [new LevelRequirement(level, Math.Min(count, headcount))]
                        : [];
                    return new GeneratorShift(
                        $"d{shift.Day}b{shift.Block}",
                        $"b{shift.Block}",
                        FirstDay.AddDays(shift.Day),
                        new TimeOnly(start, 0),
                        new TimeOnly(Math.Min(start + length, 23), 0),
                        headcount,
                        requirements);
                })
                .ToArray());

    private static Gen<(bool Submitted, string[] ShiftIds)> Availability(GeneratorShift[] shifts) =>
        from submitted in Gen.Int[0, 9] // about one in ten never sent it
        from density in Gen.Int[0, 10]
        from picks in Gen.Int[0, 9].Array[shifts.Length]
        select (submitted > 0, shifts.Where((_, i) => picks[i] < density).Select(shift => shift.Id).ToArray());

    // Up to two busy times each, which may run past midnight.
    private static Gen<(DateTime Start, DateTime End)[]> Busy(int days) =>
        Gen.Select(Gen.Int[0, days - 1], Gen.Int[0, 23], Gen.Int[1, 12]).Array[0, 2]
            .Select(times => times
                .Select(time =>
                {
                    var start = FirstDay.AddDays(time.Item1).ToDateTime(new TimeOnly(time.Item2, 0));
                    return (start, start.AddHours(time.Item3));
                })
                .ToArray());

    private static Gen<(int Shift, int Member)[]> Locks(int shifts, int people) =>
        shifts == 0
            ? Gen.Const(Array.Empty<(int, int)>())
            : Gen.Select(Gen.Int[0, shifts - 1], Gen.Int[0, people - 1]).Array[0, 8];

    private static Gen<(int Block, int A, int B)[]> Pairs(int blocks, int people) =>
        people < 2
            ? Gen.Const(Array.Empty<(int, int, int)>())
            : Gen.Select(Gen.Int[0, blocks - 1], Gen.Int[0, people - 1], Gen.Int[0, people - 1]).Array[0, 6];

    private static GeneratorInput Build(
        GeneratorShift[] shifts,
        (int Level, int Desired, int Max)[] members,
        (bool Submitted, string[] ShiftIds)[] availability,
        (DateTime Start, DateTime End)[][] busy,
        (int Shift, int Member)[] locks,
        (int Block, int A, int B)[] pairs,
        int maxConsecutive,
        bool[] fairness,
        int seed)
    {
        var ids = Enumerable.Range(0, members.Length).Select(i => $"m{i}").ToArray();
        var blockIds = shifts.Select(shift => shift.BlockId).ToHashSet();
        return new GeneratorInput(
            shifts,
            members.Select((member, i) => new GeneratorMember(ids[i], member.Level, member.Desired, member.Max > 40 ? null : member.Max)).ToList(),
            availability.Select((entry, i) => new MemberAvailability(ids[i], entry.Submitted, entry.ShiftIds)).ToList(),
            busy.SelectMany((times, i) => times.Select(time => new BusyTime(ids[i], time.Start, time.End))).ToList(),
            locks.Distinct().Select(lockAt => new Assignment(shifts[lockAt.Shift].Id, ids[lockAt.Member])).ToList(),
            pairs.Where(pair => pair.A != pair.B && blockIds.Contains($"b{pair.Block}"))
                .Select(pair => new ConflictPair($"b{pair.Block}", ids[pair.A], ids[pair.B]))
                .ToList(),
            new GeneratorRules(maxConsecutive == 0 ? null : maxConsecutive, fairness[0], fairness[1]),
            seed);
    }
}
