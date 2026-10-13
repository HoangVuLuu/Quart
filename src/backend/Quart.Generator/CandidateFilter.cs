namespace Quart.Generator;

/// <summary>
/// The hard rules (spec 7.3, BR-036) as the one question every phase of every generator asks before it
/// places someone: can this person go on this shift, given everything placed so far? It holds the
/// schedule being built, which starts as the locked assignments, so every answer counts the locks too.
/// Greedy construction and local search (M1-04, M1-05) place and remove people only through it, so no
/// phase can break a hard rule: a slot nobody can legally fill stays open and is reported (FR-125).
/// </summary>
/// <remarks>
/// A filter only stops the generator. It does not grade: a lock that itself breaks a rule is kept
/// (BR-004), and the <see cref="Evaluator"/> reports it.
/// </remarks>
public sealed class CandidateFilter
{
    private readonly GeneratorInput input;
    private readonly Dictionary<string, GeneratorShift> shifts;
    private readonly HashSet<string> members;
    private readonly HashSet<(string MemberId, string ShiftId)> available;
    private readonly HashSet<(string ShiftId, string MemberId)> locked;
    private readonly Dictionary<(string BlockId, string MemberId), List<string>> partners = [];
    private readonly Dictionary<string, List<string>> onShift;
    private readonly Dictionary<string, List<GeneratorShift>> shiftsOf;

    /// <summary>Starts from the input's locked assignments, placed as they are (BR-004).</summary>
    /// <param name="input">A valid input: generators check it with <see cref="GeneratorInputValidator"/> first.</param>
    public CandidateFilter(GeneratorInput input)
    {
        ArgumentNullException.ThrowIfNull(input);
        this.input = input;
        shifts = input.Shifts.ToDictionary(shift => shift.Id, StringComparer.Ordinal);
        members = input.Members.Select(member => member.Id).ToHashSet(StringComparer.Ordinal);
        available = HardRules.Available(input);
        locked = input.LockedAssignments.Select(assignment => (assignment.ShiftId, assignment.MemberId)).ToHashSet();
        foreach (var pair in input.ConflictPairs)
        {
            Partners(pair.BlockId, pair.MemberA).Add(pair.MemberB);
            Partners(pair.BlockId, pair.MemberB).Add(pair.MemberA);
        }

        onShift = input.Shifts.ToDictionary(shift => shift.Id, _ => new List<string>(), StringComparer.Ordinal);
        shiftsOf = input.Members.ToDictionary(member => member.Id, _ => new List<GeneratorShift>(), StringComparer.Ordinal);
        foreach (var assignment in input.LockedAssignments)
        {
            Place(shifts[assignment.ShiftId], assignment.MemberId);
        }
    }

    /// <summary>Everyone placed so far, locks included, in the order of the input's shifts and, within a shift, the order they were placed.</summary>
    public IReadOnlyList<Assignment> Assignments =>
        input.Shifts.SelectMany(shift => onShift[shift.Id].Select(memberId => new Assignment(shift.Id, memberId))).ToList();

    /// <summary>How many more people the shift takes before it reaches its headcount; 0 when full, or overfilled by locks.</summary>
    public int OpenSlots(string shiftId) => Math.Max(0, Shift(shiftId).Headcount - onShift[shiftId].Count);

    /// <summary>True when <paramref name="memberId"/> is on <paramref name="shiftId"/> so far, locked or placed.</summary>
    public bool IsAssigned(string shiftId, string memberId) => onShift.TryGetValue(shiftId, out var people) && people.Contains(memberId);

    /// <summary>True when the assignment is one of the input's locks, which nothing may remove (BR-004).</summary>
    public bool IsLocked(string shiftId, string memberId) => locked.Contains((shiftId, memberId));

    /// <summary>
    /// Whether placing <paramref name="memberId"/> on <paramref name="shiftId"/> keeps every hard rule,
    /// given everything placed so far.
    /// </summary>
    /// <exception cref="ArgumentException">The shift or the member is not in the input.</exception>
    public bool CanAssign(string shiftId, string memberId)
    {
        var shift = Shift(shiftId);
        if (!members.Contains(memberId))
        {
            throw new ArgumentException($"The member '{memberId}' is not in the input.", nameof(memberId));
        }

        var people = onShift[shiftId];
        return !people.Contains(memberId)
            && people.Count < shift.Headcount // BR-003
            && available.Contains((memberId, shiftId)) // BR-001, and BR-002 across workplaces
            && !shiftsOf[memberId].Any(other => HardRules.Overlap(shift, other)) // BR-002 in this workplace
            && !(partners.TryGetValue((shift.BlockId, memberId), out var them) && people.Any(them.Contains)) // BR-036
            && WithinConsecutiveLimit(shift, memberId); // BR-005
    }

    /// <summary>Places <paramref name="memberId"/> on <paramref name="shiftId"/>.</summary>
    /// <exception cref="InvalidOperationException">The placement would break a hard rule: ask <see cref="CanAssign"/> first.</exception>
    public void Assign(string shiftId, string memberId)
    {
        if (!CanAssign(shiftId, memberId))
        {
            throw new InvalidOperationException($"Placing {memberId} on {shiftId} would break a hard rule.");
        }
        Place(shifts[shiftId], memberId);
    }

    /// <summary>Takes <paramref name="memberId"/> off <paramref name="shiftId"/>, for example to try someone else there.</summary>
    /// <exception cref="InvalidOperationException">The assignment is locked (BR-004), or was never placed.</exception>
    public void Unassign(string shiftId, string memberId)
    {
        var shift = Shift(shiftId);
        if (IsLocked(shiftId, memberId))
        {
            throw new InvalidOperationException($"{memberId} on {shiftId} is locked.");
        }
        if (!onShift[shiftId].Remove(memberId))
        {
            throw new InvalidOperationException($"{memberId} is not on {shiftId}.");
        }
        shiftsOf[memberId].Remove(shift);
    }

    /// <summary>
    /// BR-005: every shift counts as one, whatever its day, and a day without any of the person's
    /// shifts ends the run. Placing this shift may join the run before it to the run after it, so count
    /// both ways from its date.
    /// </summary>
    private bool WithinConsecutiveLimit(GeneratorShift shift, string memberId)
    {
        if (input.Rules.MaxConsecutiveShifts is not int max)
        {
            return true;
        }

        var perDay = shiftsOf[memberId].GroupBy(other => other.Date.DayNumber).ToDictionary(day => day.Key, day => day.Count());
        var run = 1 + perDay.GetValueOrDefault(shift.Date.DayNumber);
        for (var day = shift.Date.DayNumber - 1; perDay.TryGetValue(day, out var count); day--)
        {
            run += count;
        }
        for (var day = shift.Date.DayNumber + 1; perDay.TryGetValue(day, out var count); day++)
        {
            run += count;
        }
        return run <= max;
    }

    private void Place(GeneratorShift shift, string memberId)
    {
        onShift[shift.Id].Add(memberId);
        shiftsOf[memberId].Add(shift);
    }

    private GeneratorShift Shift(string shiftId) =>
        shifts.TryGetValue(shiftId, out var shift)
            ? shift
            : throw new ArgumentException($"The shift '{shiftId}' is not in the input.", nameof(shiftId));

    private List<string> Partners(string blockId, string memberId)
    {
        if (!partners.TryGetValue((blockId, memberId), out var list))
        {
            partners[(blockId, memberId)] = list = [];
        }
        return list;
    }
}
