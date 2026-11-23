using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using NodaTime;
using Npgsql;
using Quart.SharedKernel.Persistence;

namespace Quart.Modules.Scheduling.Persistence;

/// <summary>
/// The Scheduling module's own schema (AD-015, decision 0011): periods with their dated shifts (AD-010),
/// availability, draft and published assignments (AD-012), and the history of published versions.
/// </summary>
internal sealed class SchedulingDb(DbContextOptions<SchedulingDb> options) : DbContext(options)
{
    public const string Schema = "scheduling";

    public DbSet<Period> Periods => Set<Period>();

    public DbSet<Shift> Shifts => Set<Shift>();

    public DbSet<ShiftRequirement> ShiftRequirements => Set<ShiftRequirement>();

    public DbSet<PeriodConflict> PeriodConflicts => Set<PeriodConflict>();

    public DbSet<Availability> Availabilities => Set<Availability>();

    public DbSet<AvailabilityBlock> AvailabilityBlocks => Set<AvailabilityBlock>();

    public DbSet<AvailabilityNote> AvailabilityNotes => Set<AvailabilityNote>();

    public DbSet<Assignment> Assignments => Set<Assignment>();

    public DbSet<ScheduleVersion> ScheduleVersions => Set<ScheduleVersion>();

    public DbSet<GenerationRun> GenerationRuns => Set<GenerationRun>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Period>(period =>
        {
            period.HasKey(x => x.Id);
            period.Property(x => x.Rules).HasColumnType("jsonb");
            // Empty for existing rows, and for any row the previous version inserts during a deploy.
            period.Property(x => x.StepsDone).HasDefaultValueSql("'{}'::text[]");
            period.Property(x => x.SavedDraft).HasColumnType("jsonb");
            period.HasIndex(x => new { x.WorkplaceId, x.StartDate });
        });

