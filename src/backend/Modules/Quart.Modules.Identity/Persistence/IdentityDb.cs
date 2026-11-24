using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using NodaTime;
using Npgsql;
using Quart.SharedKernel.Persistence;

namespace Quart.Modules.Identity.Persistence;

/// <summary>
/// The Identity module's own schema (AD-015, decision 0011): accounts (ASP.NET Core Identity, AD-024),
/// server-side sessions and Data Protection keys (AD-045), and single-use emailed links (FR-004, FR-005).
/// </summary>
internal sealed class IdentityDb(DbContextOptions<IdentityDb> options) : IdentityUserContext<QuartUser, Guid>(options)
{
    public const string Schema = "identity";

    public DbSet<Session> Sessions => Set<Session>();

    public DbSet<AccountLink> AccountLinks => Set<AccountLink>();

    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.HasDefaultSchema(Schema);

        builder.Entity<QuartUser>().ToTable("user");
        builder.Entity<IdentityUserClaim<Guid>>().ToTable("user_claim");
        builder.Entity<IdentityUserLogin<Guid>>().ToTable("user_login");
        builder.Entity<IdentityUserToken<Guid>>().ToTable("user_token");

        builder.Entity<Session>(session =>
        {
            session.HasKey(x => x.Id);
            // "Sign out of all devices" and a password reset delete by user.
            session.HasIndex(x => x.UserId);
        });

        builder.Entity<AccountLink>(link =>
        {
            link.HasKey(x => x.Id);
            link.HasIndex(x => x.TokenHash).IsUnique();
        });

        builder.Entity<DataProtectionKey>().HasKey(x => x.Id);

        builder.UseSnakeCaseNames();
    }
}

/// <summary>An account. Roles are not here: they belong to memberships (AD-001).</summary>
internal sealed class QuartUser : IdentityUser<Guid>
{
    public required string FullName { get; set; }

    /// <summary>First name plus last initial, "Jasmine K."; the person can correct it (FR-001, FR-008).</summary>
    public required string DisplayName { get; set; }

    /// <summary>"fr" or "en" (FR-261).</summary>
    public required string Language { get; set; }

    /// <summary>Hoang only. Set by the <c>grant-platform-admin</c> command, never through the app (5.2).</summary>
    public bool IsPlatformAdmin { get; set; }

    /// <summary>Instagram handle, without "@" (FR-040, M2-18). Shown to teammates only with <see cref="ShareSocialLinks"/>.</summary>
    public string? Instagram { get; set; }

    /// <summary>Facebook username or numeric profile ID (FR-040, M2-18).</summary>
    public string? Facebook { get; set; }

    /// <summary>The person chose to show the two links on the team page. Off by default: nothing shows unless they opt in.</summary>
    public bool ShareSocialLinks { get; set; }

    public Instant CreatedAt { get; set; }
}

/// <summary>
/// One signed-in browser (AD-045). The cookie holds only <see cref="Id"/>; deleting the row signs that
/// browser out on its very next request.
/// </summary>
internal sealed class Session
{
    /// <summary>The SHA-256 of the key in the cookie, never the key: a copy of this table opens no session.</summary>
    public required string Id { get; set; }

    public Guid UserId { get; set; }

    /// <summary>The serialized authentication ticket.</summary>
    public required byte[] Ticket { get; set; }

    public Instant CreatedAt { get; set; }

    public Instant ExpiresAt { get; set; }

    /// <summary>
    /// When the password was last typed in this browser: at sign-in, then on each step-up (AD-044, M2-06).
    /// Null for sessions from before this column existed, which then simply ask for it.
    /// </summary>
    public Instant? ConfirmedAt { get; set; }
}

/// <summary>A link emailed to someone: it works once and expires (FR-004, FR-005). Only its hash is stored.</summary>
internal sealed class AccountLink
{
    public const string VerifyEmail = "verify_email";
    public const string ResetPassword = "reset_password";
    public const string ChangeEmail = "change_email";

    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public required string Purpose { get; set; }

    public required string TokenHash { get; set; }

    public Instant ExpiresAt { get; set; }

    public Instant? UsedAt { get; set; }

    /// <summary>
    /// For a verification link sent because someone signed up again with an address that is not confirmed
    /// yet: the password of <em>that</em> attempt. It replaces the account's password only when this very
    /// link is opened, so whoever proves they own the mailbox gets the password they typed, and a stranger
    /// who signed up first with someone else's address gains nothing.
    /// </summary>
    public string? PendingPasswordHash { get; set; }

    /// <summary>The full name typed in that same attempt.</summary>
    public string? PendingFullName { get; set; }

    /// <summary>For a <see cref="ChangeEmail"/> link: the new address, applied only when the link sent to it is opened (M2-07).</summary>
    public string? PendingEmail { get; set; }
}

/// <summary>
/// One ASP.NET Core Data Protection key. Kept in Postgres because the app scales to zero: without it every
/// restart would invalidate every cookie (AD-045).
/// </summary>
internal sealed class DataProtectionKey
{
    public int Id { get; set; }

    public required string FriendlyName { get; set; }

    public required string Xml { get; set; }
}

/// <summary>Lets `dotnet ef migrations add` build the context without the API or a database.</summary>
internal sealed class IdentityDbFactory : IDesignTimeDbContextFactory<IdentityDb>
{
    public IdentityDb CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<IdentityDb>();
        IdentityModule.Configure(options, new NpgsqlDataSourceBuilder("Host=design-time").UseNodaTime().Build());
        return new IdentityDb(options.Options);
    }
}
