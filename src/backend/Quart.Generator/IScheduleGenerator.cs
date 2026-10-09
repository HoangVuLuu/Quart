namespace Quart.Generator;

/// <summary>
/// Builds a schedule from an input. A pure function: no database, HTTP or clock, and the same input
/// with the same seed always gives the same result (AD-003, spec 7.2). The algorithm can change behind
/// this interface (AD-004 names CP-SAT as a fallback) without anything else noticing.
/// </summary>
public interface IScheduleGenerator
{
    /// <summary>Generates a schedule. Never breaks a locked assignment (BR-004).</summary>
    /// <exception cref="ArgumentException">The input fails <see cref="GeneratorInputValidator"/>. Validate first to report errors to a person.</exception>
    GeneratorResult Generate(GeneratorInput input);
}
