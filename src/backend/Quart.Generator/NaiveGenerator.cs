namespace Quart.Generator;

/// <summary>
/// The simplest generator that could possibly work (M1-01): it keeps the locked assignments, then
/// fills each shift's free slots with the first members, in input order, who said they were available.
/// It ignores levels, hours, overlaps, consecutive shifts and conflict pairs, so its schedules are
/// poor on purpose. It exists so the lab works end to end on day one; later generators replace it
/// behind <see cref="IScheduleGenerator"/>.
/// </summary>
public sealed class NaiveGenerator : IScheduleGenerator
{
    public GeneratorResult Generate(GeneratorInput input)
    {
        GeneratorInputValidator.ThrowIfInvalid(input);

        var availableShifts = input.Availability
            .Where(entry => entry.Submitted)
            .ToDictionary(entry => entry.MemberId, entry => entry.ShiftIds.ToHashSet(StringComparer.Ordinal), StringComparer.Ordinal);
        var lockedByShift = input.LockedAssignments.ToLookup(assignment => assignment.ShiftId, StringComparer.Ordinal);

        var assignments = new List<Assignment>();
        foreach (var shift in input.Shifts)
        {
            // Locks always survive, even when there are more of them than the headcount (BR-004).
            var onShift = lockedByShift[shift.Id].Select(assignment => assignment.MemberId).ToList();
            foreach (var member in input.Members)
            {
                if (onShift.Count >= shift.Headcount)
                {
                    break;
                }
                if (!onShift.Contains(member.Id)
                    && availableShifts.TryGetValue(member.Id, out var shifts)
                    && shifts.Contains(shift.Id))
                {
                    onShift.Add(member.Id);
                }
            }

            assignments.AddRange(onShift.Select(memberId => new Assignment(shift.Id, memberId)));
        }

        var evaluation = Evaluator.Evaluate(input, assignments);
        return new GeneratorResult(assignments, evaluation.Issues, evaluation.Score, input.Seed);
    }
}
