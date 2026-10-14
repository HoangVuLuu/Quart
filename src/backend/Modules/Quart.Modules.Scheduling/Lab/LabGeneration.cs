using Quart.Generator;

namespace Quart.Modules.Scheduling.Lab;

/// <summary>A lab run: the generator's result, and how long the server took to produce it.</summary>
/// <param name="Milliseconds">
/// Generation time on the server, without the network, so it can be read against the 2-second budget
/// (NFR-004, M1-08). The generator itself has no clock (spec 7.2); the lab times the call.
/// </param>
public sealed record LabGeneration(GeneratorResult Result, int Milliseconds);
