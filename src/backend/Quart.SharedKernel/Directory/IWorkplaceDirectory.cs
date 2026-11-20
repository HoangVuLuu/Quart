using NodaTime;
using Quart.SharedKernel.Access;

namespace Quart.SharedKernel.Directory;

/// <summary>
/// What the other modules may read about a workplace: its people, its weekly template and its rules.
/// Implemented by the Workplaces module (AD-015: nobody queries its tables).
/// </summary>
public interface IWorkplaceDirectory
{
    /// <summary>Active members only, each with their current name.</summary>
    Task<IReadOnlyList<WorkplaceMember>> GetMembersAsync(Guid workplaceId, CancellationToken cancellationToken);

    /// <returns>Null when the workplace does not exist.</returns>
    Task<WorkplaceTemplate?> GetTemplateAsync(Guid workplaceId, CancellationToken cancellationToken);
}

public sealed record WorkplaceMember(
    Guid MembershipId,
    Guid UserId,
    string DisplayName,
    string Language,
    string Role,
    int Level,
    bool WorksShifts,
    decimal? MaxWeeklyHours,
    IReadOnlySet<Permission> Permissions)
{
    public bool Can(Permission permission) => Permissions.Contains(permission);
}

/// <summary>The weekly grid and the rules a period is built from (AD-010).</summary>
public sealed record WorkplaceTemplate(
    string Name,
    DateTimeZone TimeZone,
    WorkplaceRules Rules,
    IReadOnlyList<TemplateBlock> Blocks,
    IReadOnlyList<TemplateConflict> Conflicts);

/// <param name="MaxConsecutiveShifts">1 to 4, or null for no limit (BR-005).</param>
/// <param name="PublishChecks">Per issue code: "block", "confirm" or "show" (FR-144).</param>
/// <param name="RequestDaysBefore">0 to 28: how many days before a period starts its availability request goes out; 0 means when it is opened (FR-091).</param>
public sealed record WorkplaceRules(
    int PeriodWeeks,
    int? MaxConsecutiveShifts,
    bool OpeningFairness,
    bool ClosingFairness,
    bool ClaimsNeedApproval,
    bool TradesNeedApproval,
    IReadOnlyDictionary<string, string> PublishChecks,
    int RequestDaysBefore);

/// <param name="Days">ISO weekdays the block runs on.</param>
public sealed record TemplateBlock(
    Guid Id,
    IReadOnlyList<IsoDayOfWeek> Days,
    LocalTime Start,
    LocalTime End,
    int Headcount,
    IReadOnlyList<TemplateRequirement> Requirements);

public sealed record TemplateRequirement(int Level, int MinCount);

/// <summary>Two members who must not share a shift of this block (BR-036).</summary>
public sealed record TemplateConflict(Guid BlockId, Guid MembershipA, Guid MembershipB);

/// <summary>
/// Told, in the same request, when someone leaves or is removed (FR-038). The Scheduling module releases
/// their future shifts; handlers must cope with being told twice.
/// </summary>
public interface IMemberLeftHandler
{
    Task HandleAsync(Guid workplaceId, Guid membershipId, CancellationToken cancellationToken);
}
