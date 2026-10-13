namespace Quart.Generator;

/// <summary>
/// The first phase of the generator (AD-004, spec 7.7 steps 1 and 2, M1-04): a good first schedule,
/// built one shift at a time.
/// <list type="number">
/// <item>Shifts with the fewest available people go first, so the hard ones are filled while there is
/// still a choice. A small random jitter from the seed breaks ties.</item>
/// <item>On each shift, level requirements are met first (BR-011), then the other slots are filled
/// (BR-010).</item>
/// <item>The candidate is whoever is furthest below their desired hours that week (BR-012), picked at
/// random among the few best, so another seed gives another good schedule (FR-122). A second shift the
/// same day is a last resort (BR-015).</item>
/// </list>
/// </summary>
internal static class GreedyConstruction
{
    /// <summary>A pick is random among at most this many of the best candidates.</summary>
    private const int TopFew = 3;

    /// <summary>...and only among those within this many hours of the best one's need, so randomness never picks a poor candidate.</summary>
    private const decimal CloseEnoughHours = 2m;

    /// <summary>
    /// On a slot with no level rule, someone of the highest level any shift asks for counts as needing
    /// this many hours less. People of that level are usually the scarce ones (Q-01), and every shift
    /// they fill without needing to uses up their run of shifts in a row (BR-005) before a shift that
    /// does need them. Roughly one shift: enough to prefer someone else, not to starve them of hours.
    /// </summary>
    private const decimal ScarceLevelHours = 6m;

    public static void Run(GeneratorInput input, CandidateFilter filter, SeededRandom random)
    {
        var available = HardRules.Available(input);
        var weeks = HardRules.Weeks(input);
        var levels = input.Members.ToDictionary(member => member.Id, member => member.Level, StringComparer.Ordinal);
        var scarceLevel = input.Shifts.SelectMany(shift => shift.LevelRequirements).Select(requirement => requirement.Level).DefaultIfEmpty(int.MaxValue).Max();

        // One draw per shift, in input order, so the order depends only on the input and the seed.
        var order = input.Shifts
            .Select(shift => (Shift: shift, Key: input.Members.Count(member => available.Contains((member.Id, shift.Id))) + random.NextDouble()))
            .ToList()
            .OrderBy(entry => entry.Key)
            .Select(entry => entry.Shift);

        foreach (var shift in order)
        {
            // Highest level first: a level 3 placed for a level 3 rule also counts toward a level 2 rule (FR-066).
            foreach (var requirement in shift.LevelRequirements.OrderByDescending(requirement => requirement.Level))
            {
                while (filter.OpenSlots(shift.Id) > 0
                    && filter.On(shift.Id).Count(memberId => levels[memberId] >= requirement.Level) < requirement.MinCount)
                {
                    if (Pick(input, filter, random, shift, weeks, member => member.Level >= requirement.Level, _ => 0m) is not string memberId)
                    {
                        break; // nobody of that level can legally take it: reported as a missing level
                    }
                    filter.Assign(shift.Id, memberId);
                }
            }

            while (filter.OpenSlots(shift.Id) > 0)
            {
                if (Pick(input, filter, random, shift, weeks, _ => true, member => member.Level >= scarceLevel ? ScarceLevelHours : 0m) is not string memberId)
                {
                    break; // the slot stays open and is reported (FR-125)
                }
                filter.Assign(shift.Id, memberId);
            }
        }
    }

    private static string? Pick(
        GeneratorInput input,
        CandidateFilter filter,
        SeededRandom random,
        GeneratorShift shift,
        int weeks,
        Func<GeneratorMember, bool> eligible,
        Func<GeneratorMember, decimal> reserve)
    {
        var candidates = input.Members.Where(member => eligible(member) && filter.CanAssign(shift.Id, member.Id)).ToList();
        if (candidates.Count == 0)
        {
            return null;
        }

        // BR-015: both shifts of a day only when nobody else can take this one.
        var single = candidates.Where(member => !filter.WorksOn(member.Id, shift.Date)).ToList();
        if (single.Count > 0)
        {
            candidates = single;
        }

        // BR-012: whoever needs the hours most that week, then over the whole period. Sorting is stable,
        // so equal needs keep the input's order before the random pick.
        var week = filter.WeekOf(shift.Id);
        var ranked = candidates
            .Select(member => (
                Member: member,
                WeekNeed: member.DesiredWeeklyHours - filter.WeekHours(member.Id, week) - reserve(member),
                PeriodNeed: member.DesiredWeeklyHours * weeks - filter.Hours(member.Id)))
            .OrderByDescending(candidate => candidate.WeekNeed)
            .ThenByDescending(candidate => candidate.PeriodNeed)
            .ToList();
        var best = ranked[0].WeekNeed;
        var top = ranked.Take(TopFew).Where(candidate => best - candidate.WeekNeed <= CloseEnoughHours).ToList();
        return top[random.Next(top.Count)].Member.Id;
    }
}
