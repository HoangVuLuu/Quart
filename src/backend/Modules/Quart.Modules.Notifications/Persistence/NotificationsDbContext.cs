using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using NodaTime;
using Npgsql;
using Quart.SharedKernel.Persistence;

namespace Quart.Modules.Notifications.Persistence;

/// <summary>The Notifications module's own schema (AD-015, decision 0011): the inbox and the email outbox.</summary>
internal sealed class NotificationsDbContext(DbContextOptions<NotificationsDbContext> options) : DbContext(options)
{
    public const string Schema = "notifications";

    public DbSet<Notification> Notifications => Set<Notification>();

    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

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
