using NodaTime;

namespace Quart.Modules.Jobs.Persistence;

/// <summary>The single row the heartbeat job updates on every tick; <c>/api/meta</c> reads it as <c>lastTickAt</c>.</summary>
internal sealed class Heartbeat
{
    /// <summary>Always 1: the table holds one row.</summary>
    public int Id { get; set; }

    public Instant LastTickAt { get; set; }
}
