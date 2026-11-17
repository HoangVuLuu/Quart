namespace Quart.SharedKernel.Access;

/// <summary>
/// A named right inside one workplace (spec 5.5, AD-042). Code asks for one of these, never "is this an admin?".
/// Stored by name, so add new ones freely but never rename one.
/// </summary>
public enum Permission
{
    ManageWorkplace,
    ManageMembers,
    ManageLevels,
    ManageTemplate,
    ManageSchedule,
    ApproveRequests,
    PostAnnouncements,
    ViewAvailabilityComments,
    TransferOwnership,
    DeleteWorkplace,
}

/// <summary>The roles a membership can carry (spec 5.2). Roles are bundles of permissions.</summary>
public static class Roles
{
    public const string Owner = "owner";
    public const string Admin = "admin";
    public const string Employee = "employee";

    private static readonly Permission[] AdminBundle =
    [
        Permission.ManageWorkplace, Permission.ManageMembers, Permission.ManageLevels, Permission.ManageTemplate,
        Permission.ManageSchedule, Permission.ApproveRequests, Permission.PostAnnouncements, Permission.ViewAvailabilityComments,
    ];

    /// <summary>Owner holds everything; admin everything except ownership transfer and deletion; employee nothing (5.5).</summary>
    public static IReadOnlySet<Permission> PermissionsOf(string role) => role switch
    {
        Owner => new HashSet<Permission>(Enum.GetValues<Permission>()),
        Admin => new HashSet<Permission>(AdminBundle),
        _ => new HashSet<Permission>(),
    };
}

/// <summary>The caller's active membership in the workplace a request targets (AD-026).</summary>
public sealed record MemberAccess(
    Guid WorkplaceId,
    Guid MembershipId,
    Guid UserId,
    string Role,
    int Level,
    bool WorksShifts,
    IReadOnlySet<Permission> Permissions)
{
    public bool Can(Permission permission) => Permissions.Contains(permission);
}

/// <summary>Implemented by the Workplaces module, so other modules can check access without referencing it.</summary>
public interface IWorkplaceAccess
{
    /// <returns>Null when the user has no active membership there: the caller answers 404, never "forbidden".</returns>
    Task<MemberAccess?> FindAsync(Guid workplaceId, Guid userId, CancellationToken cancellationToken);
}
