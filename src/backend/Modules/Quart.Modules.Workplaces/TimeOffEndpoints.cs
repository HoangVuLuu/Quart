using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using NodaTime.Text;
using Quart.Modules.Workplaces.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Notifications;
using Quart.SharedKernel.Scheduling;

namespace Quart.Modules.Workplaces;

/// <summary>
/// Time off (BL-01, Hoang 2026-11-25). Staff ask from Home; a manager who approves requests accepts or refuses it
/// from Alerts. Accepting takes the person off their shifts on those days. During the time off the team page
/// shows their shifts as off; the day after the last day they are back on by themselves. A manager who turns
/// shifts back on early ends the whole time off. Managers do not ask: they turn their own shifts off.
/// </summary>
internal static class TimeOffEndpoints
{
    public const string NotStaff = "timeoff.not_staff";
    public const string AlreadyOpen = "timeoff.already_open";
    public const string FirstDayPast = "timeoff.first_day_past";
    public const string LastBeforeFirst = "timeoff.last_before_first";
    public const string TooLong = "timeoff.too_long";
    public const string ReasonTooLong = "timeoff.reason_too_long";
    public const string NotPending = "timeoff.not_pending";

    /// <summary>A request covers at most a year; longer is "undetermined".</summary>
    private const int MaxDays = 366;

    public static void MapTimeOff(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/time-off");
        group.MapGet("/mine", GetMineAsync).AllowAnyMember().WithName("GetMyTimeOff");
        group.MapPost("/", RequestAsync).AllowAnyMember().WithName("RequestTimeOff");
        group.MapPost("/{timeOffId:guid}/cancel", CancelAsync).AllowAnyMember().WithName("CancelTimeOff");
        group.MapGet("/", ListPendingAsync).RequirePermission(Permission.ApproveRequests).WithName("ListTimeOffRequests");
        group.MapPost("/{timeOffId:guid}/accept", AcceptAsync).RequirePermission(Permission.ApproveRequests).WithName("AcceptTimeOff");
        group.MapPost("/{timeOffId:guid}/refuse", RefuseAsync).RequirePermission(Permission.ApproveRequests).WithName("RefuseTimeOff");
    }

    /// <summary>The person's request that is waiting, or their accepted time off that has not ended; none otherwise.</summary>
    private static async Task<Ok<MyTimeOff>> GetMineAsync(
        Guid workplaceId, HttpContext http, WorkplacesDb db, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var today = await TodayAsync(db, workplaceId, clock, cancellationToken);
        var open = await OpenOfAsync(db, member.MembershipId, today, cancellationToken);
        return TypedResults.Ok(new MyTimeOff(
            // Managers turn their own shifts off instead (Hoang, 2026-11-25).
            CanRequest: IsStaff(member) && member.WorksShifts && open is null,
            Current: open is null ? null : ToView(open, today)));
    }

