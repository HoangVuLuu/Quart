using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using NodaTime;
using Npgsql;
using Quart.SharedKernel.Persistence;

namespace Quart.Modules.Workplaces.Persistence;

/// <summary>The Workplaces module's own schema (AD-015, decision 0011): workplaces, memberships and the weekly template.</summary>
internal sealed class WorkplacesDb(DbContextOptions<WorkplacesDb> options) : DbContext(options)
{
    public const string Schema = "workplaces";

    public DbSet<Workplace> Workplaces => Set<Workplace>();

    public DbSet<Membership> Memberships => Set<Membership>();

    public DbSet<MembershipPermission> MembershipPermissions => Set<MembershipPermission>();

    public DbSet<OwnerInvitation> OwnerInvitations => Set<OwnerInvitation>();

    public DbSet<ShiftBlock> ShiftBlocks => Set<ShiftBlock>();

    public DbSet<ShiftBlockRequirement> ShiftBlockRequirements => Set<ShiftBlockRequirement>();

    public DbSet<ShiftBlockConflict> ShiftBlockConflicts => Set<ShiftBlockConflict>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Workplace>(workplace =>
        {
            workplace.HasKey(x => x.Id);
            workplace.Property(x => x.Settings).HasColumnType("jsonb");
            workplace.HasIndex(x => x.JoinCode).IsUnique();
        });

        modelBuilder.Entity<Membership>(membership =>
        {
            membership.HasKey(x => x.Id);
            membership.Property(x => x.DesiredWeeklyHours).HasPrecision(5, 2);
            membership.Property(x => x.MaxWeeklyHours).HasPrecision(5, 2);
            // One active membership per person per workplace; someone who left can join again.
            membership.HasIndex(x => new { x.WorkplaceId, x.UserId }).IsUnique().HasFilter("left_at IS NULL")
                .HasDatabaseName("ux_membership_active");
            membership.HasIndex(x => x.UserId);
        });

        modelBuilder.Entity<MembershipPermission>(grant =>
        {
            grant.HasKey(x => x.Id);
            grant.HasIndex(x => new { x.MembershipId, x.Permission }).IsUnique();
        });

        modelBuilder.Entity<OwnerInvitation>(invitation =>
        {
            invitation.HasKey(x => x.Id);
            invitation.HasIndex(x => x.TokenHash).IsUnique();
        });

        modelBuilder.Entity<ShiftBlock>(block =>
        {
            block.HasKey(x => x.Id);
            block.HasIndex(x => x.WorkplaceId);
            block.Property(x => x.Name).HasMaxLength(ShiftBlock.NameMaxLength);
            block.HasMany(x => x.Requirements).WithOne().HasForeignKey(x => x.ShiftBlockId).OnDelete(DeleteBehavior.Cascade);
            block.HasMany(x => x.Conflicts).WithOne().HasForeignKey(x => x.ShiftBlockId).OnDelete(DeleteBehavior.Cascade);
            block.ToTable(table => table.HasCheckConstraint("ck_shift_block_same_day", "end_time > start_time"));
        });

        modelBuilder.Entity<ShiftBlockRequirement>().HasKey(x => x.Id);

        modelBuilder.Entity<ShiftBlockConflict>(conflict =>
        {
            conflict.HasKey(x => x.Id);
            // An unordered pair is stored smaller ID first, so the same pair cannot be added twice (M3-03).
            conflict.ToTable(table => table.HasCheckConstraint("ck_shift_block_conflict_ordered", "membership_a < membership_b"));
            conflict.HasIndex(x => new { x.ShiftBlockId, x.MembershipA, x.MembershipB }).IsUnique();
        });

        modelBuilder.UseSnakeCaseNames();
    }
}

internal sealed class Workplace
{
    public Guid Id { get; set; }

    public required string Name { get; set; }

    public required string Address { get; set; }

    /// <summary>An IANA zone ID such as America/Toronto (FR-031).</summary>
    public required string TimeZone { get; set; }

    /// <summary>10 characters without look-alikes (FR-033).</summary>
    public required string JoinCode { get; set; }

    /// <summary>A serialized <see cref="WorkplaceSettings"/>.</summary>
    public required string Settings { get; set; }

    public Instant CreatedAt { get; set; }
}

/// <summary>The link between an account and a workplace. It carries the role (AD-001) and the level (5.4).</summary>
internal sealed class Membership
{
    public Guid Id { get; set; }

    public Guid WorkplaceId { get; set; }

    public Guid UserId { get; set; }

