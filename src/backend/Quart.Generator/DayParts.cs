namespace Quart.Generator;

/// <summary>Where a shift sits in its day. A day's only shift is both its opening and its closing.</summary>
[Flags]
public enum DayPart
{
    Mid = 0,
    Opening = 1,
    Closing = 2,
}

/// <summary>
/// Opening and closing are found automatically: the first and the last shift of each day, by start
/// time (BR-034). Fairness (BR-013, BR-014) counts them. An admin override comes with the shift
/// template (M3).
/// </summary>
public static class DayParts
{
    public static IReadOnlyDictionary<string, DayPart> Of(IEnumerable<GeneratorShift> shifts)
    {
        var parts = new Dictionary<string, DayPart>(StringComparer.Ordinal);
        foreach (var day in shifts.GroupBy(shift => shift.Date))
        {
            var ordered = day.OrderBy(shift => shift.Start).ThenBy(shift => shift.End).ToList();
            foreach (var shift in ordered)
            {
                parts[shift.Id] = DayPart.Mid;
            }
            parts[ordered[0].Id] |= DayPart.Opening;
            parts[ordered[^1].Id] |= DayPart.Closing;
        }
        return parts;
    }
}
