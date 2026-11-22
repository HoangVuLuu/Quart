using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using NodaTime;
using Npgsql;
using Quart.SharedKernel.Persistence;

namespace Quart.Modules.Notifications.Persistence;

/// <summary>The Notifications module's own schema (AD-015, decision 0011): the inbox, the email outbox and push subscriptions.</summary>
internal sealed class NotificationsDbContext(DbContextOptions<NotificationsDbContext> options) : DbContext(options)
{
    public const string Schema = "notifications";

    public DbSet<Notification> Notifications => Set<Notification>();

    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Notification>(notification =>
        {
            notification.HasKey(x => x.Id);
            notification.Property(x => x.Parameters).HasColumnType("jsonb");
            // The inbox asks "this member's notifications, newest first".
            notification.HasIndex(x => new { x.MembershipId, x.CreatedAt });
        });

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
