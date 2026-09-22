namespace Quart.Generator;

/// <summary>
/// Small, fast, deterministic random number generator (mulberry32).
/// The same seed produces the same sequence on every machine and every run,
/// which is what makes a generated schedule reproducible from its stored seed (FR-122).
/// It is the same algorithm the clickable prototype uses, so both produce identical sequences.
/// </summary>
public sealed class SeededRandom
{
    private uint _state;

    public SeededRandom(int seed)
    {
        Seed = seed;
        _state = unchecked((uint)seed);
    }

    /// <summary>The seed this generator was created with. Store it to reproduce a result.</summary>
    public int Seed { get; }

    /// <summary>Returns a value in [0, 1).</summary>
    public double NextDouble()
    {
        unchecked
        {
            _state += 0x6D2B79F5;
            uint t = _state;
            t = (t ^ (t >> 15)) * (t | 1);
            t ^= t + ((t ^ (t >> 7)) * (t | 61));
            return (t ^ (t >> 14)) / 4294967296.0;
        }
    }

    /// <summary>Returns an integer in [0, maxExclusive).</summary>
    public int Next(int maxExclusive)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxExclusive);
        return (int)(NextDouble() * maxExclusive);
    }
}
