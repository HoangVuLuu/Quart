using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using NodaTime;
using Npgsql;
using Quart.SharedKernel.Persistence;

namespace Quart.Modules.Notifications.Persistence;

/// <summary>
/// The Notifications module's own schema (AD-015, decision 0011): the inbox, the email outbox, push subscriptions
/// and each member's email setting.
/// </summary>
internal sealed class NotificationsDbContext(DbContextOptions<NotificationsDbContext> options) : DbContext(options)
{
    public const string Schema = "notifications";

    public DbSet<Notification> Notifications => Set<Notification>();

    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();

    public DbSet<NotificationSetting> NotificationSettings => Set<NotificationSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Notification>(notification =>
        {
            notification.HasKey(x => x.Id);
            notification.Property(x => x.Parameters).HasColumnType("jsonb");
            // The inbox asks "this member's notifications, newest first".
            notification.HasIndex(x => new { x.MembershipId, x.CreatedAt });
            // A new alert looks for an open bundle of its kind for the same person (M8-07, FR-213).
            notification.HasIndex(x => new { x.UserId, x.WorkplaceId, x.Type })
                .HasFilter("delivered_at IS NULL AND bundle_id IS NOT NULL")
                .HasDatabaseName("ix_notification_open_bundle");
            notification.HasIndex(x => x.BundleId);
        });

        modelBuilder.Entity<NotificationSetting>(setting => setting.HasKey(x => new { x.UserId, x.WorkplaceId }));

        modelBuilder.Entity<OutboxMessage>(message =>
        {
            message.HasKey(x => x.Id);
            message.Property(x => x.Parameters).HasColumnType("jsonb");
        });

        modelBuilder.Entity<PushSubscription>(subscription =>
        {
            subscription.HasKey(x => x.Id);
            // One row per browser: the endpoint is the browser's, and whoever signed in last owns it.
            subscription.HasIndex(x => x.Endpoint).IsUnique();
            subscription.HasIndex(x => x.UserId);
            subscription.Property(x => x.Endpoint).HasMaxLength(PushSubscription.EndpointMaxLength);
            subscription.Property(x => x.P256dh).HasMaxLength(128);
            subscription.Property(x => x.Auth).HasMaxLength(64);
            subscription.Property(x => x.Label).HasMaxLength(PushSubscription.LabelMaxLength);
        });

        modelBuilder.UseSnakeCaseNames();
    }
}

/// <summary>One line in a member's inbox. A type and whitelisted parameters, never a sentence (FR-216, FR-263).</summary>
internal sealed class Notification
{
    public Guid Id { get; set; }

    public Guid WorkplaceId { get; set; }

    public Guid MembershipId { get; set; }

    public Guid UserId { get; set; }

    public required string Type { get; set; }

    /// <summary>JSON object of string values.</summary>
    public required string Parameters { get; set; }

    public Instant CreatedAt { get; set; }

    public Instant? ReadAt { get; set; }

    /// <summary>
    /// Alerts of one kind to one person within a few minutes go out as one push and one email (M8-07, FR-213):
    /// the ID of the alert that opened the bundle. Null for kinds that are neither pushed nor emailed.
    /// </summary>
    public Guid? BundleId { get; set; }

    /// <summary>When the bundle goes out; a later alert of the same kind joins it until then.</summary>
    public Instant? DeliverAt { get; set; }

    /// <summary>When its bundle went out, by push and email, as the person's settings allow.</summary>
    public Instant? DeliveredAt { get; set; }
}

/// <summary>An email waiting to be sent, or already sent (AD-030).</summary>
internal sealed class OutboxMessage
{
    public Guid Id { get; set; }

    public required string Recipient { get; set; }

    public required string Template { get; set; }

    public required string Language { get; set; }

    public required string Parameters { get; set; }

    public int Attempts { get; set; }

    public Instant CreatedAt { get; set; }

    public Instant? SentAt { get; set; }
}

/// <summary>
/// One browser that accepted push for a person (M8-06, FR-212). The endpoint is a capability URL from the push
/// service: whoever holds it can send to that browser, so it never leaves this table or reaches a log.
/// </summary>
internal sealed class PushSubscription
{
    public const int EndpointMaxLength = 2000;

    public const int LabelMaxLength = 80;

    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public required string Endpoint { get; set; }

    /// <summary>The browser's public key, base64url.</summary>
    public required string P256dh { get; set; }

    /// <summary>The browser's shared secret, base64url.</summary>
    public required string Auth { get; set; }

    /// <summary>What the person would call it, from the browser: "iPhone · Safari". Optional.</summary>
    public string? Label { get; set; }

    public Instant CreatedAt { get; set; }

    public Instant? LastSuccessAt { get; set; }
}

/// <summary>Lets `dotnet ef migrations add` build the context without the API or a database.</summary>
internal sealed class NotificationsDbContextFactory : IDesignTimeDbContextFactory<NotificationsDbContext>
{
    public NotificationsDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<NotificationsDbContext>();
        NotificationsModule.Configure(options, new NpgsqlDataSourceBuilder("Host=design-time").UseNodaTime().Build());
        return new NotificationsDbContext(options.Options);
    }
}

/// <summary>
/// A member's email choice in one workplace (M8-07, mockup 1g). No row means emails are on, for everyone, with
/// or without push (Hoang, 2026-11-22). Alerts in the app are always on; push is chosen per browser.
/// </summary>
internal sealed class NotificationSetting
{
    public Guid UserId { get; set; }

    public Guid WorkplaceId { get; set; }

    public bool Email { get; set; }

    public Instant UpdatedAt { get; set; }
}
