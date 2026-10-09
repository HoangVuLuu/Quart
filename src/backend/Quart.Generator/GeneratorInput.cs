namespace Quart.Generator;

/// <summary>
/// Everything the generator needs to build a schedule, and nothing else (AD-003, spec 7.2).
/// Plain base-library types only: dates are <see cref="DateOnly"/> and times <see cref="TimeOnly"/>,
/// in the workplace's local time. The Scheduling module converts from NodaTime before calling in.
/// Ids are opaque strings chosen by the caller; the generator only compares them.
/// </summary>
/// <param name="Shifts">The dated shifts of the period, each one a slot group to fill.</param>
/// <param name="Members">The people who can be scheduled.</param>
/// <param name="Availability">Per member, whether they submitted and which shifts they can work. A member with no entry has not submitted.</param>
/// <param name="LockedAssignments">Assignments that must survive generation exactly (BR-004, FR-123).</param>
/// <param name="ConflictPairs">"Cannot work together" pairs, per shift block (BR-036).</param>
/// <param name="Rules">The workplace's scheduling rules.</param>
/// <param name="Seed">All randomness flows from this, so the same input and seed give the same schedule (FR-122).</param>
public sealed record GeneratorInput(
    IReadOnlyList<GeneratorShift> Shifts,
    IReadOnlyList<GeneratorMember> Members,
    IReadOnlyList<MemberAvailability> Availability,
    IReadOnlyList<Assignment> LockedAssignments,
    IReadOnlyList<ConflictPair> ConflictPairs,
    GeneratorRules Rules,
    int Seed);

/// <summary>One dated shift: a shift block of the template on one day (AD-010).</summary>
/// <param name="Id">Unique within the input.</param>
/// <param name="BlockId">The template block this shift came from. Conflict pairs are set per block (BR-036).</param>
/// <param name="End">After <paramref name="Start"/>: a shift does not run past midnight.</param>
/// <param name="Headcount">How many people the shift needs (BR-003).</param>
/// <param name="LevelRequirements">"At least N people of level L" rules (BR-011).</param>
public sealed record GeneratorShift(
    string Id,
    string BlockId,
    DateOnly Date,
    TimeOnly Start,
    TimeOnly End,
    int Headcount,
    IReadOnlyList<LevelRequirement> LevelRequirements);

/// <summary>At least <paramref name="MinCount"/> people of <paramref name="Level"/> on the shift ("at least 1 of level 3").</summary>
public sealed record LevelRequirement(int Level, int MinCount);

/// <param name="Level">1, 2 or 3; 3 is the most senior.</param>
/// <param name="DesiredWeeklyHours">The weekly target (BR-032).</param>
/// <param name="MaxWeeklyHours">Optional admin-set ceiling; null means none (BR-032).</param>
public sealed record GeneratorMember(string Id, int Level, decimal DesiredWeeklyHours, decimal? MaxWeeklyHours);

/// <param name="Submitted">False when the member never sent availability for the period. The generator never places them (FR-121).</param>
/// <param name="ShiftIds">The shifts the member said they can work (BR-001).</param>
public sealed record MemberAvailability(string MemberId, bool Submitted, IReadOnlyList<string> ShiftIds);

/// <summary>One person on one shift.</summary>
public sealed record Assignment(string ShiftId, string MemberId);

/// <summary>Two members who are never put on the same shift of <paramref name="BlockId"/> by the generator (BR-036). Unordered.</summary>
public sealed record ConflictPair(string BlockId, string MemberA, string MemberB);

/// <param name="MaxConsecutiveShifts">1 to 4, or null for no limit (BR-005).</param>
/// <param name="OpeningFairness">Spread opening shifts fairly (BR-013, BR-020).</param>
/// <param name="ClosingFairness">Spread closing shifts fairly (BR-014, BR-020).</param>
public sealed record GeneratorRules(int? MaxConsecutiveShifts, bool OpeningFairness, bool ClosingFairness);
