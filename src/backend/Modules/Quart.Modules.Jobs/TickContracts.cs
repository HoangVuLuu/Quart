using NodaTime;

namespace Quart.Modules.Jobs;

// What the API host sees of the tick, beside JobsModule.RunTickAsync.

/// <summary>What one tick did. Jobs that will retry are not failures yet; only <see cref="Failed"/> ones gave up.</summary>
public sealed record TickResult(int Succeeded, int Retried, int Failed);

/// <summary>When background work last ran; what <c>/api/meta</c> returns as <c>lastTickAt</c>.</summary>
public interface ITickStatus
{
    /// <returns>Null before the first tick.</returns>
    Task<Instant?> GetLastTickAtAsync(CancellationToken cancellationToken);
}
