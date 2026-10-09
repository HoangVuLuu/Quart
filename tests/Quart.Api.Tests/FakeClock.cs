using NodaTime;

namespace Quart.Api.Tests;

/// <summary>A clock that stands still until a test moves it, so "due in 5 minutes" can be checked exactly.</summary>
public sealed class FakeClock(Instant now) : IClock
{
    private Instant now = now;

    public static FakeClock At(int year, int month, int day, int hour, int minute) =>
        new(Instant.FromUtc(year, month, day, hour, minute));

    public Instant GetCurrentInstant() => now;

    public void Advance(Duration duration) => now += duration;
}