        modelBuilder.Entity<Shift>(shift =>
        {
            shift.HasKey(x => x.Id);
            shift.HasIndex(x => new { x.PeriodId, x.Date });
            shift.HasMany(x => x.Requirements).WithOne().HasForeignKey(x => x.ShiftId).OnDelete(DeleteBehavior.Cascade);
            shift.HasOne<Period>().WithMany().HasForeignKey(x => x.PeriodId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ShiftRequirement>().HasKey(x => x.Id);

        modelBuilder.Entity<PeriodConflict>(conflict =>
        {
            conflict.HasKey(x => x.Id);
            conflict.HasOne<Period>().WithMany().HasForeignKey(x => x.PeriodId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Availability>(availability =>
        {
            availability.HasKey(x => x.Id);
            availability.HasIndex(x => new { x.PeriodId, x.MembershipId }).IsUnique();
            availability.HasMany(x => x.Blocks).WithOne().HasForeignKey(x => x.AvailabilityId).OnDelete(DeleteBehavior.Cascade);
            availability.HasMany(x => x.Notes).WithOne().HasForeignKey(x => x.AvailabilityId).OnDelete(DeleteBehavior.Cascade);
            availability.HasOne<Period>().WithMany().HasForeignKey(x => x.PeriodId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AvailabilityBlock>(block =>
        {
            block.HasKey(x => new { x.AvailabilityId, x.ShiftId });
            // FR-103a: 60 characters, enforced by the database as well as the endpoint.
            block.Property(x => x.Note).HasMaxLength(AvailabilityBlock.NoteMaxLength);
        });

        modelBuilder.Entity<AvailabilityNote>(note =>
        {
            note.HasKey(x => x.Id);
            // FR-103: 500 characters, enforced by the database as well as the endpoint.
            note.Property(x => x.Body).HasMaxLength(AvailabilityNote.MaxLength);
        });

        modelBuilder.Entity<Assignment>(assignment =>
        {
            assignment.HasKey(x => x.Id);
            // A person is on a shift at most once in the draft and once in the published schedule.
            assignment.HasIndex(x => new { x.ShiftId, x.MembershipId, x.IsDraft }).IsUnique();
            assignment.HasIndex(x => new { x.PeriodId, x.IsDraft });
            assignment.HasOne<Shift>().WithMany().HasForeignKey(x => x.ShiftId).OnDelete(DeleteBehavior.Cascade);
            // The exclusion constraint that makes double booking impossible (AD-011) is raw SQL in the migration.
        });

        modelBuilder.Entity<ScheduleVersion>(version =>
        {
            version.HasKey(x => x.Id);
            version.Property(x => x.Snapshot).HasColumnType("jsonb");
            version.HasIndex(x => new { x.PeriodId, x.Version }).IsUnique();
        });

        modelBuilder.Entity<GenerationRun>(run =>
        {
            run.HasKey(x => x.Id);
            run.Property(x => x.Rules).HasColumnType("jsonb");
        });

        modelBuilder.UseSnakeCaseNames();
    }
}

/// <summary>The stretch of dates one schedule covers: 1 to 4 whole weeks starting on a Monday (FR-090).</summary>
internal sealed class Period
{
    public const string Collecting = "collecting";
    public const string Building = "building";
    public const string Published = "published";

    public Guid Id { get; set; }

    public Guid WorkplaceId { get; set; }

    public LocalDate StartDate { get; set; }

    public int Weeks { get; set; }

    /// <summary>Collecting availability, building the schedule, or published.</summary>
    public required string Status { get; set; }

    /// <summary>The workplace's zone when the period was created (AD-028).</summary>
    public required string TimeZone { get; set; }

    /// <summary>The scheduling rules copied from the workplace when the period was created (FR-068).</summary>
    public required string Rules { get; set; }

    /// <summary>
    /// Set while the manager is on Building Schedule, and for good once published; availability is read-only
    /// meanwhile (FR-100). Leaving Building Schedule clears it again (4.3, 2026-11-18).
    /// </summary>
    public Instant? LockedAt { get; set; }

    /// <summary>The last sign of life from an open Building or Editing Schedule page; null when nobody is on it (4.3).</summary>
    public Instant? SessionSeenAt { get; set; }

    /// <summary>The draft as last saved, or as it was on entering: what leaving without saving puts back (4.3).</summary>
    public string? SavedDraft { get; set; }

    /// <summary>When the manager last tapped Save draft; "Continue building" is offered while set and unpublished.</summary>
    public Instant? DraftSavedAt { get; set; }

    /// <summary>0 until first published, then 1, 2, ... (FR-160, FR-163).</summary>
    public int Version { get; set; }

    public Instant? PublishedAt { get; set; }

    /// <summary>The seed of the last generation, so it can be reproduced (FR-122).</summary>
    public int? Seed { get; set; }

    public Instant CreatedAt { get; set; }

    /// <summary>When availability is due (FR-091). Null only for periods opened before deadlines existed.</summary>
    public Instant? AvailabilityDueAt { get; set; }

    /// <summary>The automatic steps already done ("48h", "24h", "due"), so a job run twice does nothing the second time.</summary>
    public List<string> StepsDone { get; set; } = [];

    public LocalDate EndDate => StartDate.PlusDays((Weeks * 7) - 1);
}

/// <summary>A dated instance of a shift block (AD-010). Editing the template later never changes it.</summary>
internal sealed class Shift
{
    public Guid Id { get; set; }

    public Guid PeriodId { get; set; }

    public Guid WorkplaceId { get; set; }

    public LocalDate Date { get; set; }

    public LocalTime StartTime { get; set; }

    public LocalTime EndTime { get; set; }

    public int Headcount { get; set; }

    public Guid SourceBlockId { get; set; }

    /// <summary>Computed by the application from the local date, time and zone (AD-011).</summary>
    public Instant StartsAt { get; set; }

    public Instant EndsAt { get; set; }

    public List<ShiftRequirement> Requirements { get; set; } = [];

    /// <summary>Hours count the full shift, no break deducted (BR-031).</summary>
    public decimal Hours => (decimal)(EndTime - StartTime).ToDuration().TotalHours;
}

internal sealed class ShiftRequirement
{
    public Guid Id { get; set; }

    public Guid ShiftId { get; set; }

    public int Level { get; set; }

    public int MinCount { get; set; }
}

/// <summary>A "cannot work together" pair, copied from the template when the period was created (BR-036).</summary>
internal sealed class PeriodConflict
{
    public Guid Id { get; set; }

    public Guid PeriodId { get; set; }

    public Guid BlockId { get; set; }

    public Guid MembershipA { get; set; }

    public Guid MembershipB { get; set; }
}

/// <summary>One person's answer for one period (FR-093). No row, or "not_sent", is never treated as available (FR-099).</summary>
internal sealed class Availability
{
    public const string NotSent = "not_sent";
    public const string Sent = "sent";

    public Guid Id { get; set; }

    public Guid PeriodId { get; set; }

    public Guid MembershipId { get; set; }

    public required string Status { get; set; }

    public Instant? SubmittedAt { get; set; }

    /// <summary>
    /// No longer used: reopening one person (FR-101) was removed on 2026-11-21. Still mapped so this release
    /// needs no migration while the previous one serves; drop the column in a later release (expand, migrate,
    /// contract: docs/runbooks/migrations.md).
    /// </summary>
    public Instant? ReopenedAt { get; set; }

    /// <summary>
    /// Hours per week the person wants in this period, given with their availability (BR-032). Required to
    /// send; null until then. The generator caps it at the manager's maximum without telling them.
    /// </summary>
    public decimal? DesiredWeeklyHours { get; set; }

    public List<AvailabilityBlock> Blocks { get; set; } = [];

    public List<AvailabilityNote> Notes { get; set; } = [];
}

internal sealed class AvailabilityBlock
{
    /// <summary>FR-103a: a short note on one shift, such as "Can only stay until 21:00".</summary>
    public const int NoteMaxLength = 60;

    public Guid AvailabilityId { get; set; }

    public Guid ShiftId { get; set; }

    /// <summary>
    /// The person's note on this shift for the admins (FR-103a), or null. Only a shift the person can work has
    /// one; it goes with the shift when they unselect it. Personal information like the week notes (12.4,
    /// class B); the generator never reads it (BR-035).
    /// </summary>
    public string? Note { get; set; }
}

/// <summary>A note for the admins only, personal information (FR-103, 12.4 class B). The generator never reads it (BR-035).</summary>
internal sealed class AvailabilityNote
{
    public const int MaxLength = 500;
    public const int MaxPerPeriod = 10;

    public Guid Id { get; set; }

    public Guid AvailabilityId { get; set; }

    public required string Body { get; set; }

    public Instant CreatedAt { get; set; }
}

/// <summary>One person on one shift, in the draft or in the published schedule (AD-012).</summary>
internal sealed class Assignment
{
    public const string Generated = "generated";
    public const string Manual = "manual";
    public const string Claim = "claim";
    public const string Trade = "trade";

    public Guid Id { get; set; }

    public Guid PeriodId { get; set; }

    public Guid ShiftId { get; set; }

    public Guid MembershipId { get; set; }

    public Guid UserId { get; set; }

    /// <summary>True for the admin's working copy; false for what staff see.</summary>
    public bool IsDraft { get; set; }

    /// <summary>Kept through regeneration (FR-123).</summary>
    public bool IsLocked { get; set; }

    public required string Source { get; set; }

    public Instant StartsAt { get; set; }

    public Instant EndsAt { get; set; }
}

/// <summary>One published version, kept as history (FR-164).</summary>
internal sealed class ScheduleVersion
{
    public Guid Id { get; set; }

    public Guid PeriodId { get; set; }

    public int Version { get; set; }

    public Instant PublishedAt { get; set; }

    public Guid PublishedBy { get; set; }

    /// <summary>JSON list of shift and membership IDs as published.</summary>
    public required string Snapshot { get; set; }
}

internal sealed class GenerationRun
{
    public Guid Id { get; set; }

    public Guid PeriodId { get; set; }

    public int Seed { get; set; }

    public int Score { get; set; }

    public required string Rules { get; set; }

    public Guid CreatedBy { get; set; }

    public Instant CreatedAt { get; set; }
}

/// <summary>Lets `dotnet ef migrations add` build the context without the API or a database.</summary>
internal sealed class SchedulingDbFactory : IDesignTimeDbContextFactory<SchedulingDb>
{
    public SchedulingDb CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<SchedulingDb>();
        SchedulingModule.Configure(options, new NpgsqlDataSourceBuilder("Host=design-time").UseNodaTime().Build());
        return new SchedulingDb(options.Options);
    }
}
