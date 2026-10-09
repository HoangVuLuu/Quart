using System.Text.Json;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Jobs.Tick;

/// <summary>The Jobs module's side of <see cref="IJobScheduler"/>: one row in <c>jobs.scheduled_job</c>.</summary>
internal sealed class JobScheduler(JobStore store) : IJobScheduler
{
    public Task<bool> ScheduleAsync(JobRequest job, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(job.Type);
        var payload = job.Payload is null ? "{}" : JsonSerializer.Serialize(job.Payload, JsonSerializerOptions.Web);
        return store.InsertAsync(job, payload, cancellationToken);
    }
}
