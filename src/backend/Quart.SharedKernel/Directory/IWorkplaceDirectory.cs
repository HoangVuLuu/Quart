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

    /// <summary>
    /// Every membership the account has or once had, in any workplace: for deleting an account (FR-009), whose
    /// data hangs off membership IDs in the other modules.
    /// </summary>
    Task<IReadOnlyList<AccountMembership>> GetMembershipsOfAsync(Guid userId, CancellationToken cancellationToken);
}

/// <param name="Active">False once the person left or was removed.</param>
public sealed record AccountMembership(Guid WorkplaceId, Guid MembershipId, string Role, bool Active);

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
/// <param name="Conflicts">Pairs per template shift, and per added day shift under the change's ID.</param>
/// <param name="DayChanges">"Edit a specific day" changes (M4-01); null for none.</param>
public sealed record WorkplaceTemplate(
    string Name,
    DateTimeZone TimeZone,
    WorkplaceRules Rules,
    IReadOnlyList<TemplateBlock> Blocks,
    IReadOnlyList<TemplateConflict> Conflicts,
    IReadOnlyList<TemplateDayChange>? DayChanges = null);

/// <summary>
/// One change to one day of the week in week <see cref="Week"/> of a period (M4-01): a template shift's hours
/// that day ("changed"), the shift not running that day ("removed"), or a shift of that day only ("added").
/// </summary>
/// <param name="Id">For an added shift, the ID its dated shifts point back to, like a block's.</param>
/// <param name="SavedAt">When it was saved as it is: before the last period opened means that period used it.</param>
public sealed record TemplateDayChange(
    Guid Id,
    int Week,
    IsoDayOfWeek Day,
    string Kind,
    Guid? BlockId,
    LocalTime? Start,
    LocalTime? End,
    string? Name,
    int Headcount,
    IReadOnlyList<TemplateRequirement> Requirements,
    Instant SavedAt)
{
    public const string Changed = "changed";
    public const string Removed = "removed";
    public const string Added = "added";
}

/// <param name="MaxConsecutiveShifts">1 to 4, or null for no limit (BR-005).</param>
/// <param name="PublishChecks">Per issue code: "block", "confirm" or "show" (FR-144).</param>
public sealed record WorkplaceRules(
    int PeriodWeeks,
    int? MaxConsecutiveShifts,
    bool OpeningFairness,
    bool ClosingFairness,
    bool ClaimsNeedApproval,
    bool TradesNeedApproval,
    IReadOnlyDictionary<string, string> PublishChecks);

/// <param name="Days">ISO weekdays the block runs on.</param>
/// <param name="Name">The custom name, or null to be called Opening, Closing or Mid (M3-04).</param>
public sealed record TemplateBlock(
    Guid Id,
    IReadOnlyList<IsoDayOfWeek> Days,
    LocalTime Start,
    LocalTime End,
    int Headcount,
    IReadOnlyList<TemplateRequirement> Requirements,
    string? Name = null);

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

/// <summary>
/// Told, in the same request, when someone deletes their account (FR-009, M2-16). It runs before the account
/// itself is erased, so <see cref="IUserDirectory"/> still knows the person. Each module removes what it keeps
/// about them and leaves bare IDs on history, which then read as "Former employee". Handlers must cope with
/// being told twice: a deletion that failed halfway is simply tried again.
/// </summary>
public interface IAccountDeletedHandler
{
    Task HandleAsync(Guid userId, CancellationToken cancellationToken);
}
