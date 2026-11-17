using NodaTime;

namespace Quart.SharedKernel.Scheduling;

/// <summary>
/// The published schedule, as the Marketplace module may see and change it (AD-012). Implemented by the
/// Scheduling module, which owns the assignments. Every change is one database transaction, and the
/// database itself refuses a double booking (AD-011).
/// </summary>
public interface IScheduleLedger
{
    /// <summary>Published shifts of the workplace that have not started yet, soonest first.</summary>
    Task<IReadOnlyList<LiveShift>> GetUpcomingAsync(Guid workplaceId, CancellationToken cancellationToken);

    Task<LiveShift?> FindAsync(Guid workplaceId, Guid shiftId, CancellationToken cancellationToken);

    /// <summary>
    /// Does this member hold a shift that has not started yet, in a draft or a published schedule? Used to
    /// refuse turning "works shifts" off while they still do (FR-036).
    /// </summary>
    Task<bool> HasUpcomingAsync(Guid workplaceId, Guid membershipId, CancellationToken cancellationToken);

    /// <summary>
    /// Puts <paramref name="to"/> on the shift: in place of <paramref name="from"/> when given (a give-away),
    /// otherwise in an empty slot (an open shift).
    /// </summary>
    Task<LedgerResult> TransferAsync(Guid workplaceId, Guid shiftId, Guid? from, LedgerPerson to, string source, CancellationToken cancellationToken);

    /// <summary>Swaps two people between two shifts, all or nothing (FR-188, FR-192).</summary>
    Task<LedgerResult> SwapAsync(Guid workplaceId, Guid shiftA, LedgerPerson a, Guid shiftB, LedgerPerson b, bool requireLevels, CancellationToken cancellationToken);
}

public sealed record LedgerPerson(Guid MembershipId, Guid UserId, int Level);

/// <param name="Start">When the shift begins, as an instant; nothing can change once it has passed.</param>
public sealed record LiveShift(
    Guid Id,
    Guid PeriodId,
    LocalDate Date,
    LocalTime StartTime,
    LocalTime EndTime,
    Instant Start,
    Instant End,
    int Headcount,
    IReadOnlyList<LiveRequirement> Requirements,
    IReadOnlyList<LedgerPerson> Holders)
{
    public int OpenSlots => Math.Max(0, Headcount - Holders.Count);

    /// <summary>Would the shift still have its required levels with these people on it? Levels are a ladder (FR-066).</summary>
    public bool LevelsCoveredBy(IEnumerable<LedgerPerson> people)
    {
        var levels = people.Select(person => person.Level).ToList();
        return Requirements.All(requirement => levels.Count(level => level >= requirement.Level) >= requirement.MinCount);
    }
}

public sealed record LiveRequirement(int Level, int MinCount);

public enum LedgerResult
{
    Applied,

    /// <summary>The shift is not published, or has already started.</summary>
    NotAvailable,

    /// <summary>Someone else took it first, or the giver no longer holds it (AD-013).</summary>
    Taken,

    /// <summary>The person already holds a shift that overlaps this one (FR-185, BR-002).</summary>
    Overlap,

    /// <summary>The swap would leave a shift without its required level (FR-192).</summary>
    MissingLevel,
}
