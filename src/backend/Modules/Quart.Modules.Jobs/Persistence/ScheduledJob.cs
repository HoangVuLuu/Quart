using NodaTime;

namespace Quart.Modules.Jobs.Persistence;

/// <summary>One unit of background work waiting to run (AD-029). M0-12 adds the code that claims and runs them.</summary>
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
}

internal enum ScheduledJobStatus
{
    Pending,
    Running,
    Succeeded,
    Failed,
}
