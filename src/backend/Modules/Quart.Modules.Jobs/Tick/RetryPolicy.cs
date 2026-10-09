using NodaTime;

namespace Quart.Modules.Jobs.Tick;

/// <summary>
/// How long a failed job waits before its next try: 5 minutes, then doubling up to 6 hours, 10 tries in
/// all (about a day). The tick runs every 5 minutes, so a shorter delay would change nothing.
/// </summary>
internal static class RetryPolicy
{
    public const int MaxAttempts = 10;

    private static readonly Duration FirstDelay = Duration.FromMinutes(5);
    private static readonly Duration LongestDelay = Duration.FromHours(6);

    /// <param name="attempts">How many runs have failed so far, including the one that just did.</param>
    public static Duration DelayAfter(int attempts)
    {
        // 5 min × 2^(attempts − 1), capped. The exponent is capped too, so a huge count cannot overflow.
        var doublings = Math.Clamp(attempts - 1, 0, 16);
        var delay = FirstDelay * (1L << doublings);
        return delay < LongestDelay ? delay : LongestDelay;
    }
}
