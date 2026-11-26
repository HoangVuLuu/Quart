using Quart.Generator;
using Xunit;

namespace Quart.Generator.Tests;

/// <summary>
/// Staging's period of 2026-11-30 (four weeks, two shifts a day, 13 people), as the app sent it to the generator:
/// desired hours capped at each person's maximum. Aymen and Ayman may work 12 hours (2 shifts) a week.
/// </summary>
public sealed class LowMaximumTests
{
    // Desired hours as the app sends them: capped at the person's maximum.
    private static readonly (string Name, decimal? Max, decimal Desired, bool Sent, int[] Free)[] People =
    [
        ("Ayman", 12, 12, true, [0,1,2,4,5,6,8,9,14,15,16,18,19,20,22,23,28,29,30,32,33,34,36,37,42,43,44,46,47,48,50,51]),
        ("Aymen", 12, 12, true, [6,12,14,18,20,32,34,38,40,42,44,46,48,52,54]),
        ("Cecilia", null, 30, true, [5,6,8,11,12,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,52,54]),
        ("Emilie", null, 30, true, [1,5,7,15,19,20,21,22,23,24,26,28,35,40,42,44]),
        ("Jay", null, 30, true, [7,10,12,13,14,15,21,24,26,27,29,32,47,48,49,50,51,52,53,54,55]),
        ("Joseph", null, 30, true, [0,2,4,8,10,12,13,14,16,24,26,27,28,32,36,38,40,41,42,44,46,53,54,55]),
        ("Kym-Anh", null, 30, true, [2,11,16,25,30,39,53]),
        ("Lili", null, 30, true, [7,9,12,13,19,21,23,24,25,26,27,33,35,37,38,39]),
        ("Noemie", null, 30, true, [9,10,21,22,23,24,26,27,28,29,30,32,34,36,38,40,42,44,46,48,50]),
        ("Philippe", null, 0, false, []),
        ("Selma", 30, 30, true, [0,2,3,5,6,7,8,9,10,11,12,13,14,16,17,19,21,22,23,24,25,26,27,28,30,31,33,34,35,36,38,40,41,42,44,45,47,48,49,50,51,52,53,54,55]),
        ("Tony", null, 30, true, [0,4,6,14,18,20,28,32,34,42,46,48]),
        ("Wendy", 18, 18, true, [10,12,13,24,26,27,38,40,41,46,47,48,49,52,54,55]),
    ];

    private static GeneratorInput Input(int seed)
    {
        var first = new DateOnly(2026, 11, 30);
        var shifts = Enumerable.Range(0, 56).Select(i => new GeneratorShift(
            $"s{i}", i % 2 == 0 ? "open" : "close", first.AddDays(i / 2),
            i % 2 == 0 ? new TimeOnly(10, 0) : new TimeOnly(16, 0), i % 2 == 0 ? new TimeOnly(16, 0) : new TimeOnly(22, 0),
            2, [new LevelRequirement(3, 1)])).ToList();
        return new GeneratorInput(
            shifts,
            People.Select(p => new GeneratorMember(p.Name, 3, p.Desired, p.Max)).ToList(),
            People.Where(p => p.Sent).Select(p => new MemberAvailability(p.Name, true, p.Free.Select(i => $"s{i}").ToList())).ToList(),
            [], [], [], new GeneratorRules(2, true, true), seed);
    }

    [Theory]
    [InlineData(880354332)]
    [InlineData(1766914784)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void Someone_with_a_low_maximum_still_gets_a_shift_every_week(int seed)
    {
        // Hoang, 2026-11-26: with the gap counted in hours, Aymen got 0/0/0/1 shifts while free every week.
        var result = new ScheduleGenerator().Generate(Input(seed));

        foreach (var name in new[] { "Aymen", "Ayman" })
        {
            var weeks = Enumerable.Range(0, 4)
                .Select(week => result.Assignments.Count(a => a.MemberId == name && int.Parse(a.ShiftId[1..]) / 14 == week))
                .ToList();
            Assert.All(weeks, count => Assert.InRange(count, 1, 2));
        }
    }
}
