namespace Quart.Generator.Tests;

public sealed class SeededRandomTests
{
    // Reference values produced by the prototype's JavaScript mulberry32 (docs/prototype/quart-prototype.jsx),
    // verified identical to this C# port. If these change, a schedule stored with its seed can no longer
    // be reproduced (FR-122), so treat a failure here as a breaking change, not a test to update.
    [Theory]
    [InlineData(1337, 0.184411832597107, 0.189989251317456, 0.810471992241219)]
    [InlineData(7, 0.011704753153026, 0.061958257574588, 0.976907632779330)]
    [InlineData(-1, 0.896422614110634, 0.189478256739676, 0.715652678161860)]
    [InlineData(0, 0.266429208684713, 0.000329745700583, 0.223272027447820)]
    public void Matches_the_prototype_sequence(int seed, double first, double second, double third)
    {
        var random = new SeededRandom(seed);

        Assert.Equal(first, random.NextDouble(), 12);
        Assert.Equal(second, random.NextDouble(), 12);
        Assert.Equal(third, random.NextDouble(), 12);
    }

    [Fact]
    public void Same_seed_gives_the_same_sequence()
    {
        var a = new SeededRandom(42);
        var b = new SeededRandom(42);

        for (var i = 0; i < 1_000; i++)
        {
            Assert.Equal(a.NextDouble(), b.NextDouble());
        }
    }

    [Fact]
    public void Different_seeds_give_different_sequences()
    {
        var a = new SeededRandom(1);
        var b = new SeededRandom(2);

        Assert.NotEqual(a.NextDouble(), b.NextDouble());
    }

    [Fact]
    public void Values_stay_within_zero_inclusive_and_one_exclusive()
    {
        var random = new SeededRandom(2026);

        for (var i = 0; i < 10_000; i++)
        {
            var value = random.NextDouble();
            Assert.InRange(value, 0.0, 0.9999999999999999);
        }
    }

    [Fact]
    public void Next_stays_below_its_bound()
    {
        var random = new SeededRandom(9);

        for (var i = 0; i < 10_000; i++)
        {
            Assert.InRange(random.Next(15), 0, 14);
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void Next_rejects_a_bound_that_is_not_positive(int bound)
    {
        var random = new SeededRandom(1);

        Assert.Throws<ArgumentOutOfRangeException>(() => random.Next(bound));
    }

    [Fact]
    public void Remembers_its_seed()
    {
        Assert.Equal(1337, new SeededRandom(1337).Seed);
    }
}
