using NodaTime;

namespace Quart.SharedKernel.Jobs;

/// <summary>
/// Schedules background work without referencing the Jobs module (AD-029). The work runs at the first
/// tick at or after <see cref="JobRequest.RunAt"/>, so up to 5 minutes late in deployed environments.
/// The handler for <see cref="JobRequest.Type"/> is an <see cref="IJobHandler"/> registered by the module.
/// </summary>
public interface IJobScheduler
{
    /// <returns>
    /// False when a job with the same <see cref="JobRequest.DedupeKey"/> already exists, so nothing was added.
    /// </returns>
    Task<bool> ScheduleAsync(JobRequest job, CancellationToken cancellationToken = default);
}

/// <param name="Type">Names the handler, as "&lt;module&gt;.&lt;snake_case_name&gt;", for example "notifications.send_reminder".</param>
/// <param name="RunAt">The earliest moment the job may run.</param>
public sealed record JobRequest(string Type, Instant RunAt)
{
    /// <summary>
    /// Serialized to JSON and handed back to the handler. IDs only, never names, emails or comments: payloads
    /// are kept after the job runs and can show up while debugging (decision 0012).
    /// </summary>
    public object? Payload { get; init; }

    /// <summary>Null for work that belongs to no workplace.</summary>
    public Guid? WorkplaceId { get; init; }

    /// <summary>
    /// At most one job ever exists per key, so scheduling the same work twice (a retried request, a
    /// re-published schedule) adds it once. Null means no such check.
    /// </summary>
    public string? DedupeKey { get; init; }
}
