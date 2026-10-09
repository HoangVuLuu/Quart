using System.Text.Json;
using Quart.Generator;

namespace Quart.Modules.Scheduling.Lab;

/// <summary>
/// A ready-made generator input for the lab, with the names that go with its member ids. Names live
/// here and not in the input: the generator never needs to know who anyone is.
/// Staging holds fictional data only; the sample people come from the design prototype.
/// </summary>
public sealed record LabScenario(string Name, IReadOnlyList<LabPerson> People, GeneratorInput Input);

/// <param name="Id">The member id used in the scenario's input.</param>
public sealed record LabPerson(string Id, string Name);

internal static class LabScenarios
{
    /// <summary>
    /// Presotea's sample: 15 people, an opening and a closing every day, two people per shift with at
    /// least one level 3, over two weeks. Ported from the PEOPLE array and the availability patterns of
    /// docs/prototype/quart-prototype.jsx, with the random draw frozen into the file.
    /// </summary>
    public static LabScenario Presotea { get; } = Load("presotea");

    private static LabScenario Load(string key)
    {
        using var stream = typeof(LabScenarios).Assembly.GetManifestResourceStream($"Lab.Scenarios.{key}.json")
            ?? throw new InvalidOperationException($"The lab scenario '{key}' is not embedded in the assembly.");
        var scenario = JsonSerializer.Deserialize<LabScenario>(stream, JsonSerializerOptions.Web)
            ?? throw new InvalidOperationException($"The lab scenario '{key}' is empty.");

        var errors = GeneratorInputValidator.Validate(scenario.Input);
        if (errors.Count > 0)
        {
            throw new InvalidOperationException($"The lab scenario '{key}' is not a valid generator input: {errors[0].Code} at '{errors[0].Path}'.");
        }
        return scenario;
    }
}
