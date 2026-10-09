using static Quart.Generator.Tests.Inputs;

namespace Quart.Generator.Tests;

/// <summary>Opening and closing are the first and last shift of each day (BR-034).</summary>
public sealed class DayPartsTests
{
    [Fact]
    public void The_first_shift_of_a_day_opens_and_the_last_closes()
    {
        var parts = DayParts.Of(
        [
            Shift("close", "2026-10-05", "16:00", "23:00"),
            Shift("lunch", "2026-10-05", "12:00", "15:00"),
            Shift("open", "2026-10-05", "10:00", "16:00"),
        ]);

        Assert.Equal(DayPart.Opening, parts["open"]);
        Assert.Equal(DayPart.Mid, parts["lunch"]);
        Assert.Equal(DayPart.Closing, parts["close"]);
    }

    [Fact]
    public void Each_day_is_classified_on_its_own()
    {
        var parts = DayParts.Of(
        [
            Shift("mon-open", "2026-10-05", "10:00", "16:00"),
            Shift("mon-close", "2026-10-05", "16:00", "23:00"),
            Shift("tue-open", "2026-10-06", "08:00", "12:00"),
            Shift("tue-close", "2026-10-06", "12:00", "18:00"),
        ]);

        Assert.Equal(DayPart.Opening, parts["tue-open"]);
        Assert.Equal(DayPart.Closing, parts["tue-close"]);
        Assert.Equal(DayPart.Closing, parts["mon-close"]);
    }

    [Fact]
    public void A_day_with_one_shift_opens_and_closes_with_it()
    {
        var parts = DayParts.Of([Shift("only", "2026-10-05", "10:00", "16:00")]);

        Assert.Equal(DayPart.Opening | DayPart.Closing, parts["only"]);
    }
}