    private static async Task<Results<Created<TimeOffView>, ProblemHttpResult>> RequestAsync(
        Guid workplaceId, TimeOffRequest request, HttpContext http, WorkplacesDb db, IWorkplaceDirectory directory,
        INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        if (!IsStaff(member))
        {
            return Problems.Forbidden(NotStaff);
        }
        var today = await TodayAsync(db, workplaceId, clock, cancellationToken);
        if (await OpenOfAsync(db, member.MembershipId, today, cancellationToken) is not null)
        {
            return Problems.Conflict(AlreadyOpen);
        }
        var first = LocalDate.FromDateOnly(request.FirstDay);
        LocalDate? last = request.LastDay is { } lastDay ? LocalDate.FromDateOnly(lastDay) : null;
        if (first < today)
        {
            return Problems.Validation(new FieldError(FirstDayPast, "firstDay"));
        }
        if (last is { } end && end < first)
        {
            return Problems.Validation(new FieldError(LastBeforeFirst, "lastDay"));
        }
        if (last is { } until && Period.DaysBetween(first, until) >= MaxDays)
        {
            return Problems.Validation(new FieldError(TooLong, "lastDay"));
        }
        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        if (reason is { Length: > TimeOff.ReasonMaxLength })
        {
            return Problems.Validation(new FieldError(ReasonTooLong, "reason"));
        }

        var timeOff = new TimeOff
        {
            Id = Guid.NewGuid(),
            WorkplaceId = workplaceId,
            MembershipId = member.MembershipId,
            FirstDay = first,
            LastDay = last,
            Reason = reason,
            Status = TimeOff.Pending,
            CreatedAt = clock.GetCurrentInstant(),
        };
        db.TimeOffs.Add(timeOff);
        await db.SaveChangesAsync(cancellationToken);

        var members = await directory.GetMembersAsync(workplaceId, cancellationToken);
        var parameters = Parameters(timeOff, members.SingleOrDefault(x => x.MembershipId == member.MembershipId)?.DisplayName);
        await notifier.NotifyAsync(
            members.Where(x => x.Can(Permission.ApproveRequests) && x.MembershipId != member.MembershipId)
                .Select(x => new NotificationRequest(workplaceId, x.MembershipId, x.UserId, NotificationTypes.TimeOffRequested, parameters))
                .ToList(),
            cancellationToken);
        return TypedResults.Created($"/api/workplaces/{workplaceId}/time-off/mine", ToView(timeOff, today));
    }

