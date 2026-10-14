using System.Text.Json;

namespace Quart.Generator.Tests;

/// <summary>The lab's Presotea sample: 15 people, an opening and a closing a day, two per shift with at least one level 3, over two weeks.</summary>
internal static class Samples
{
    public static GeneratorInput Presotea { get; } = Load("presotea");

    /// <summary>
    /// The sample over 4 weeks, Presotea's longest period (FR-090): its two weeks again, two weeks later,
    /// with the same availability. With <paramref name="copies"/> above 1, every person is repeated with
    /// the same level, hours and availability, for a bigger team.
    /// </summary>
    public static GeneratorInput PresoteaFourWeeks(int copies = 1)
    {
        var sample = Presotea;
        static string Later(string shiftId) => $"{shiftId}+2w";
        var shifts = sample.Shifts.Concat(sample.Shifts.Select(shift => shift with { Id = Later(shift.Id), Date = shift.Date.AddDays(14) })).ToList();
        var availability = sample.Availability
            .Select(entry => entry with { ShiftIds = [.. entry.ShiftIds, .. entry.ShiftIds.Select(Later)] })
            .ToList();

        static string Copy(string memberId, int copy) => copy == 0 ? memberId : $"{memberId}-{copy}";
        return sample with
        {
            Shifts = shifts,
            Members = Enumerable.Range(0, copies).SelectMany(copy => sample.Members.Select(member => member with { Id = Copy(member.Id, copy) })).ToList(),
            Availability = Enumerable.Range(0, copies).SelectMany(copy => availability.Select(entry => entry with { MemberId = Copy(entry.MemberId, copy) })).ToList(),
        };
    }

    private static GeneratorInput Load(string name)
    {
        using var file = File.OpenRead(Path.Combine(AppContext.BaseDirectory, "Scenarios", $"{name}.json"));
        using var json = JsonDocument.Parse(file);
        return json.RootElement.GetProperty("input").Deserialize<GeneratorInput>(JsonSerializerOptions.Web)!;
    }
}
