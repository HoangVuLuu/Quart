using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NodaTime;
using Quart.Modules.Jobs.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Jobs.Tick;

/// <summary>
/// Nightly cleanup (M6-05): jobs that finished or failed for good, 30 days later. Their payloads hold IDs only
/// (decision 0012); waiting jobs and the recurring ones are never touched.
/// </summary>
internal sealed class JobRetention(JobsDbContext db, IClock clock, ILogger<JobRetention> logger) : IJobHandler
{
    public const string JobType = "jobs.retention";

    public string Type => JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var before = now - Duration.FromDays(Retention.FinishedJobDays);
        var jobs = await Retention.InBatchesAsync(
            token => db.ScheduledJobs
                .Where(x => db.ScheduledJobs
                    .Where(j => (j.Status == ScheduledJobStatus.Succeeded || j.Status == ScheduledJobStatus.Failed) && j.RunAt < before)
                    .OrderBy(j => j.Id).Take(Retention.BatchSize).Select(j => j.Id).Contains(x.Id))
                .ExecuteDeleteAsync(token),
            cancellationToken);
        logger.LogInformation("Retention: deleted {Jobs} finished jobs", jobs.Deleted);
        return JobOutcome.RunAgain(jobs.More ? now : Retention.NextNight(now));
    }
}
