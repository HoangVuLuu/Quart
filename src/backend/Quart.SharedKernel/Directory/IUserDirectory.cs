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
/// <param name="EmailConfirmed">Only a confirmed address receives anything but the verification email.</param>
/// <param name="Shared">The social links, only when the person chose to share them (FR-040); otherwise null.</param>
public sealed record UserSummary(Guid Id, string FullName, string DisplayName, string Email, string Language, bool EmailConfirmed, SocialLinks? Shared = null);

/// <summary>Handles only, never links: the web app builds each link from a fixed host (M2-18).</summary>
public sealed record SocialLinks(string? Instagram, string? Facebook);

/// <summary>
/// Told when a person's other sign-ins end: signing out everywhere, or changing or resetting the password or the
/// email (M2-07). Push subscriptions go with them, so a lost or shared phone stops showing that person's alerts;
/// the browser still in use registers itself again the next time the app opens (M8-06).
/// </summary>
public interface ISessionsEndedHandler
{
    Task HandleAsync(Guid userId, CancellationToken cancellationToken);
}