    /// <summary>The person takes back a request nobody has answered. An accepted one is ended by a manager.</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> CancelAsync(
        Guid workplaceId, Guid timeOffId, HttpContext http, WorkplacesDb db, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var timeOff = await db.TimeOffs.SingleOrDefaultAsync(
            x => x.Id == timeOffId && x.WorkplaceId == workplaceId && x.MembershipId == member.MembershipId, cancellationToken);
        if (timeOff is null)
        {
            return Problems.NotFound();
        }
        if (timeOff.Status != TimeOff.Pending)
        {
            return Problems.Conflict(NotPending);
        }
        timeOff.Status = TimeOff.Cancelled;
        timeOff.Reason = null;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>Requests waiting for an answer, oldest first, each with the shifts the person holds in those days.</summary>
    private static async Task<Ok<List<TimeOffRequestView>>> ListPendingAsync(
        Guid workplaceId, WorkplacesDb db, IWorkplaceDirectory directory, IScheduleLedger ledger, CancellationToken cancellationToken)
    {
        var pending = await db.TimeOffs.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && x.Status == TimeOff.Pending)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(cancellationToken);
        if (pending.Count == 0)
        {
            return TypedResults.Ok(new List<TimeOffRequestView>());
        }
        var members = (await directory.GetMembersAsync(workplaceId, cancellationToken)).ToDictionary(x => x.MembershipId);
        var upcoming = await ledger.GetUpcomingAsync(workplaceId, cancellationToken);
        return TypedResults.Ok(pending
            .Where(x => members.ContainsKey(x.MembershipId))
            .Select(x =>
            {
                var days = new DayRange(x.FirstDay, x.LastDay);
                return new TimeOffRequestView(
                    x.Id,
                    x.MembershipId,
                    members[x.MembershipId].DisplayName,
                    x.FirstDay.ToDateOnly(),
                    x.LastDay?.ToDateOnly(),
                    x.Reason,
                    upcoming.Count(shift => days.Contains(shift.Date) && shift.Holders.Any(h => h.MembershipId == x.MembershipId)));
            })
            .ToList());
    }

    /// <summary>
    /// Accepting takes the person off the shifts they hold on those days, in the published schedule and the draft,
    /// so the places open for the team (Hoang, 2026-11-25). Pending trades on those shifts are cancelled.
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> AcceptAsync(
        Guid workplaceId, Guid timeOffId, HttpContext http, WorkplacesDb db, IWorkplaceDirectory directory, INotifier notifier,
        IEnumerable<ITimeOffHandler> releasers, IEnumerable<IShiftsChangedHandler> changed, IClock clock, CancellationToken cancellationToken)
    {
        var timeOff = await DecideAsync(db, workplaceId, timeOffId, cancellationToken);
        if (timeOff is null)
        {
            return Problems.NotFound();
        }
        if (timeOff.Status != TimeOff.Pending)
        {
            return Problems.Conflict(NotPending);
        }
        timeOff.Status = TimeOff.Accepted;
        timeOff.DecidedAt = clock.GetCurrentInstant();
        timeOff.DecidedBy = http.Member().MembershipId;
        // Only for deciding: once decided, nobody needs it (data minimization, Law 25).
        timeOff.Reason = null;
        await db.SaveChangesAsync(cancellationToken);

        var days = new DayRange(timeOff.FirstDay, timeOff.LastDay);
        var released = new List<Guid>();
        foreach (var releaser in releasers)
        {
            released.AddRange(await releaser.ReleaseAsync(workplaceId, timeOff.MembershipId, days, cancellationToken));
        }
        if (released.Count > 0)
        {
            foreach (var handler in changed)
            {
                await handler.HandleAsync(workplaceId, released, cancellationToken);
            }
        }
        await TellAsync(directory, notifier, workplaceId, timeOff, NotificationTypes.TimeOffAccepted, cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> RefuseAsync(
        Guid workplaceId, Guid timeOffId, HttpContext http, WorkplacesDb db, IWorkplaceDirectory directory, INotifier notifier,
        IClock clock, CancellationToken cancellationToken)
    {
        var timeOff = await DecideAsync(db, workplaceId, timeOffId, cancellationToken);
        if (timeOff is null)
        {
            return Problems.NotFound();
        }
        if (timeOff.Status != TimeOff.Pending)
        {
            return Problems.Conflict(NotPending);
        }
        timeOff.Status = TimeOff.Refused;
        timeOff.DecidedAt = clock.GetCurrentInstant();
        timeOff.DecidedBy = http.Member().MembershipId;
        timeOff.Reason = null;
        await db.SaveChangesAsync(cancellationToken);
        await TellAsync(directory, notifier, workplaceId, timeOff, NotificationTypes.TimeOffRefused, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// A manager turned the person's shifts back on during their time off: it ends today, for good (Hoang,
    /// 2026-11-25). Called by "Update member". True when there was one to end.
    /// </summary>
    internal static async Task<bool> EndEarlyAsync(
        WorkplacesDb db, IWorkplaceDirectory directory, INotifier notifier, Guid workplaceId, Guid membershipId, IClock clock,
        CancellationToken cancellationToken)
    {
        var today = await TodayAsync(db, workplaceId, clock, cancellationToken);
        var active = (await db.TimeOffs.Where(x => x.MembershipId == membershipId && x.Status == TimeOff.Accepted).ToListAsync(cancellationToken))
            .Where(x => x.Days() is { } days && days.Contains(today))
            .ToList();
        if (active.Count == 0)
        {
            return false;
        }
        active.ForEach(x => x.EndedOn = today);
        await db.SaveChangesAsync(cancellationToken);
        foreach (var timeOff in active)
        {
            await TellAsync(directory, notifier, workplaceId, timeOff, NotificationTypes.TimeOffEnded, cancellationToken);
        }
        return true;
    }

    /// <summary>Accepted time off of these people that has not ended yet, by membership (for the directory and the team page).</summary>
    internal static async Task<Dictionary<Guid, List<DayRange>>> CoveringAsync(
        WorkplacesDb db, Guid workplaceId, LocalDate today, CancellationToken cancellationToken)
    {
        var accepted = await db.TimeOffs.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && x.Status == TimeOff.Accepted && (x.LastDay == null || x.LastDay >= today))
            .ToListAsync(cancellationToken);
        return accepted
            .Where(x => x.StillCovers(today))
            .GroupBy(x => x.MembershipId)
            .ToDictionary(x => x.Key, x => x.Select(timeOff => timeOff.Days()!).OrderBy(range => range.First).ToList());
    }

    internal static async Task<LocalDate> TodayAsync(WorkplacesDb db, Guid workplaceId, IClock clock, CancellationToken cancellationToken)
    {
        var zone = await db.Workplaces.Where(x => x.Id == workplaceId).Select(x => x.TimeZone).SingleAsync(cancellationToken);
        return clock.GetCurrentInstant().InZone(DateTimeZoneProviders.Tzdb[zone]).Date;
    }

    /// <summary>Only staff ask (Hoang, 2026-11-25): someone who can decide requests is a manager.</summary>
    private static bool IsStaff(MemberAccess member) => member.Role == Roles.Employee && !member.Can(Permission.ApproveRequests);

    private static async Task<TimeOff?> OpenOfAsync(WorkplacesDb db, Guid membershipId, LocalDate today, CancellationToken cancellationToken)
    {
        var candidates = await db.TimeOffs
            .Where(x => x.MembershipId == membershipId && (x.Status == TimeOff.Pending || x.Status == TimeOff.Accepted))
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);
        return candidates.FirstOrDefault(x => x.Status == TimeOff.Pending || x.StillCovers(today));
    }

    private static Task<TimeOff?> DecideAsync(WorkplacesDb db, Guid workplaceId, Guid timeOffId, CancellationToken cancellationToken) =>
        db.TimeOffs.SingleOrDefaultAsync(x => x.Id == timeOffId && x.WorkplaceId == workplaceId, cancellationToken);

    private static TimeOffView ToView(TimeOff timeOff, LocalDate today) =>
        new(
            timeOff.Id,
            timeOff.FirstDay.ToDateOnly(),
            (timeOff.Days()?.Last ?? timeOff.LastDay)?.ToDateOnly(),
            timeOff.Status,
            timeOff.Days() is { } days && days.Contains(today));

    private static async Task TellAsync(
        IWorkplaceDirectory directory, INotifier notifier, Guid workplaceId, TimeOff timeOff, string type, CancellationToken cancellationToken)
    {
        var person = (await directory.GetMembersAsync(workplaceId, cancellationToken)).SingleOrDefault(x => x.MembershipId == timeOff.MembershipId);
        if (person is null)
        {
            return;
        }
        await notifier.NotifyAsync(
            [new NotificationRequest(workplaceId, person.MembershipId, person.UserId, type, Parameters(timeOff, person.DisplayName))],
            cancellationToken);
    }

    private static Dictionary<string, string> Parameters(TimeOff timeOff, string? name) =>
        new()
        {
            ["name"] = name ?? string.Empty,
            ["firstDay"] = LocalDatePattern.Iso.Format(timeOff.FirstDay),
            ["lastDay"] = timeOff.LastDay is { } last ? LocalDatePattern.Iso.Format(last) : string.Empty,
        };
}

/// <param name="LastDay">Null: "undetermined", off until a manager turns their shifts back on.</param>
/// <param name="Reason">Optional; only managers see it, and only until they decide.</param>
public sealed record TimeOffRequest(DateOnly FirstDay, DateOnly? LastDay, string? Reason);

/// <param name="CanRequest">Staff who work shifts and have no request open (Home shows the button).</param>
public sealed record MyTimeOff(bool CanRequest, TimeOffView? Current);

/// <param name="Status">"pending" or "accepted".</param>
/// <param name="Now">Accepted and today is one of its days.</param>
public sealed record TimeOffView(Guid Id, DateOnly FirstDay, DateOnly? LastDay, string Status, bool Now);

/// <param name="ShiftsInDays">Published shifts the person holds on those days, which accepting opens to the team.</param>
public sealed record TimeOffRequestView(
    Guid Id, Guid MembershipId, string Name, DateOnly FirstDay, DateOnly? LastDay, string? Reason, int ShiftsInDays);
