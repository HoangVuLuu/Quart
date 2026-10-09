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

    /// <summary>A shift short of a level requirement. Parameters: <c>level</c>, <c>required</c>, <c>present</c> (people at that level or above).</summary>
    public const string MissingLevel = "issue.missing_level";

    /// <summary>Someone on a shift they did not mark themselves available for. No parameters.</summary>
    public const string Unavailable = "issue.unavailable";

    /// <summary>Someone on a shift who never sent availability. No parameters.</summary>
    public const string NotSubmitted = "issue.not_submitted";

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
        BelowHeadcount, MissingLevel, Unavailable, NotSubmitted, UnderHours, OverHours, ConsecutiveShifts, DoubleShift, IncompatiblePair,
    ];
}
