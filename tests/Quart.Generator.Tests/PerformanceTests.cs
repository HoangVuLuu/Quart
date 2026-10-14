using System.Diagnostics;
using System.Globalization;

namespace Quart.Generator.Tests;

/// <summary>Run alone, never beside the property tests, so other tests cannot slow the timings down.</summary>
[CollectionDefinition(nameof(PerformanceTests), DisableParallelization = true)]
public sealed class PerformanceCollection;

/// <summary>
/// The performance budget (NFR-004, AD-005, M1-08): a 4-week period generates in under 2 seconds, so a
/// slow algorithm is caught the day it is written. CI runs these in their own step, alone on the
/// runner, and adds the timings to the job summary.
/// </summary>
[Collection(nameof(PerformanceTests))]
[Trait("Category", "Performance")]
public sealed class PerformanceTests
{
    /// <summary>NFR-004: generating a 4-week schedule completes in under 2 seconds.</summary>
    public static readonly TimeSpan Budget = TimeSpan.FromSeconds(2);

    private static readonly int[] Seeds = [1, 2, 3, 4, 5];

    private readonly ScheduleGenerator generator = new();

    [Fact]
    public void Four_weeks_for_15_people_generate_in_under_2_seconds()
    {
        var input = Samples.PresoteaFourWeeks();
        Assert.Equal(15, input.Members.Count);
        Assert.Equal(56, input.Shifts.Count);
        Assert.Equal(112, input.Shifts.Sum(shift => shift.Headcount));

        var average = AverageOverSeeds(input);
        Report("4 weeks, 15 people (gating)", average);

        Assert.True(average < Budget, $"4 weeks for 15 people took {average.TotalMilliseconds:0} ms on average; the budget is {Budget.TotalMilliseconds:0} ms (NFR-004).");
    }

    [Fact]
    public void Four_weeks_for_30_people_are_reported()
    {
        // A stress case, twice the shop: reported, never failing the build (M1-08).
        var input = Samples.PresoteaFourWeeks(copies: 2);
        Assert.Equal(30, input.Members.Count);

        Report("4 weeks, 30 people (reported only)", AverageOverSeeds(input));
    }

    /// <summary>The average over several seeds, after one run to warm up, so the first JIT compile does not count.</summary>
    private TimeSpan AverageOverSeeds(GeneratorInput input)
    {
        generator.Generate(input with { Seed = 0 });
        var total = TimeSpan.Zero;
        foreach (var seed in Seeds)
        {
            var started = Stopwatch.GetTimestamp();
            generator.Generate(input with { Seed = seed });
            total += Stopwatch.GetElapsedTime(started);
        }
        return total / Seeds.Length;
    }

    /// <summary>In the test output, and on the CI job's summary page when there is one.</summary>
    private static void Report(string name, TimeSpan average)
    {
        var line = string.Create(CultureInfo.InvariantCulture,
            $"| {name} | {average.TotalMilliseconds:0} ms | {Budget.TotalMilliseconds:0} ms |");
        TestContext.Current.TestOutputHelper?.WriteLine(line);

        if (Environment.GetEnvironmentVariable("GITHUB_STEP_SUMMARY") is { Length: > 0 } summary)
        {
            if (!File.Exists(summary) || !File.ReadAllText(summary).Contains("Generator performance", StringComparison.Ordinal))
            {
                File.AppendAllText(summary, "### Generator performance (NFR-004)\n\n| Case | Average over 5 seeds | Budget |\n| --- | --- | --- |\n");
            }
            File.AppendAllText(summary, line + "\n");
        }
    }
}
