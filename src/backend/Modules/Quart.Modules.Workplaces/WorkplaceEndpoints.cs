using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Workplaces.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Notifications;
using Quart.SharedKernel.Scheduling;

namespace Quart.Modules.Workplaces;

/// <summary>Workplaces, the owner invitation, joining with a code, and the members list (M2-09 to M2-12, M2-15, M2-18).</summary>
internal static class WorkplaceEndpoints
{
    public const string JoinCodeUnknown = "workplace.join_code_unknown";
    public const string AlreadyMember = "workplace.already_member";
    public const string InvitationInvalid = "workplace.invitation_invalid";
    public const string TimeZoneUnknown = "workplace.time_zone_unknown";
    public const string NameRequired = "workplace.name_required";
    public const string LevelInvalid = "workplace.level_invalid";
    public const string HoursInvalid = "workplace.hours_invalid";
    public const string OwnerCannotLeave = "workplace.owner_cannot_leave";
    public const string HasUpcomingShifts = "workplace.has_upcoming_shifts";

    // No 0 or O, no 1, I or L: nobody has to ask "is that a zero?" (FR-033).
    public const string JoinCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    public const int JoinCodeLength = 10;

    private static readonly Duration InvitationLifetime = Duration.FromDays(7);

    public static void MapWorkplaces(this IEndpointRouteBuilder endpoints)
    {
        var root = endpoints.MapGroup("/api/workplaces");
        root.MapGet("/", ListMineAsync).RequireUser().WithName("ListMyWorkplaces");
        root.MapPost("/", CreateAsync).RequireUser().WithName("CreateWorkplace");
        root.MapPost("/owner-invitations/accept", AcceptInvitationAsync).RequireUser().WithName("AcceptOwnerInvitation");
        root.MapPost("/join", JoinAsync).RequireUser().RequireRateLimiting(WorkplacesModule.JoinRateLimitPolicy).WithName("JoinWorkplace");

        var one = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}");
        one.MapGet("/", GetAsync).AllowAnyMember().WithName("GetWorkplace");
        one.MapPatch("/settings", UpdateSettingsAsync).RequirePermission(Permission.ManageWorkplace).WithName("UpdateWorkplaceSettings");
        one.MapPost("/join-code/regenerate", RegenerateJoinCodeAsync).RequirePermission(Permission.ManageWorkplace).RequireRecentConfirmation().WithName("RegenerateJoinCode");
        one.MapGet("/members", ListMembersAsync).AllowAnyMember().WithName("ListMembers");
        one.MapPatch("/members/{membershipId:guid}", UpdateMemberAsync).RequirePermission(Permission.ManageLevels).WithName("UpdateMember");
        one.MapDelete("/members/{membershipId:guid}", RemoveMemberAsync).RequirePermission(Permission.ManageMembers).WithName("RemoveMember");
        one.MapPost("/leave", LeaveAsync).AllowAnyMember().WithName("LeaveWorkplace");
    }

    public static string NewJoinCode() =>
        string.Create(JoinCodeLength, 0, (span, _) =>
        {
            for (var i = 0; i < span.Length; i++)
            {
                span[i] = JoinCodeAlphabet[RandomNumberGenerator.GetInt32(JoinCodeAlphabet.Length)];
            }
        });

    private static async Task<Ok<List<MyWorkplace>>> ListMineAsync(HttpContext http, WorkplacesDb db, CancellationToken cancellationToken)
    {
        var userId = http.CurrentUserId();
        var mine = await db.Memberships.AsNoTracking()
            .Where(x => x.UserId == userId && x.LeftAt == null)
            .Join(db.Workplaces.AsNoTracking(), m => m.WorkplaceId, w => w.Id, (m, w) => new MyWorkplace(w.Id, w.Name, m.Role))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(mine.OrderBy(x => x.Name, StringComparer.CurrentCultureIgnoreCase).ToList());
    }

    /// <summary>
    /// Only the platform admin creates workplaces (FR-032). The answer carries the single-use owner
    /// invitation; the platform admin never becomes a member (FR-042, decision 0008).
    /// </summary>
    private static async Task<Results<Ok<CreatedWorkplace>, ProblemHttpResult>> CreateAsync(
        CreateWorkplaceRequest request, HttpContext http, WorkplacesDb db, IUserDirectory users, IClock clock, CancellationToken cancellationToken)
    {
        if (!await users.IsPlatformAdminAsync(http.CurrentUserId(), cancellationToken))
        {
            return Problems.Forbidden();
        }
        var name = (request.Name ?? string.Empty).Trim();
        var timeZone = string.IsNullOrWhiteSpace(request.TimeZone) ? "America/Toronto" : request.TimeZone.Trim();
        if (name.Length is 0 or > 100)
        {
            return Problems.Validation(new FieldError(NameRequired, "name"));
        }
        if (DateTimeZoneProviders.Tzdb.GetZoneOrNull(timeZone) is null)
        {
            return Problems.Validation(new FieldError(TimeZoneUnknown, "timeZone"));
        }

        var now = clock.GetCurrentInstant();
        var workplace = new Workplace
        {
            Id = Guid.NewGuid(),
            Name = name,
            Address = (request.Address ?? string.Empty).Trim(),
            TimeZone = timeZone,
            JoinCode = NewJoinCode(),
            Settings = WorkplaceReader.WriteSettings(new WorkplaceSettings()),
            CreatedAt = now,
        };
        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        db.Workplaces.Add(workplace);
        db.OwnerInvitations.Add(new OwnerInvitation { Id = Guid.NewGuid(), WorkplaceId = workplace.Id, TokenHash = Hash(token), ExpiresAt = now + InvitationLifetime });
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new CreatedWorkplace(workplace.Id, token));
    }

    private static async Task<Results<Ok<JoinedWorkplace>, ProblemHttpResult>> AcceptInvitationAsync(
        AcceptInvitationRequest request, HttpContext http, WorkplacesDb db, IClock clock, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var hash = Hash(request.Token ?? string.Empty);
        var invitation = await db.OwnerInvitations.SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
        if (invitation is null || invitation.AcceptedAt is not null || invitation.ExpiresAt <= now)
        {
            return Problems.Validation(new FieldError(InvitationInvalid, "token"));
        }

        invitation.AcceptedAt = now;
        db.Memberships.Add(new Membership
        {
            Id = Guid.NewGuid(),
            WorkplaceId = invitation.WorkplaceId,
            UserId = http.CurrentUserId(),
            Role = Roles.Owner,
            Level = 3,
            WorksShifts = false,
            JoinedAt = now,
        });
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new JoinedWorkplace(invitation.WorkplaceId));
    }

    /// <summary>Joining is instant (FR-034). Codes match whatever the case (FR-033).</summary>
    private static async Task<Results<Ok<JoinedWorkplace>, ProblemHttpResult>> JoinAsync(
        JoinRequest request, HttpContext http, WorkplacesDb db, IWorkplaceDirectory directory, IUserDirectory users, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var code = (request.Code ?? string.Empty).Trim().ToUpperInvariant();
        var workplace = await db.Workplaces.AsNoTracking().SingleOrDefaultAsync(x => x.JoinCode == code, cancellationToken);
        if (workplace is null)
        {
            return Problems.Validation(new FieldError(JoinCodeUnknown, "code"));
        }
        var userId = http.CurrentUserId();
        if (await db.Memberships.AnyAsync(x => x.WorkplaceId == workplace.Id && x.UserId == userId && x.LeftAt == null, cancellationToken))
        {
            return Problems.Conflict(AlreadyMember);
        }

        db.Memberships.Add(new Membership
        {
            Id = Guid.NewGuid(),
            WorkplaceId = workplace.Id,
            UserId = userId,
            Role = Roles.Employee,
            Level = 1,
            WorksShifts = true,
            DesiredWeeklyHours = 20,
            JoinedAt = clock.GetCurrentInstant(),
        });
        await db.SaveChangesAsync(cancellationToken);

        var name = (await users.GetAsync([userId], cancellationToken)).GetValueOrDefault(userId)?.DisplayName ?? string.Empty;
        await NotifyManagersAsync(directory, notifier, workplace.Id, NotificationTypes.MemberJoined, name, cancellationToken);
        return TypedResults.Ok(new JoinedWorkplace(workplace.Id));
    }

    private static async Task<Results<Ok<WorkplaceView>, ProblemHttpResult>> GetAsync(Guid workplaceId, HttpContext http, WorkplacesDb db, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var workplace = await db.Workplaces.AsNoTracking().SingleOrDefaultAsync(x => x.Id == workplaceId, cancellationToken);
        if (workplace is null)
        {
            return Problems.NotFound();
        }
        var membership = await db.Memberships.AsNoTracking().SingleAsync(x => x.Id == member.MembershipId, cancellationToken);
        var settings = WorkplaceReader.ReadSettings(workplace);
        var count = await db.Memberships.CountAsync(x => x.WorkplaceId == workplaceId && x.LeftAt == null, cancellationToken);
        return TypedResults.Ok(new WorkplaceView(
            workplace.Id,
            workplace.Name,
            workplace.Address,
            workplace.TimeZone,
            count,
            // The code lets anyone in, so only the people who manage the workplace see it.
            member.Can(Permission.ManageWorkplace) ? workplace.JoinCode : null,
            settings.ClaimsNeedApproval,
            settings.TradesNeedApproval,
            new MyMembership(
                // 3.1 (2026-11-18): levels are for the people who manage them, not even the person's own.
                membership.Id, membership.Role, member.Can(Permission.ManageLevels) ? membership.Level : null, membership.WorksShifts, membership.MaxWeeklyHours,
                member.Permissions.Select(x => x.ToString()).Order(StringComparer.Ordinal).ToList())));
    }

    private static async Task<NoContent> UpdateSettingsAsync(Guid workplaceId, UpdateSettingsRequest request, WorkplacesDb db, CancellationToken cancellationToken)
    {
        var workplace = await db.Workplaces.SingleAsync(x => x.Id == workplaceId, cancellationToken);
        var settings = WorkplaceReader.ReadSettings(workplace);
        settings.ClaimsNeedApproval = request.ClaimsNeedApproval ?? settings.ClaimsNeedApproval;
        settings.TradesNeedApproval = request.TradesNeedApproval ?? settings.TradesNeedApproval;
        workplace.Settings = WorkplaceReader.WriteSettings(settings);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>The old code stops working at once (FR-033).</summary>
    private static async Task<Ok<JoinCodeView>> RegenerateJoinCodeAsync(Guid workplaceId, WorkplacesDb db, CancellationToken cancellationToken)
    {
        var workplace = await db.Workplaces.SingleAsync(x => x.Id == workplaceId, cancellationToken);
        workplace.JoinCode = NewJoinCode();
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(new JoinCodeView(workplace.JoinCode));
    }

    /// <summary>
    /// Coworkers see a name, role, level and contact email, nothing else (FR-040). Hours and "works shifts"
    /// are filled in only for people who manage levels, and for the caller's own row.
    /// </summary>
    private static async Task<Ok<List<MemberView>>> ListMembersAsync(
        Guid workplaceId, HttpContext http, WorkplacesDb db, IUserDirectory users, IClock clock, CancellationToken cancellationToken)
    {
        var today = await TimeOffEndpoints.TodayAsync(db, workplaceId, clock, cancellationToken);
        var timeOff = await TimeOffEndpoints.CoveringAsync(db, workplaceId, today, cancellationToken);
        var member = http.Member();
        var memberships = await db.Memberships.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && x.LeftAt == null)
            .ToListAsync(cancellationToken);
        var names = await users.GetAsync(memberships.Select(x => x.UserId).ToList(), cancellationToken);
        var manages = member.Can(Permission.ManageLevels);
        var views = memberships
            .Where(x => names.ContainsKey(x.UserId))
            .Select(x =>
            {
                var detailed = manages || x.Id == member.MembershipId;
                // BL-01: the time off that has not ended, for the people who see "works shifts". During it, the
                // switch reads off; the day after, it is back on by itself.
                var range = detailed ? timeOff.GetValueOrDefault(x.Id)?.FirstOrDefault() : null;
                var off = range is not null && range.Contains(today);
                return new MemberView(
                    x.Id,
                    names[x.UserId].DisplayName,
                    names[x.UserId].Email,
                    x.Role,
                    manages ? x.Level : null,
                    x.Id == member.MembershipId,
                    detailed ? x.WorksShifts && !off : null,
                    detailed ? x.MaxWeeklyHours : null,
                    names[x.UserId].Shared?.Instagram,
                    names[x.UserId].Shared?.Facebook,
                    range is null ? null : new MemberTimeOff(range.First.ToDateOnly(), range.Last?.ToDateOnly(), off));
            })
            .OrderBy(x => x.Role == Roles.Employee).ThenBy(x => x.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
        return TypedResults.Ok(views);
    }

    /// <summary>
    /// Levels, "works shifts" and the maximum are set only by people who manage levels (5.4). The hours a person
    /// wants come with their availability, one number per period, and nobody else changes them (BR-032).
    /// "Works shifts" cannot be turned off while the person still holds a shift that has not started, since
    /// they would vanish from the draft tools but stay on the shift (D1).
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> UpdateMemberAsync(
        Guid workplaceId, Guid membershipId, UpdateMemberRequest request, WorkplacesDb db, IScheduleLedger ledger,
        IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var membership = await db.Memberships.SingleOrDefaultAsync(x => x.Id == membershipId && x.WorkplaceId == workplaceId && x.LeftAt == null, cancellationToken);
        if (membership is null)
        {
            return Problems.NotFound();
        }
        // BL-01 (Hoang, 2026-11-25): during a time off the switch reads off. Turning it on ends the time off; leaving
        // it off (the sheet saved for something else) changes nothing.
        var today = await TimeOffEndpoints.TodayAsync(db, workplaceId, clock, cancellationToken);
        var onTimeOff = (await TimeOffEndpoints.CoveringAsync(db, workplaceId, today, cancellationToken))
            .GetValueOrDefault(membershipId)?.Any(range => range.Contains(today)) ?? false;
        if (onTimeOff)
        {
            if (request.WorksShifts == true)
            {
                await TimeOffEndpoints.EndEarlyAsync(db, directory, notifier, workplaceId, membershipId, clock, cancellationToken);
            }
            request = request with { WorksShifts = null };
        }
        if (membership.WorksShifts && request.WorksShifts == false
            && await ledger.HasUpcomingAsync(workplaceId, membershipId, cancellationToken))
        {
            return Problems.Conflict(HasUpcomingShifts);
        }
        if (request.Level is { } level)
        {
            if (level is < 1 or > 3)
            {
                return Problems.Validation(new FieldError(LevelInvalid, "level"));
            }
            membership.Level = level;
        }
        if (request.MaxWeeklyHours is { } max)
        {
            if (max is < 0 or > 80)
            {
                return Problems.Validation(new FieldError(HoursInvalid, "maxWeeklyHours"));
            }
            membership.MaxWeeklyHours = max;
        }
        if (request.ClearMaxWeeklyHours == true)
        {
            membership.MaxWeeklyHours = null;
        }
        membership.WorksShifts = request.WorksShifts ?? membership.WorksShifts;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static Task<Results<NoContent, ProblemHttpResult>> RemoveMemberAsync(
        Guid workplaceId, Guid membershipId, WorkplacesDb db, IWorkplaceDirectory directory, IUserDirectory users, INotifier notifier,
        IEnumerable<IMemberLeftHandler> handlers, IClock clock, CancellationToken cancellationToken) =>
        EndMembershipAsync(workplaceId, membershipId, db, directory, users, notifier, handlers, clock, cancellationToken);

    private static Task<Results<NoContent, ProblemHttpResult>> LeaveAsync(
        Guid workplaceId, HttpContext http, WorkplacesDb db, IWorkplaceDirectory directory, IUserDirectory users, INotifier notifier,
        IEnumerable<IMemberLeftHandler> handlers, IClock clock, CancellationToken cancellationToken) =>
        EndMembershipAsync(workplaceId, http.Member().MembershipId, db, directory, users, notifier, handlers, clock, cancellationToken);

    /// <summary>Access ends on the next request; future shifts are released by the handlers (FR-038).</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> EndMembershipAsync(
        Guid workplaceId, Guid membershipId, WorkplacesDb db, IWorkplaceDirectory directory, IUserDirectory users, INotifier notifier,
        IEnumerable<IMemberLeftHandler> handlers, IClock clock, CancellationToken cancellationToken)
    {
        var membership = await db.Memberships.SingleOrDefaultAsync(x => x.Id == membershipId && x.WorkplaceId == workplaceId && x.LeftAt == null, cancellationToken);
        if (membership is null)
        {
            return Problems.NotFound();
        }
        if (membership.Role == Roles.Owner)
        {
            return Problems.Conflict(OwnerCannotLeave);
        }

        await EndAsync(membership, db, directory, users, notifier, handlers, clock, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// Ends one membership: access stops, the other modules release what the person held (FR-038), and the
    /// managers are told. Leaving, being removed and deleting one's account (FR-009) all go through here.
    /// </summary>
    /// <param name="notification">What the managers are told: "left", or "deleted their account" (FR-009).</param>
    internal static async Task EndAsync(
        Membership membership, WorkplacesDb db, IWorkplaceDirectory directory, IUserDirectory users, INotifier notifier,
        IEnumerable<IMemberLeftHandler> handlers, IClock clock, CancellationToken cancellationToken,
        string notification = NotificationTypes.MemberLeft)
    {
        membership.LeftAt = clock.GetCurrentInstant();
        await db.SaveChangesAsync(cancellationToken);
        // Their time off, reasons included, means nothing once they are gone (BL-01).
        await db.TimeOffs.Where(x => x.MembershipId == membership.Id).ExecuteDeleteAsync(cancellationToken);
        foreach (var handler in handlers)
        {
            await handler.HandleAsync(membership.WorkplaceId, membership.Id, cancellationToken);
        }

        var name = (await users.GetAsync([membership.UserId], cancellationToken)).GetValueOrDefault(membership.UserId)?.DisplayName ?? string.Empty;
        await NotifyManagersAsync(directory, notifier, membership.WorkplaceId, notification, name, cancellationToken);
    }

    private static async Task NotifyManagersAsync(
        IWorkplaceDirectory directory, INotifier notifier, Guid workplaceId, string type, string name, CancellationToken cancellationToken)
    {
        var managers = (await directory.GetMembersAsync(workplaceId, cancellationToken)).Where(x => x.Can(Permission.ManageMembers));
        await notifier.NotifyAsync(
            managers.Select(x => new NotificationRequest(workplaceId, x.MembershipId, x.UserId, type, new Dictionary<string, string> { ["name"] = name })).ToList(),
            cancellationToken);
    }

    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

public sealed record MyWorkplace(Guid WorkplaceId, string Name, string Role);

public sealed record CreateWorkplaceRequest(string? Name, string? Address, string? TimeZone);

/// <param name="InvitationToken">Shown once: the link that makes its first user the owner (FR-042).</param>
public sealed record CreatedWorkplace(Guid WorkplaceId, string InvitationToken);

public sealed record AcceptInvitationRequest(string? Token);

public sealed record JoinRequest(string? Code);

public sealed record JoinedWorkplace(Guid WorkplaceId);

public sealed record JoinCodeView(string JoinCode);

public sealed record UpdateSettingsRequest(bool? ClaimsNeedApproval, bool? TradesNeedApproval);

/// <param name="JoinCode">Null unless the caller manages the workplace.</param>
public sealed record WorkplaceView(
    Guid Id,
    string Name,
    string Address,
    string TimeZone,
    int MemberCount,
    string? JoinCode,
    bool ClaimsNeedApproval,
    bool TradesNeedApproval,
    MyMembership Me);

/// <param name="Level">Null unless the caller manages levels: workers never see levels, not even their own.</param>
public sealed record MyMembership(
    Guid MembershipId,
    string Role,
    int? Level,
    bool WorksShifts,
    decimal? MaxWeeklyHours,
    IReadOnlyList<string> Permissions);

/// <param name="Level">Null unless the caller manages levels (3.1, 2026-11-18).</param>
/// <param name="WorksShifts">Null when the caller may not see it (FR-040).</param>
/// <param name="Instagram">The handle that person added, if any (FR-040, M2-18).</param>
public sealed record MemberView(
    Guid MembershipId,
    string DisplayName,
    string Email,
    string Role,
    int? Level,
    bool IsMe,
    bool? WorksShifts,
    decimal? MaxWeeklyHours,
    string? Instagram,
    string? Facebook,
    MemberTimeOff? TimeOff = null);

/// <summary>Accepted time off that has not ended (BL-01). <paramref name="Now"/>: today is one of its days.</summary>
public sealed record MemberTimeOff(DateOnly FirstDay, DateOnly? LastDay, bool Now);

public sealed record UpdateMemberRequest(int? Level, bool? WorksShifts, decimal? MaxWeeklyHours, bool? ClearMaxWeeklyHours);
