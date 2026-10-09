using NodaTime;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Jobs.Tick;

/// <summary>
/// Records when a tick last ran a job, so <c>/api/meta</c> and the home page show whether background work
/// is alive. It runs through the same claim-run-record path as every other job, so a recent time proves
/// the whole job machinery works, not only that the process started.
/// </summary>
internal sealed class HeartbeatHandler(JobStore store, IClock clock) : IJobHandler
{
    public const string JobType = "jobs.heartbeat";

    public string Type => JobType;

    /// <summary>
    /// Due again at once, so every tick runs it (a tick never runs the same job twice). Running it twice
    /// only moves the time forward, so it is idempotent.
    /// </summary>
    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        await store.RecordHeartbeatAsync(now, cancellationToken);
        return JobOutcome.RunAgain(now);
    }

    /// <summary>
    /// Every tick makes sure the heartbeat job exists. The dedupe key makes this a no-op once it does,
    /// and recreates it if the row was ever deleted.
    /// </summary>
    public static Task EnsureScheduledAsync(JobStore store, IClock clock, CancellationToken cancellationToken) =>
        store.InsertAsync(new JobRequest(JobType, clock.GetCurrentInstant()) { DedupeKey = JobType }, "{}", cancellationToken);
}

internal sealed class TickStatus(JobStore store) : ITickStatus
{
    public Task<Instant?> GetLastTickAtAsync(CancellationToken cancellationToken) => store.ReadHeartbeatAsync(cancellationToken);
}
