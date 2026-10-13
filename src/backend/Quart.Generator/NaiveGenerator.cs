namespace Quart.Generator;

/// <summary>
/// The simplest generator that could possibly work (M1-01): it keeps the locked assignments, then
/// fills each shift's free slots with the first members, in input order, that the
/// <see cref="CandidateFilter"/> allows. It never breaks a hard rule (M1-03), but it ignores levels,
/// hours and fairness, so its schedules are poor on purpose. It exists so the lab works end to end;
/// later generators replace it behind <see cref="IScheduleGenerator"/>.
/// </summary>
public sealed class NaiveGenerator : IScheduleGenerator
{
    public GeneratorResult Generate(GeneratorInput input)
    {
        GeneratorInputValidator.ThrowIfInvalid(input);

        // Locks always survive, even when there are more of them than the headcount (BR-004).
        var filter = new CandidateFilter(input);
        foreach (var shift in input.Shifts)
        {
            foreach (var member in input.Members)
            {
                if (filter.OpenSlots(shift.Id) == 0)
                {
                    break;
                }
                if (filter.CanAssign(shift.Id, member.Id))
                {
                    filter.Assign(shift.Id, member.Id);
                }
            }
        }

        var assignments = filter.Assignments;
        var evaluation = Evaluator.Evaluate(input, assignments);
        return new GeneratorResult(assignments, evaluation.Issues, evaluation.Score, input.Seed);
    }
}
