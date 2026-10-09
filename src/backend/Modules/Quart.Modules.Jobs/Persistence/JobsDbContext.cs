using Microsoft.EntityFrameworkCore;

namespace Quart.Modules.Jobs.Persistence;

/// <summary>
/// The Jobs module's own database, in its own schema (AD-015, docs/decisions/0011-persistence-per-module.md).
/// </summary>
internal sealed class JobsDbContext(DbContextOptions<JobsDbContext> options) : DbContext(options)
{
    public const string Schema = "jobs";

    public DbSet<ScheduledJob> ScheduledJobs => Set<ScheduledJob>();

    public DbSet<Heartbeat> Heartbeats => Set<Heartbeat>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<ScheduledJob>(job =>
        {
            job.ToTable("scheduled_job");
            job.HasKey(x => x.Id);
            job.Property(x => x.Id).HasColumnName("id");
            job.Property(x => x.Type).HasColumnName("type");
            job.Property(x => x.WorkplaceId).HasColumnName("workplace_id");
            job.Property(x => x.RunAt).HasColumnName("run_at");
            job.Property(x => x.Status).HasColumnName("status").HasConversion<string>();
            job.Property(x => x.Attempts).HasColumnName("attempts");
            job.Property(x => x.Payload).HasColumnName("payload").HasColumnType("jsonb");
            job.Property(x => x.LockedUntil).HasColumnName("locked_until");
            job.Property(x => x.DedupeKey).HasColumnName("dedupe_key");

            // The tick asks "what is due and not locked?"; this is the index that question needs.
            job.HasIndex(x => new { x.Status, x.RunAt }).HasDatabaseName("ix_scheduled_job_status_run_at");
            // Postgres lets any number of rows have a null key, so only keyed jobs are deduplicated.
            job.HasIndex(x => x.DedupeKey).IsUnique().HasDatabaseName("ux_scheduled_job_dedupe_key");
        });

        modelBuilder.Entity<Heartbeat>(heartbeat =>
        {
            heartbeat.ToTable("heartbeat", table => table.HasCheckConstraint("ck_heartbeat_single_row", "id = 1"));
            heartbeat.HasKey(x => x.Id);
            heartbeat.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            heartbeat.Property(x => x.LastTickAt).HasColumnName("last_tick_at");
        });
    }
}
