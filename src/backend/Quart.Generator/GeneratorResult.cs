namespace Quart.Generator;

/// <summary>What the generator produced, and how good it is (AD-003, spec 7.2).</summary>
/// <param name="Assignments">Every person on every shift, locked ones included, in the order of the input's shifts.</param>
/// <param name="Issues">What the <see cref="Evaluator"/> found in the assignments (AD-002).</param>
/// <param name="Score">The <see cref="Evaluator"/>'s grade: 0 is perfect, and every problem takes points off.</param>
/// <param name="Seed">The seed that produced this result. Store it to reproduce the result exactly (FR-122).</param>
/// <param name="Members">The <see cref="Evaluator"/>'s totals per member, in the input's order of members.</param>
/// <param name="ConstructionScore">The score of the first schedule, before local search improved it (M1-05). Never above <paramref name="Score"/>.</param>
public sealed record GeneratorResult(
    IReadOnlyList<Assignment> Assignments,
    IReadOnlyList<GeneratorIssue> Issues,
    int Score,
    int Seed,
    IReadOnlyList<MemberSummary> Members,
    int ConstructionScore);

/// <summary>One member's totals in a schedule, for the tables beside the grid: the lab's hours table, and later the live hours counter (FR-141).</summary>
/// <param name="Hours">Over the whole period, locks included, at the full shift length (BR-031).</param>
/// <param name="TargetHours">Desired weekly hours times the weeks of the period (BR-032).</param>
/// <param name="WeeklyHours">Hours in each week of the period, the first week first.</param>
/// <param name="Openings">Opening shifts worked: the first of their day (BR-034). A day's only shift is both an opening and a closing.</param>
/// <param name="ExpectedOpenings">
/// The fair number of openings (BR-021, BR-022): the person's shifts times the share of openings among
/// the shifts they are available for, to 2 decimals. Someone only free in the evenings expects none.
/// </param>
/// <param name="Closings">Closing shifts worked: the last of their day (BR-034).</param>
/// <param name="ExpectedClosings">As <paramref name="ExpectedOpenings"/>, for closings.</param>
public sealed record MemberSummary(
    string MemberId,
    decimal Hours,
    decimal TargetHours,
    IReadOnlyList<decimal> WeeklyHours,
    int Openings,
    decimal ExpectedOpenings,
    int Closings,
    decimal ExpectedClosings);

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
    IReadOnlyDictionary<string, string> Parameters)
{
    /// <summary>True when the issue is a broken hard rule (<see cref="IssueCodes.HardRules"/>), which the generator never causes.</summary>
    public bool HardRule => IssueCodes.HardRules.Contains(Code);
}
