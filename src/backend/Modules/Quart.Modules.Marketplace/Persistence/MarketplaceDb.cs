using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using NodaTime;
using Npgsql;
using Quart.SharedKernel.Persistence;

namespace Quart.Modules.Marketplace.Persistence;

/// <summary>
/// The Marketplace module's own schema (AD-015, decision 0011): offers, claims and trades. Who is on which
/// shift stays in the Scheduling module; this module only records what people asked for.
/// </summary>
internal sealed class MarketplaceDb(DbContextOptions<MarketplaceDb> options) : DbContext(options)
{
    public const string Schema = "marketplace";

    public DbSet<GiveAway> GiveAways => Set<GiveAway>();

    public DbSet<Claim> Claims => Set<Claim>();

    public DbSet<Trade> Trades => Set<Trade>();

    public DbSet<SeenItem> SeenItems => Set<SeenItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<GiveAway>(giveAway =>
        {
            giveAway.HasKey(x => x.Id);
            giveAway.HasIndex(x => new { x.WorkplaceId, x.Status });
            // One open offer per person per shift: tapping "Give away" twice offers it once.
            giveAway.HasIndex(x => new { x.ShiftId, x.FromMembershipId }).IsUnique().HasFilter("status = 'open'");
        });

        modelBuilder.Entity<Claim>(claim =>
        {
            claim.HasKey(x => x.Id);
            claim.HasIndex(x => new { x.WorkplaceId, x.Status });
            claim.HasIndex(x => new { x.ShiftId, x.MembershipId }).IsUnique().HasFilter("status = 'pending'");
        });

        modelBuilder.Entity<Trade>(trade =>
        {
            trade.HasKey(x => x.Id);
            trade.HasIndex(x => new { x.WorkplaceId, x.Status });
        });

        modelBuilder.Entity<SeenItem>(seen => seen.HasKey(x => new { x.MembershipId, x.ItemKey }));

        modelBuilder.UseSnakeCaseNames();
    }
}

/// <summary>
/// A Trade tab item the person has opened, so the tab's count drops by one (2.4, 2026-11-18). Keys are
/// "slot:{shiftId}", "offer:{giveAwayId}" and "trade:{tradeId}".
/// </summary>
internal sealed class SeenItem
{
    public Guid MembershipId { get; set; }

    public required string ItemKey { get; set; }

    public Instant SeenAt { get; set; }
}

/// <summary>A published shift its holder wants someone else to take. They stay on it until someone does (FR-180, FR-181).</summary>
internal sealed class GiveAway
{
    public const string Open = "open";
    public const string Taken = "taken";
    public const string Cancelled = "cancelled";

    public Guid Id { get; set; }

    public Guid WorkplaceId { get; set; }

    public Guid ShiftId { get; set; }

    public Guid FromMembershipId { get; set; }

    public required string Status { get; set; }

    public Guid? TakenBy { get; set; }

    public Instant PostedAt { get; set; }
}

/// <summary>A request to take an open slot or an offered shift, waiting for an admin (FR-187).</summary>
internal sealed class Claim
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Declined = "declined";
    public const string Cancelled = "cancelled";

    public Guid Id { get; set; }

    public Guid WorkplaceId { get; set; }

    public Guid ShiftId { get; set; }

    public Guid MembershipId { get; set; }

    public Guid UserId { get; set; }

    /// <summary>Null when the claim is for an empty slot rather than someone's offer.</summary>
    public Guid? GiveAwayId { get; set; }

    public required string Status { get; set; }

    public Guid? DecidedBy { get; set; }

    public Instant CreatedAt { get; set; }
}

/// <summary>A one-for-one swap: A gives <see cref="AShiftId"/> and takes <see cref="BShiftId"/> (FR-188).</summary>
internal sealed class Trade
{
    public const string Requested = "requested";
    public const string AwaitingApproval = "awaiting_approval";
    public const string Applied = "applied";
    public const string Declined = "declined";
    public const string Cancelled = "cancelled";
    public const string Rejected = "rejected";
    public const string Expired = "expired";

    public Guid Id { get; set; }

    public Guid WorkplaceId { get; set; }

    public Guid AMembershipId { get; set; }

    public Guid AShiftId { get; set; }

    public Guid BMembershipId { get; set; }

    public Guid BShiftId { get; set; }

    public required string Status { get; set; }

    /// <summary>14 days after the request, or when either shift starts, whichever comes first (FR-191).</summary>
    public Instant ExpiresAt { get; set; }

    public Instant CreatedAt { get; set; }

    public bool IsPending => Status is Requested or AwaitingApproval;
}

/// <summary>Lets `dotnet ef migrations add` build the context without the API or a database.</summary>
internal sealed class MarketplaceDbFactory : IDesignTimeDbContextFactory<MarketplaceDb>
{
    public MarketplaceDb CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<MarketplaceDb>();
        MarketplaceModule.Configure(options, new NpgsqlDataSourceBuilder("Host=design-time").UseNodaTime().Build());
        return new MarketplaceDb(options.Options);
    }
}
