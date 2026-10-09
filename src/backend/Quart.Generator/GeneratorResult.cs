namespace Quart.Generator;

/// <summary>What the generator produced, and how good it is (AD-003, spec 7.2).</summary>
/// <param name="Assignments">Every person on every shift, locked ones included, in the order of the input's shifts.</param>
/// <param name="Issues">What the <see cref="Evaluator"/> found in the assignments (AD-002).</param>
/// <param name="Score">The <see cref="Evaluator"/>'s grade: 0 is perfect, and every problem takes points off.</param>
/// <param name="Seed">The seed that produced this result. Store it to reproduce the result exactly (FR-122).</param>
public sealed record GeneratorResult(
    IReadOnlyList<Assignment> Assignments,
    IReadOnlyList<GeneratorIssue> Issues,
    int Score,
    int Seed);

/// <summary>
/// One problem with a schedule. The server sends a stable code and its parameters, never a sentence;
/// the web app translates them (FR-263).
/// </summary>
/// <param name="Code">Stable and dotted, one of <see cref="IssueCodes"/>.</param>
/// <param name="ShiftIds">The shifts the issue concerns, so the screen can highlight them.</param>
/// <param name="MemberIds">The people the issue concerns.</param>
/// <param name="Parameters">Values for the translated text, such as an hour count.</param>
public sealed record GeneratorIssue(
    string Code,
    IReadOnlyList<string> ShiftIds,
    IReadOnlyList<string> MemberIds,
    IReadOnlyDictionary<string, string> Parameters);
