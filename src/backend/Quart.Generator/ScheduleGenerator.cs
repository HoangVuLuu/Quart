namespace Quart.Generator;

/// <summary>
/// The generator (AD-004, spec 7.7): a randomized greedy construction (M1-04), improved by local search
/// (M1-05). Every phase places people only through one <see cref="CandidateFilter"/>, so no phase can
/// break a hard rule; a slot nobody can legally fill stays open (FR-125). All randomness comes from the
/// input's seed, so the same input and seed give the same schedule (FR-122).
/// </summary>
public sealed class ScheduleGenerator : IScheduleGenerator
{
    public GeneratorResult Generate(GeneratorInput input)
    {
        GeneratorInputValidator.ThrowIfInvalid(input);

        var random = new SeededRandom(input.Seed);
        var filter = new CandidateFilter(input); // starts from the locks (BR-004)
        GreedyConstruction.Run(input, filter, random);
        var rulebook = new Evaluator.Rulebook(input);
        var constructionScore = Evaluator.Score(rulebook, filter.Assignments);
        LocalSearch.Run(input, filter, random, rulebook, constructionScore);

        var assignments = filter.Assignments;
        var evaluation = Evaluator.Evaluate(rulebook, assignments);
        return new GeneratorResult(assignments, evaluation.Issues, evaluation.Score, input.Seed, evaluation.Members, constructionScore);
    }
}
