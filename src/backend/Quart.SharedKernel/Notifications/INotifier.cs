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
    public const string AvailabilityRequested = "availability.requested";
    public const string AvailabilityReminder = "availability.reminder";
    public const string AvailabilityReopened = "availability.reopened";
    public const string AvailabilitySent = "availability.sent";
    public const string AvailabilityNoteAdded = "availability.note_added";
    public const string SchedulePublished = "schedule.published";
    public const string ScheduleChanged = "schedule.changed";
    public const string ShiftOffered = "shift.offered";
    public const string ShiftClaimed = "shift.claimed";
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

    private static readonly string[] Shift = ["date", "start", "end", "name"];

    public static IReadOnlyDictionary<string, IReadOnlyList<string>> AllowedParameters { get; } =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [MemberJoined] = ["name"],
            [MemberLeft] = ["name"],
            [AvailabilityRequested] = ["periodStart", "weeks"],
            [AvailabilityReminder] = ["periodStart"],
            [AvailabilityReopened] = ["periodStart"],
            [AvailabilitySent] = ["name", "periodStart"],
            [AvailabilityNoteAdded] = ["name", "periodStart"],
            [SchedulePublished] = ["periodStart", "version"],
            [ScheduleChanged] = ["periodStart", "added", "removed"],
            [ShiftOffered] = Shift,
            [ShiftClaimed] = Shift,
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
        };
}
