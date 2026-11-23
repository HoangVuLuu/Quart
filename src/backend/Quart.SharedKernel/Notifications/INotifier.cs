namespace Quart.SharedKernel.Notifications;

/// <summary>
/// Sends an in-app notification (FR-210). Implemented by the Notifications module. The server stores a
/// type and parameters, never text: the web app renders the sentence from its translations (FR-263).
/// </summary>
public interface INotifier
{
    Task NotifyAsync(IReadOnlyCollection<NotificationRequest> notifications, CancellationToken cancellationToken);
}

/// <param name="Type">One of <see cref="NotificationTypes"/>.</param>
/// <param name="Parameters">Only the names that type allows (FR-216); anything else is refused.</param>
public sealed record NotificationRequest(
    Guid WorkplaceId,
    Guid MembershipId,
    Guid UserId,
    string Type,
    IReadOnlyDictionary<string, string>? Parameters = null);

/// <summary>
/// Every notification type and the parameter names it may carry. This is the one place FR-216 is
/// enforced: no type may carry a comment, a note, a message body, an amount or a file.
/// </summary>
public static class NotificationTypes
{
    public const string MemberJoined = "member.joined";
    public const string MemberLeft = "member.left";

    /// <summary>To managers: someone deleted their account, so they left and their upcoming shifts are open (FR-009).</summary>
    public const string MemberDeletedAccount = "member.account_deleted";
    public const string AvailabilityRequested = "availability.requested";
    public const string AvailabilityReminder = "availability.reminder";
    public const string AvailabilitySent = "availability.sent";
    public const string AvailabilityNoteAdded = "availability.note_added";
    public const string AvailabilityDue = "availability.due";
    public const string SchedulePublished = "schedule.published";

    /// <summary>To who sent availability or holds a shift in it: the admin cancelled the period (2026-11-18).</summary>
    public const string PeriodCancelled = "period.cancelled";
    public const string ScheduleChanged = "schedule.changed";
    public const string ShiftOffered = "shift.offered";
    public const string ShiftClaimed = "shift.claimed";

    /// <summary>To the people on a published shift: the manager added or changed its note with Update (FR-145).</summary>
    public const string ShiftNoteChanged = "shift.note";

    /// <summary>To the people on a published shift: the manager changed its hours (M4-01, 2026-11-23).</summary>
    public const string ShiftHoursChanged = "shift.hours_changed";

    /// <summary>To the people on a published shift: the manager removed it from the schedule (M4-01, 2026-11-23).</summary>
    public const string ShiftRemoved = "shift.removed";

    /// <summary>To managers: a claim or trade that needed no approval left a shift without its required level (3.3).</summary>
    public const string ShiftMissingLevel = "shift.missing_level";
    public const string ClaimRequested = "claim.requested";
    public const string ClaimApproved = "claim.approved";
    public const string ClaimDeclined = "claim.declined";
    public const string TradeRequested = "trade.requested";
    public const string TradeAccepted = "trade.accepted";
    public const string TradeDeclined = "trade.declined";
    public const string TradeAwaitingApproval = "trade.awaiting_approval";
    public const string TradeApplied = "trade.applied";
    public const string TradeRejected = "trade.rejected";
    public const string TradeExpired = "trade.expired";

    /// <summary>To both people in a pending trade: a manager changed the hours of one of its shifts (FR-191).</summary>
    public const string TradeCancelled = "trade.cancelled";

    /// <summary>To managers: a shift given away is still untaken 36 hours before it starts (FR-183, M7-05).</summary>
    public const string ShiftUnclaimed = "shift.unclaimed";

    /// <summary>To the person giving it away: nobody has taken their shift yet, 36 hours before it (FR-183, M7-05).</summary>
    public const string ShiftUnclaimedMine = "shift.unclaimed_mine";

    // shiftId and periodId: the shift the alert opens on the Schedule tab, when there is one (2026-11-18).
    private static readonly string[] Shift = ["date", "start", "end", "name", "shiftId", "periodId"];

    /// <summary>
    /// Types that belong to the Trade tab, not to Alerts (2.5, 2026-11-18): they are stored, pushed and emailed
    /// like any other, but the Alerts list and its count leave them out. The Trade tab counts its own items.
    /// </summary>
    public static IReadOnlySet<string> TradeTab { get; } = new HashSet<string>(StringComparer.Ordinal) { ShiftOffered, TradeRequested };

    /// <summary>
    /// Requests waiting for a manager's decision (2026-11-21). The top of Alerts already shows each one with
    /// Approve and Decline, so the Recent list and its count leave them out, like <see cref="TradeTab"/>. They
    /// are still stored, pushed and emailed.
    /// </summary>
    public static IReadOnlySet<string> Decisions { get; } = new HashSet<string>(StringComparer.Ordinal) { ClaimRequested, TradeAwaitingApproval };

    /// <summary>
    /// "Just so you know" updates for managers (Hoang, 2026-11-22): shown in Alerts, never pushed to a phone.
    /// Every other type is pushed to the browsers that turned push on (M8-06).
    /// </summary>
    public static IReadOnlySet<string> NotPushed { get; } = new HashSet<string>(StringComparer.Ordinal) { MemberJoined, AvailabilitySent, AvailabilityNoteAdded };

    public static IReadOnlyDictionary<string, IReadOnlyList<string>> AllowedParameters { get; } =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [MemberJoined] = ["name"],
            [MemberLeft] = ["name"],
            [MemberDeletedAccount] = ["name"],
            [AvailabilityRequested] = ["periodStart", "weeks"],
            [AvailabilityReminder] = ["periodStart"],
            [AvailabilitySent] = ["name", "periodStart", "periodId", "membershipId"],
            [AvailabilityNoteAdded] = ["name", "periodStart", "periodId", "membershipId"],
            [AvailabilityDue] = ["periodStart", "sent", "total"],
            [SchedulePublished] = ["periodStart", "version"],
            [PeriodCancelled] = ["periodStart", "weeks"],
            [ScheduleChanged] = ["periodStart", "added", "removed"],
            [ShiftOffered] = Shift,
            [ShiftClaimed] = Shift,
            [ShiftNoteChanged] = ["date", "start", "end", "shiftId", "periodId"],
            [ShiftHoursChanged] = ["date", "start", "end", "shiftId", "periodId"],
            [ShiftRemoved] = ["date", "start", "end"],
            [ShiftMissingLevel] = Shift,
            [ClaimRequested] = Shift,
            [ClaimApproved] = Shift,
            [ClaimDeclined] = Shift,
            [TradeRequested] = Shift,
            [TradeAccepted] = Shift,
            [TradeDeclined] = Shift,
            [TradeAwaitingApproval] = Shift,
            [TradeApplied] = Shift,
            [TradeRejected] = ["date", "start", "end", "name", "reason"],
            [TradeExpired] = Shift,
            [TradeCancelled] = Shift,
            [ShiftUnclaimed] = Shift,
            [ShiftUnclaimedMine] = Shift,
        };
}
