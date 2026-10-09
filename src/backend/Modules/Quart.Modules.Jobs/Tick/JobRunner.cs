using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NodaTime;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Jobs.Tick;

/// <summary>
/// One tick (AD-029): claims due jobs one at a time, runs each with its handler in a fresh scope, and
/// records the result. A failing job is retried later (<see cref="RetryPolicy"/>) and never stops the
/// others. Several ticks may run at once; <see cref="JobStore.ClaimNextAsync"/> keeps them apart.
/// </summary>
internal sealed class JobRunner(IServiceScopeFactory scopes, JobStore store, IClock clock, ILoggerFactory loggerFactory)
{
    /// <summary>
    /// How long a claimed job is protected from other ticks. Longer than the job's replica timeout
    /// (300 s, docs/runbooks/background-jobs.md), so a job is only taken over once its tick is surely gone.
    /// </summary>
    private static readonly Duration Lock = Duration.FromMinutes(10);

    /// <summary>A handler that runs longer is cancelled and counted as failed.</summary>
    private static readonly TimeSpan JobTimeout = TimeSpan.FromSeconds(60);

    /// <summary>No new job is claimed after this, so a tick ends well before the next one starts.</summary>
    private static readonly TimeSpan Budget = TimeSpan.FromMinutes(2);

    private readonly ILogger logger = loggerFactory.CreateLogger(JobsModule.LogCategory);

    public async Task<TickResult> RunAsync(CancellationToken cancellationToken)
    {
        var elapsed = Stopwatch.StartNew();
        await HeartbeatHandler.EnsureScheduledAsync(store, clock, cancellationToken);

        var handled = new List<Guid>();
        int succeeded = 0, retried = 0, failed = 0;
        while (elapsed.Elapsed < Budget && !cancellationToken.IsCancellationRequested)
        {
            var now = clock.GetCurrentInstant();
            if (await store.ClaimNextAsync(now, now + Lock, handled, cancellationToken) is not { } job)
            {
                break;
            }
            handled.Add(job.Id);

            switch (await RunOneAsync(job, cancellationToken))
            {
                case Result.Succeeded: succeeded++; break;
                case Result.Retried: retried++; break;
                case Result.Failed: failed++; break;
            }
        }

        var result = new TickResult(succeeded, retried, failed);
        logger.LogInformation(
            "Tick finished: {Succeeded} job(s) succeeded, {Retried} will retry, {Failed} failed for good, in {ElapsedMs} ms",
            succeeded, retried, failed, elapsed.ElapsedMilliseconds);
        return result;
    }

    private async Task<Result> RunOneAsync(ClaimedJob job, CancellationToken cancellationToken)
    {
        // A job whose earlier runs all crashed the tick (out of memory, killed) would otherwise be taken
        // over forever, since a crash records no failure.
        if (job.Attempts > RetryPolicy.MaxAttempts)
        {
            logger.LogError("Job {JobId} of type {JobType} gave up after {Attempts} attempts that never finished", job.Id, job.Type, job.Attempts - 1);
            await store.MarkFailedAsync(job, cancellationToken);
            return Result.Failed;
        }

        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var handler = scope.ServiceProvider.GetServices<IJobHandler>().SingleOrDefault(candidate => candidate.Type == job.Type)
                // A newer version may schedule a type this one does not know yet; a retry lets it catch up.
                ?? throw new InvalidOperationException($"No handler is registered for job type {job.Type}.");

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(JobTimeout);
            var outcome = await handler.RunAsync(new JobContext(job.Id, job.Type, job.WorkplaceId, job.Attempts, job.Payload), timeout.Token);

            if (outcome.RunAgainAt is { } next)
            {
                await store.RescheduleAsync(job, next, cancellationToken);
            }
            else
            {
                await store.MarkSucceededAsync(job, cancellationToken);
            }
            logger.LogDebug("Job {JobId} of type {JobType} succeeded", job.Id, job.Type);
            return Result.Succeeded;
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            // CancellationToken.None: recording the failure must not be skipped because the handler timed out.
            if (job.Attempts >= RetryPolicy.MaxAttempts)
            {
                logger.LogError(exception, "Job {JobId} of type {JobType} failed for good after {Attempts} attempts", job.Id, job.Type, job.Attempts);
                await store.MarkFailedAsync(job, CancellationToken.None);
                return Result.Failed;
            }

            var retryAt = clock.GetCurrentInstant() + RetryPolicy.DelayAfter(job.Attempts);
            logger.LogWarning(exception, "Job {JobId} of type {JobType} failed on attempt {Attempts}; retrying at {RetryAt}", job.Id, job.Type, job.Attempts, retryAt);
            await store.RetryLaterAsync(job, retryAt, CancellationToken.None);
            return Result.Retried;
        }
    }

    private enum Result
    {
        Succeeded,
        Retried,
        Failed,
    }
}
