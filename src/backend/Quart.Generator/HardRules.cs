namespace Quart.Generator;

/// <summary>
/// The pieces of the hard rules (spec 7.3) that both the <see cref="Evaluator"/> and the
/// <see cref="CandidateFilter"/> need, written once so the two cannot drift apart (AD-002).
/// </summary>
internal static class HardRules
{
    /// <summary>
    /// Who can work which shift: members who submitted, for the shifts they marked (BR-001), less any
    /// shift that overlaps a time they are busy at another workplace (BR-002).
    /// </summary>
    public static HashSet<(string MemberId, string ShiftId)> Available(GeneratorInput input)
    {
        var shifts = input.Shifts.ToDictionary(shift => shift.Id, StringComparer.Ordinal);
        var busy = input.BusyTimes.ToLookup(time => time.MemberId, StringComparer.Ordinal);
        return input.Availability
            .Where(entry => entry.Submitted)
            .SelectMany(entry => entry.ShiftIds.Select(shiftId => (entry.MemberId, ShiftId: shiftId)))
            .Where(pair => !busy[pair.MemberId].Any(time => Overlap(shifts[pair.ShiftId], time)))
            .ToHashSet();
    }

    /// <summary>
    /// Two shifts overlap when they share a moment. Ranges are half-open, so a shift ending at 16:00
    /// and one starting at 16:00 do not (AD-011). A shift never runs past midnight, so only shifts on
    /// the same date can overlap.
    /// </summary>
    public static bool Overlap(GeneratorShift a, GeneratorShift b) =>
        a.Date == b.Date && a.Start < b.End && b.Start < a.End;

    /// <summary>A shift and a busy time overlap when they share a moment; half-open, like two shifts.</summary>
    public static bool Overlap(GeneratorShift shift, BusyTime busy) =>
        shift.Date.ToDateTime(shift.Start) < busy.End && busy.Start < shift.Date.ToDateTime(shift.End);
}
