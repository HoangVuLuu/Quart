using System.Text.Json;

namespace Quart.Generator.Tests;

/// <summary>The lab's Presotea sample: 15 people, an opening and a closing a day, two per shift with at least one level 3, over two weeks.</summary>
internal static class Samples
{
    public static GeneratorInput Presotea { get; } = Load("presotea");

    private static GeneratorInput Load(string name)
    {
        using var file = File.OpenRead(Path.Combine(AppContext.BaseDirectory, "Scenarios", $"{name}.json"));
        using var json = JsonDocument.Parse(file);
        return json.RootElement.GetProperty("input").Deserialize<GeneratorInput>(JsonSerializerOptions.Web)!;
    }
}
