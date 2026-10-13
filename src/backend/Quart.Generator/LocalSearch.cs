namespace Quart.Generator;

/// <summary>
/// The second phase of the generator (AD-004, spec 7.7 step 3, M1-05): improve the greedy schedule by
/// small changes, keeping a change only when the <see cref="Evaluator"/> scores it higher. Every change
/// goes through the <see cref="CandidateFilter"/>, so hard rules are checked before it is applied and no
/// change can break one (BR-005 included). Locks are never touched (BR-004).
/// <list type="bullet">
/// <item><b>Fill</b> an open slot. Someone already working that day only when nobody else can (BR-015).</item>
/// <item><b>Replace</b> one person on a shift with another. Never with someone already working that day,
/// since the slot was full: a double is never worth it when the slot is filled anyway (BR-015).</item>
/// <item><b>Swap</b> two people's shifts, often on the same day, which moves openings and closings between
/// people at almost no cost in hours, for fairness (BR-013, BR-014).</item>
/// </list>
/// It is bounded by a number of tries that grows with the period, and stops early once many tries in a
/// row improve nothing. There is no time limit: the generator has no clock (spec 7.2), so the same seed
/// always gives the same schedule (FR-122). Speed is held by the performance test (NFR-004, M1-08).
/// </summary>
internal static class LocalSearch
{
    /// <summary>At most this many tries per slot of the period.</summary>
    private const int TriesPerSlot = 60;

    /// <summary>Stop after this many tries per slot in a row without an improvement.</summary>
    private const int PatiencePerSlot = 15;

    /// <summary>
    /// Never more tries than this, however long the period. Presotea's longest period, 4 weeks of 28
    /// slots, needs 6 720 at most, so only periods far bigger than the shop's are cut short.
    /// </summary>
    private const int MaxTries = 8_000;

    /// <summary>...and never wait longer than this for an improvement. The sample's two weeks give up after 840.</summary>
    private const int MaxPatience = 1_500;

    public static void Run(GeneratorInput input, CandidateFilter filter, SeededRandom random, Evaluator.Rulebook rulebook, int score)
    {
        var slots = input.Shifts.Sum(shift => shift.Headcount);
        if (slots == 0 || input.Members.Count == 0)
        {
            return;
        }

        var search = new Search(input, filter, random, rulebook, score);
        var budget = Math.Min(TriesPerSlot * slots, MaxTries);
        var patience = Math.Min(PatiencePerSlot * slots, MaxPatience);
        for (int tries = 0, stale = 0; tries < budget && stale < patience; tries++)
        {
            var improved = random.Next(3) switch
            {
                0 => search.TryFill(),
                1 => search.TryReplace(),
                _ => search.TrySwap(),
            };
            stale = improved ? 0 : stale + 1;
        }
    }

    private sealed class Search(GeneratorInput input, CandidateFilter filter, SeededRandom random, Evaluator.Rulebook rulebook, int score)
    {
        private readonly Dictionary<string, GeneratorShift> shifts = input.Shifts.ToDictionary(shift => shift.Id, StringComparer.Ordinal);

        // Who said they can work each shift: the only people worth trying there.
        private readonly Dictionary<string, string[]> candidates = CandidatesOf(input);

        private int score = score;

        // Every assignment that may change, rebuilt only after a kept change: a rejected try is undone,
        // which leaves the same assignments in place.
        private List<(string ShiftId, string MemberId)>? movable;

        public bool TryFill()
        {
            var open = input.Shifts.Where(shift => filter.OpenSlots(shift.Id) > 0).ToList();
            if (open.Count == 0)
            {
                return false;
            }

            var shift = open[random.Next(open.Count)];
            var allowed = candidates[shift.Id].Where(memberId => filter.CanAssign(shift.Id, memberId)).ToList();
            var single = allowed.Where(memberId => !filter.WorksOn(memberId, shift.Date)).ToList();
            var pool = single.Count > 0 ? single : allowed; // BR-015: a double only as a last resort
            if (pool.Count == 0)
            {
                return false;
            }

            var memberId = pool[random.Next(pool.Count)];
            filter.Assign(shift.Id, memberId);
            return KeepIfBetter(() => filter.Unassign(shift.Id, memberId));
        }

        public bool TryReplace()
        {
            if (RandomMovable() is not (string shiftId, string current))
            {
                return false;
            }

            var shift = shifts[shiftId];
            filter.Unassign(shiftId, current);
            var pool = candidates[shiftId]
                .Where(memberId => memberId != current && filter.CanAssign(shiftId, memberId) && !filter.WorksOn(memberId, shift.Date))
                .ToList();
            if (pool.Count == 0)
            {
                filter.Assign(shiftId, current);
                return false;
            }

            var next = pool[random.Next(pool.Count)];
            filter.Assign(shiftId, next);
            return KeepIfBetter(() =>
            {
                filter.Unassign(shiftId, next);
                filter.Assign(shiftId, current);
            });
        }

        public bool TrySwap()
        {
            // Half the time, the other person works the same day: an opener and a closer trading is what
            // evens out openings and closings, and random pairs from the whole period rarely find one.
            if (RandomMovable() is not (string firstShift, string a))
            {
                return false;
            }
            var sameDay = random.Next(2) == 0 ? shifts[firstShift].Date : (DateOnly?)null;
            if (RandomMovable(sameDay) is not (string secondShift, string b) || a == b || firstShift == secondShift)
            {
                return false;
            }

            filter.Unassign(firstShift, a);
            filter.Unassign(secondShift, b);
            if (Fits(firstShift, b))
            {
                filter.Assign(firstShift, b);
                if (Fits(secondShift, a))
                {
                    filter.Assign(secondShift, a);
                    return KeepIfBetter(() =>
                    {
                        filter.Unassign(secondShift, a);
                        filter.Unassign(firstShift, b);
                        filter.Assign(firstShift, a);
                        filter.Assign(secondShift, b);
                    });
                }
                filter.Unassign(firstShift, b);
            }

            filter.Assign(firstShift, a);
            filter.Assign(secondShift, b);
            return false;
        }

        // Allowed by every hard rule, and not a new double (BR-015).
        private bool Fits(string shiftId, string memberId) =>
            filter.CanAssign(shiftId, memberId) && !filter.WorksOn(memberId, shifts[shiftId].Date);

        /// <summary>A random assignment local search may change: anything but a lock, on <paramref name="date"/> when given.</summary>
        private (string ShiftId, string MemberId)? RandomMovable(DateOnly? date = null)
        {
            movable ??= filter.Assignments
                .Where(assignment => !filter.IsLocked(assignment.ShiftId, assignment.MemberId))
                .Select(assignment => (assignment.ShiftId, assignment.MemberId))
                .ToList();
            var pool = date is null ? movable : movable.Where(assignment => shifts[assignment.ShiftId].Date == date).ToList();
            return pool.Count == 0 ? null : pool[random.Next(pool.Count)];
        }

        /// <summary>Grades the changed schedule; keeps the change when it scores higher, otherwise undoes it.</summary>
        private bool KeepIfBetter(Action undo)
        {
            var changed = Evaluator.Score(rulebook, filter.Assignments);
            if (changed > score)
            {
                score = changed;
                movable = null;
                return true;
            }
            undo();
            return false;
        }

        private static Dictionary<string, string[]> CandidatesOf(GeneratorInput input)
        {
            var available = HardRules.Available(input);
            return input.Shifts.ToDictionary(
                shift => shift.Id,
                shift => input.Members.Where(member => available.Contains((member.Id, shift.Id))).Select(member => member.Id).ToArray(),
                StringComparer.Ordinal);
        }
    }
}
