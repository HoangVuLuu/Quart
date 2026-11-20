using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Scheduling.Persistence;

namespace Quart.Modules.Scheduling.Drafts;

using Period = Persistence.Period;

/// <summary>A time someone already works at another workplace: when, and nothing else (FR-094).</summary>
internal sealed record BusySlot(Guid UserId, Instant Start, Instant End)
{
    /// <summary>Half-open, like shifts (AD-011): a shift starting when this ends does not overlap.</summary>
    public bool Overlaps(Shift shift) => Start < shift.EndsAt && shift.StartsAt < End;
}

/// <summary>
/// Shifts people hold at other workplaces, so nobody is booked twice (BR-002, M5-11). This is the one query
/// that crosses workplaces on purpose. It reads only the published schedule (never another manager's draft)
/// and selects only the person and the two instants: never the workplace, the period or the shift, so
/// nothing that names the other workplace can reach a response, a log or an error.
/// </summary>
internal static class BusyElsewhere
{
    public static async Task<IReadOnlyList<BusySlot>> LoadAsync(
        SchedulingDb db, Period period, IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken)
    {
        if (userIds.Count == 0)
        {
            return [];
        }
        var zone = DateTimeZoneProviders.Tzdb[period.TimeZone];
        var from = period.StartDate.AtStartOfDayInZone(zone).ToInstant();
        var to = period.EndDate.PlusDays(1).AtStartOfDayInZone(zone).ToInstant();
        var otherPeriods = db.Periods.Where(x => x.WorkplaceId != period.WorkplaceId).Select(x => x.Id);
        var rows = await db.Assignments.AsNoTracking()
            .Where(x => !x.IsDraft && userIds.Contains(x.UserId) && otherPeriods.Contains(x.PeriodId) && x.StartsAt < to && x.EndsAt > from)
            .Select(x => new { x.UserId, x.StartsAt, x.EndsAt })
            .ToListAsync(cancellationToken);
        return rows.Select(x => new BusySlot(x.UserId, x.StartsAt, x.EndsAt)).ToList();
    }
}
