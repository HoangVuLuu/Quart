using System.Text.Json;
using NodaTime;

namespace Quart.SharedKernel.Jobs;

/// <summary>
/// Runs one type of background job. A module registers its handlers in its own <c>Add…Module</c> method,
/// as <c>services.AddScoped&lt;IJobHandler, MyHandler&gt;()</c>; each job runs in a fresh scope.
/// </summary>
/// <remarks>
/// <para>
/// <b>Handlers must be idempotent:</b> running the same job twice changes nothing the second time. A job
/// can run again after a crash halfway through, or after it ran but its success was not recorded.
/// Check before acting ("was this reminder already sent?") rather than assuming a first run.
/// </para>
/// <para>
/// Throwing means "failed": the job is retried later with a growing delay, and other jobs carry on.
/// Exception messages must not contain personal data (decision 0012); throw with IDs.
/// </para>
/// </remarks>
public interface IJobHandler
{
    /// <summary>The <see cref="JobRequest.Type"/> this handler runs.</summary>
    string Type { get; }

    Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken);
}

/// <param name="Attempt">1 on the first run, 2 on the first retry, and so on.</param>
/// <param name="Payload">The JSON given when the job was scheduled.</param>
public sealed record JobContext(Guid JobId, string Type, Guid? WorkplaceId, int Attempt, string Payload)
{
    public T ReadPayload<T>() =>
        JsonSerializer.Deserialize<T>(Payload, JsonSerializerOptions.Web)
        ?? throw new InvalidOperationException($"Job {JobId} of type {Type} has an empty payload.");
}

/// <summary>What a handler asks for once it has finished successfully.</summary>
public sealed record JobOutcome
{
    private JobOutcome(Instant? runAgainAt) => RunAgainAt = runAgainAt;

    /// <summary>Set when the job should run again at that moment instead of being finished.</summary>
    public Instant? RunAgainAt { get; }

    /// <summary>The work is finished; the job never runs again.</summary>
    public static JobOutcome Done { get; } = new(runAgainAt: null);

    /// <summary>Recurring work: the same job runs again at <paramref name="at"/>, with its attempts reset.</summary>
    public static JobOutcome RunAgain(Instant at) => new(at);
}