    public required string Role { get; set; }

    /// <summary>Barista level 1 to 3, set only by an admin (FR-035).</summary>
    public int Level { get; set; } = 1;

    /// <summary>"I work shifts too" (FR-036).</summary>
    public bool WorksShifts { get; set; } = true;

    public decimal DesiredWeeklyHours { get; set; }

    public decimal? MaxWeeklyHours { get; set; }

    public Instant JoinedAt { get; set; }

    /// <summary>Set when the person left or was removed; access ends at once (FR-038).</summary>
    public Instant? LeftAt { get; set; }
}

/// <summary>One permission granted to one membership on top of its role (5.5).</summary>
internal sealed class MembershipPermission
{
    public Guid Id { get; set; }

    public Guid MembershipId { get; set; }

    public required string Permission { get; set; }

    public Guid GrantedBy { get; set; }

    public Instant GrantedAt { get; set; }
}

/// <summary>The single-use link that makes someone the owner of a new workplace (FR-042, decision 0008).</summary>
internal sealed class OwnerInvitation
{
    public Guid Id { get; set; }

    public Guid WorkplaceId { get; set; }

    public required string TokenHash { get; set; }

    public Instant ExpiresAt { get; set; }

    public Instant? AcceptedAt { get; set; }
}

/// <summary>One entry of the weekly template, such as "closing, 16:00 to 23:00, every day" (FR-060).</summary>
internal sealed class ShiftBlock
{
    public Guid Id { get; set; }

    public Guid WorkplaceId { get; set; }

    /// <summary>ISO weekdays, 1 for Monday to 7 for Sunday.</summary>
    public required int[] Days { get; set; }

    public LocalTime StartTime { get; set; }

    public LocalTime EndTime { get; set; }

    public int Headcount { get; set; }

    /// <summary>A custom name such as "Rush", shown instead of Opening, Closing or Mid (M3-04). Null for none.</summary>
    public string? Name { get; set; }

    public const int NameMaxLength = 24;

    public List<ShiftBlockRequirement> Requirements { get; set; } = [];

    public List<ShiftBlockConflict> Conflicts { get; set; } = [];
}

/// <summary>"At least <see cref="MinCount"/> people of <see cref="Level"/> or above", counted inside the headcount (FR-065).</summary>
internal sealed class ShiftBlockRequirement
{
    public Guid Id { get; set; }

    public Guid ShiftBlockId { get; set; }

    public int Level { get; set; }

    public int MinCount { get; set; }
}

/// <summary>Two members who must not work this block together (BR-036).</summary>
internal sealed class ShiftBlockConflict
{
    public Guid Id { get; set; }

    public Guid ShiftBlockId { get; set; }

    public Guid MembershipA { get; set; }

    public Guid MembershipB { get; set; }
}

/// <summary>Scheduling rules and request settings, stored as JSON on the workplace (M3-01).</summary>
internal sealed class WorkplaceSettings
{
    public const string Block = "block";
    public const string Confirm = "confirm";
    public const string Show = "show";

    /// <summary>The length offered when a new period is created; each period keeps its own (FR-090).</summary>
    public int PeriodWeeks { get; set; } = 2;

    public bool LimitConsecutiveShifts { get; set; } = true;

    /// <summary>1 to 4; ignored when <see cref="LimitConsecutiveShifts"/> is off (BR-005).</summary>
    public int MaxConsecutiveShifts { get; set; } = 3;

    public bool OpeningFairness { get; set; } = true;

    public bool ClosingFairness { get; set; } = true;

    public bool ClaimsNeedApproval { get; set; }

    public bool TradesNeedApproval { get; set; }

    /// <summary>Per issue code, what publishing does; anything not listed is only shown (FR-144).</summary>
    public Dictionary<string, string> PublishChecks { get; set; } = new()
    {
        // A shift without its required level is the manager's call: it asks, it never blocks.
        ["issue.missing_level"] = Confirm,
        ["issue.below_headcount"] = Confirm,
        ["issue.unavailable"] = Confirm,
        ["issue.not_submitted"] = Confirm,
    };
}

/// <summary>Lets `dotnet ef migrations add` build the context without the API or a database.</summary>
internal sealed class WorkplacesDbFactory : IDesignTimeDbContextFactory<WorkplacesDb>
{
    public WorkplacesDb CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<WorkplacesDb>();
        WorkplacesModule.Configure(options, new NpgsqlDataSourceBuilder("Host=design-time").UseNodaTime().Build());
        return new WorkplacesDb(options.Options);
    }
}
