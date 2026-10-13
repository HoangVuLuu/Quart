namespace Quart.Generator;

/// <summary>
/// The issue types the <see cref="Evaluator"/> reports (FR-143), in the order the issues list shows them.
/// Codes are stable: the web app translates them (FR-263) and stored drafts carry them, so add new ones
/// and never rename existing ones. The parameters each one carries are listed beside it.
/// </summary>
public static class IssueCodes
{
    /// <summary>A shift with fewer people than its headcount. Parameters: <c>assigned</c>, <c>headcount</c>.</summary>
    public const string BelowHeadcount = "issue.below_headcount";

    /// <summary>
    /// A shift with more people than its headcount (BR-003). Only a lock or a manual edit can do this.
    /// Parameters: <c>assigned</c>, <c>headcount</c>.
    /// </summary>
    public const string AboveHeadcount = "issue.above_headcount";

    /// <summary>A shift short of a level requirement. Parameters: <c>level</c>, <c>required</c>, <c>present</c> (people at that level or above).</summary>
    public const string MissingLevel = "issue.missing_level";

    /// <summary>
    /// Someone on a shift they did not mark themselves available for, or that overlaps a time they are
    /// busy at another workplace (BR-002). Both read the same, so the other workplace stays hidden
    /// (FR-094). No parameters.
    /// </summary>
    public const string Unavailable = "issue.unavailable";

    /// <summary>Someone on a shift who never sent availability. No parameters.</summary>
    public const string NotSubmitted = "issue.not_submitted";

    /// <summary>Someone on two shifts that overlap in time (BR-002). Both shifts are in the shift ids. No parameters.</summary>
    public const string OverlappingShifts = "issue.overlapping_shifts";

    /// <summary>Someone more than 2 hours under their desired hours over the period (BR-033). Parameters: <c>hours</c>, <c>target</c>.</summary>
    public const string UnderHours = "issue.under_hours";

    /// <summary>Someone more than 2 hours over their desired hours over the period (BR-033). Parameters: <c>hours</c>, <c>target</c>.</summary>
    public const string OverHours = "issue.over_hours";

    /// <summary>More shifts in a row than the workplace allows (BR-005). Parameters: <c>count</c>, <c>max</c>.</summary>
    public const string ConsecutiveShifts = "issue.consecutive_shifts";

    /// <summary>Someone on more than one shift in a day (BR-015). Parameters: <c>date</c> (YYYY-MM-DD), <c>count</c>.</summary>
    public const string DoubleShift = "issue.double_shift";

    /// <summary>A "cannot work together" pair on the same shift (BR-036). No parameters; both people are in the member ids.</summary>
    public const string IncompatiblePair = "issue.incompatible_pair";

    /// <summary>Every code, in display order.</summary>
    public static IReadOnlyList<string> All { get; } =
    [
        BelowHeadcount, AboveHeadcount, MissingLevel, Unavailable, NotSubmitted, OverlappingShifts, UnderHours, OverHours,
        ConsecutiveShifts, DoubleShift, IncompatiblePair,
    ];

    /// <summary>
    /// The codes that mean a hard rule is broken (spec 7.3, BR-036). The generator never causes one;
    /// only a lock or a manual edit can.
    /// </summary>
    public static IReadOnlySet<string> HardRules { get; } = new HashSet<string>(StringComparer.Ordinal)
    {
        AboveHeadcount, Unavailable, NotSubmitted, OverlappingShifts, ConsecutiveShifts, IncompatiblePair,
    };
}
