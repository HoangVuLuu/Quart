using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Scheduling.Persistence;

namespace Quart.Modules.Scheduling.Drafts;

using Period = Persistence.Period;

/// <summary>
/// The manager's visit to Building Schedule or Editing Schedule (4.3, 4.4, 2026-11-18).
/// <list type="bullet">
/// <item>Entering locks availability (FR-100) and remembers the draft as it was, the "saved" copy.</item>
/// <item>Save draft replaces that copy. Leaving puts the draft back to it, so unsaved changes are dropped.</item>
/// <item>On Building Schedule, leaving unlocks availability again; Editing Schedule (a published period) stays locked.</item>
/// <item>The page sends a sign of life every 30 seconds. With none for <see cref="Timeout"/>, the visit counts as
/// left without saving: closing the app is the same as the back arrow without saving. That is settled the next
/// time anyone needs the answer (a worker opening or sending availability, the Schedule page, the manager
/// coming back), never by a timer.</item>
/// </list>
/// </summary>
internal static class BuildSession
{
    public static readonly Duration Timeout = Duration.FromMinutes(2);

    /// <summary>Starts or resumes the visit. A visit nobody ended is ended first, without saving.</summary>
    public static async Task EnterAsync(SchedulingDb db, Period period, Instant now, CancellationToken cancellationToken)
    {
        await SettleAsync(db, period, now, cancellationToken);
        period.SessionSeenAt = now;
        period.SavedDraft ??= Snapshot(await DraftAsync(db, period.Id, cancellationToken));
    }

    /// <summary>
    /// Ends a visit whose page stopped answering more than <see cref="Timeout"/> ago, as if the manager had
    /// left without saving. Returns true when something changed; the caller saves.
    /// </summary>
    public static async Task<bool> SettleAsync(SchedulingDb db, Period period, Instant now, CancellationToken cancellationToken)
    {
        if (period.SessionSeenAt is not { } seen || now - seen <= Timeout)
        {
            return false;
        }
        await LeaveAsync(db, period, cancellationToken);
        return true;
    }

    /// <summary>Puts back the saved copy and ends the visit; an unpublished period's availability unlocks.</summary>
    public static async Task LeaveAsync(SchedulingDb db, Period period, CancellationToken cancellationToken)
    {
        if (period.SavedDraft is { } saved)
        {
            await RestoreAsync(db, period, Read(saved), cancellationToken);
        }
        period.SessionSeenAt = null;
        if (period.Version == 0)
        {
            period.LockedAt = null;
            period.Status = Period.Collecting;
            // Nothing saved means nothing to come back to: "Build", not "Continue building".
            if (period.DraftSavedAt is null)
            {
                period.SavedDraft = null;
            }
        }
        else
        {
            period.SavedDraft = null;
        }
    }

    public static async Task SaveAsync(SchedulingDb db, Period period, Instant now, CancellationToken cancellationToken)
    {
        period.SavedDraft = Snapshot(await DraftAsync(db, period.Id, cancellationToken));
        period.DraftSavedAt = now;
    }

    /// <summary>True when the draft is not what was last saved (or what it was on entering).</summary>
    public static bool HasUnsavedChanges(Period period, IEnumerable<Assignment> draft) =>
        period.SavedDraft is { } saved && !Read(saved).ToHashSet().SetEquals(draft.Select(Row.Of));

    public static string Snapshot(IEnumerable<Assignment> draft) =>
        JsonSerializer.Serialize(draft.Select(Row.Of).OrderBy(x => x.ShiftId).ThenBy(x => x.MembershipId), JsonSerializerOptions.Web);

    private static List<Row> Read(string saved) => JsonSerializer.Deserialize<List<Row>>(saved, JsonSerializerOptions.Web) ?? [];

    private static Task<List<Assignment>> DraftAsync(SchedulingDb db, Guid periodId, CancellationToken cancellationToken) =>
        db.Assignments.AsNoTracking().Where(x => x.PeriodId == periodId && x.IsDraft).ToListAsync(cancellationToken);

    private static async Task RestoreAsync(SchedulingDb db, Period period, List<Row> rows, CancellationToken cancellationToken)
    {
        await db.Assignments.Where(x => x.PeriodId == period.Id && x.IsDraft).ExecuteDeleteAsync(cancellationToken);
        var shifts = await db.Shifts.AsNoTracking().Where(x => x.PeriodId == period.Id).ToDictionaryAsync(x => x.Id, cancellationToken);
        db.Assignments.AddRange(rows.Where(x => shifts.ContainsKey(x.ShiftId)).Select(x => new Assignment
        {
            Id = Guid.NewGuid(),
            PeriodId = period.Id,
            ShiftId = x.ShiftId,
            MembershipId = x.MembershipId,
            UserId = x.UserId,
            IsDraft = true,
            IsLocked = x.Locked,
            Source = x.Source,
            StartsAt = shifts[x.ShiftId].StartsAt,
            EndsAt = shifts[x.ShiftId].EndsAt,
        }));
    }

    private sealed record Row(Guid ShiftId, Guid MembershipId, Guid UserId, bool Locked, string Source)
    {
        public static Row Of(Assignment x) => new(x.ShiftId, x.MembershipId, x.UserId, x.IsLocked, x.Source);
    }
}
