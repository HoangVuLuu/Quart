using NodaTime;

namespace Quart.Modules.Jobs.Persistence;

/// <summary>One unit of background work (AD-029). The tick claims due rows and runs them (Tick/JobRunner.cs).</summary>
internal sealed class ScheduledJob
{
    public Guid Id { get; set; }

    /// <summary>Which handler runs it, for example "notifications.send_email".</summary>
    public required string Type { get; set; }

    /// <summary>Null for work that belongs to no workplace.</summary>
    public Guid? WorkplaceId { get; set; }

    public Instant RunAt { get; set; }

    public ScheduledJobStatus Status { get; set; } = ScheduledJobStatus.Pending;

    public int Attempts { get; set; }

    /// <summary>JSON the handler reads; the shape belongs to the job type.</summary>
    public required string Payload { get; set; }

    /// <summary>While a runner holds the job, no other runner may take it before this moment.</summary>
    public Instant? LockedUntil { get; set; }

    /// <summary>Unique when set: scheduling the same work twice adds one row (<c>JobRequest.DedupeKey</c>).</summary>
    public string? DedupeKey { get; set; }
}

internal enum ScheduledJobStatus
{
    Pending,
    Running,
    Succeeded,
    Failed,
}
