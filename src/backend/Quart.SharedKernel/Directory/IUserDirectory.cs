namespace Quart.SharedKernel.Directory;

/// <summary>
/// What other modules may know about an account. Implemented by the Identity module; names are resolved
/// at read time so no other module keeps a copy (FR-009).
/// </summary>
public interface IUserDirectory
{
    /// <summary>Accounts that no longer exist are simply missing from the result.</summary>
    Task<IReadOnlyDictionary<Guid, UserSummary>> GetAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken);

    Task<bool> IsPlatformAdminAsync(Guid userId, CancellationToken cancellationToken);
}

/// <param name="DisplayName">The short name, "Jasmine K." (FR-001).</param>
/// <param name="Language">"fr" or "en" (FR-261).</param>
public sealed record UserSummary(Guid Id, string FullName, string DisplayName, string Email, string Language);
