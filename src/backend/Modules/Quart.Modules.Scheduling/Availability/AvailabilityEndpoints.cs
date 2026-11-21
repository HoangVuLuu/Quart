using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Scheduling.Drafts;
using Quart.Modules.Scheduling.Periods;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Scheduling.Availability;

using Availability = Persistence.Availability;
using Period = Persistence.Period;

/// <summary>
/// Availability (M4): people tap the shifts they can work and send; admins watch progress, read the notes,
/// (reopening one person after the lock was removed on 2026-11-21: leaving Building Schedule unlocks everyone).
/// </summary>
internal static class AvailabilityEndpoints
{
    public const string Locked = "availability.locked";
    public const string NotShiftWorker = "availability.not_shift_worker";
    public const string UnknownShift = "availability.unknown_shift";
    public const string NoteEmpty = "availability.note_empty";
    public const string NoteTooLong = "availability.note_too_long";
    public const string TooManyNotes = "availability.too_many_notes";
    public const string HoursRequired = "availability.hours_required";
    public const string HoursInvalid = "availability.hours_invalid";

    /// <summary>A week has 168 hours; anything from 0 up to that is accepted, with no warning (BR-032).</summary>
    private const decimal MaxHours = 168;

    public static void MapAvailability(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/periods/{periodId:guid}/availability");
        group.MapGet("/me", GetMineAsync).AllowAnyMember().WithName("GetMyAvailability");
        group.MapPut("/me", SaveMineAsync).AllowAnyMember().WithName("SaveMyAvailability");
        group.MapPost("/me/send", SendMineAsync).AllowAnyMember().WithName("SendMyAvailability");
        group.MapPost("/me/notes", AddNoteAsync).AllowAnyMember().WithName("AddAvailabilityNote");
        group.MapGet("/me/previous", GetPreviousAsync).AllowAnyMember().WithName("GetPreviousAvailability");
        group.MapGet("/", GetTeamAsync).RequirePermission(Permission.ManageSchedule).WithName("GetTeamAvailability");
        group.MapGet("/{membershipId:guid}", GetPersonAsync).RequirePermission(Permission.ManageSchedule).WithName("GetPersonAvailability");
        group.MapPost("/remind", RemindAsync).RequirePermission(Permission.ManageSchedule).WithName("RemindAvailability");
    }

    private static async Task<Results<Ok<MyAvailability>, ProblemHttpResult>> GetMineAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        if (await FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        await SettleVisitAsync(db, period, clock, cancellationToken);
        if (!member.WorksShifts)
        {
            return Problems.Forbidden(NotShiftWorker);
        }
        return TypedResults.Ok(await ViewMineAsync(db, period, member, cancellationToken));
    }

    /// <summary>Saves the taps as a draft: nothing is sent to the admin yet (M4-02).</summary>
    private static Task<Results<Ok<MyAvailability>, ProblemHttpResult>> SaveMineAsync(
        Guid workplaceId, Guid periodId, AvailabilityRequest request, HttpContext http, SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken) =>
        WriteMineAsync(workplaceId, periodId, request, send: false, http, db, directory, notifier, clock, cancellationToken);

    /// <summary>Sends the answer. Sending again replaces it, until the period locks (FR-098).</summary>
    private static Task<Results<Ok<MyAvailability>, ProblemHttpResult>> SendMineAsync(
        Guid workplaceId, Guid periodId, AvailabilityRequest request, HttpContext http, SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken) =>
        WriteMineAsync(workplaceId, periodId, request, send: true, http, db, directory, notifier, clock, cancellationToken);

    private static async Task<Results<Ok<MyAvailability>, ProblemHttpResult>> WriteMineAsync(
        Guid workplaceId, Guid periodId, AvailabilityRequest request, bool send, HttpContext http, SchedulingDb db,
        IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        if (await FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (!member.WorksShifts)
        {
            return Problems.Forbidden(NotShiftWorker);
        }

        await SettleVisitAsync(db, period, clock, cancellationToken);
        var availability = await GetOrAddAsync(db, periodId, member.MembershipId, cancellationToken);
        // FR-100: read-only while the manager builds, and for good once published.
        if (period.LockedAt is not null)
        {
            return Problems.Conflict(Locked);
        }

        if (request.DesiredWeeklyHours is < 0 or > MaxHours)
        {
            return Problems.Validation(new FieldError(HoursInvalid, "desiredWeeklyHours"));
        }
        // BR-032: one number per period, needed to send. Saving a draft may leave it empty.
        if (send && (request.DesiredWeeklyHours ?? availability.DesiredWeeklyHours) is null)
        {
            return Problems.Validation(new FieldError(HoursRequired, "desiredWeeklyHours"));
        }

        var wanted = (request.ShiftIds ?? []).Distinct().ToList();
        var known = await db.Shifts.Where(x => x.PeriodId == periodId && wanted.Contains(x.Id)).Select(x => x.Id).ToListAsync(cancellationToken);
        if (known.Count != wanted.Count)
        {
            return Problems.Validation(new FieldError(UnknownShift, "shiftIds"));
        }

        availability.Blocks.RemoveAll(x => !wanted.Contains(x.ShiftId));
        var had = availability.Blocks.Select(x => x.ShiftId).ToHashSet();
        availability.Blocks.AddRange(wanted.Where(id => !had.Contains(id)).Select(id => new AvailabilityBlock { AvailabilityId = availability.Id, ShiftId = id }));
        if (request.DesiredWeeklyHours is { } hours)
        {
            availability.DesiredWeeklyHours = hours;
        }
        if (send)
        {
            availability.Status = Availability.Sent;
            availability.SubmittedAt = clock.GetCurrentInstant();
        }
        await db.SaveChangesAsync(cancellationToken);

        if (send)
        {
            await NotifyAdminsAsync(directory, notifier, workplaceId, member.MembershipId, NotificationTypes.AvailabilitySent, period, cancellationToken);
        }
        return TypedResults.Ok(await ViewMineAsync(db, period, member, cancellationToken));
    }

    /// <summary>
    /// A note for the admins. Allowed after the lock, and never changes the availability itself (FR-103).
    /// The notification says a note was added, never what it says (FR-216).
    /// </summary>
    private static async Task<Results<Ok<MyAvailability>, ProblemHttpResult>> AddNoteAsync(
        Guid workplaceId, Guid periodId, NoteRequest request, HttpContext http, SchedulingDb db,
        IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        if (await FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (!member.WorksShifts)
        {
            return Problems.Forbidden(NotShiftWorker);
        }
        var body = (request.Body ?? string.Empty).Trim();
        if (body.Length == 0)
        {
            return Problems.Validation(new FieldError(NoteEmpty, "body"));
        }
        if (body.Length > AvailabilityNote.MaxLength)
        {
            return Problems.Validation(new FieldError(NoteTooLong, "body"));
        }

        var availability = await GetOrAddAsync(db, periodId, member.MembershipId, cancellationToken);
        if (availability.Notes.Count >= AvailabilityNote.MaxPerPeriod)
        {
            return Problems.Conflict(TooManyNotes);
        }
        // Added through the set, not the collection: a new row with its key already set would otherwise be
        // taken for an existing one and updated instead of inserted.
        db.AvailabilityNotes.Add(new AvailabilityNote { Id = Guid.NewGuid(), AvailabilityId = availability.Id, Body = body, CreatedAt = clock.GetCurrentInstant() });
        await db.SaveChangesAsync(cancellationToken);

        await NotifyAdminsAsync(directory, notifier, workplaceId, member.MembershipId, NotificationTypes.AvailabilityNoteAdded, period, cancellationToken);
        return TypedResults.Ok(await ViewMineAsync(db, period, member, cancellationToken));
    }

    /// <summary>
    /// "Same as last period" (FR-095): the caller's previous answers mapped onto this period by week, weekday
    /// and shift block. Only a suggestion; the person reviews it and sends it themselves.
    /// </summary>
    private static async Task<Results<Ok<SuggestedAvailability>, ProblemHttpResult>> GetPreviousAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, CancellationToken cancellationToken)
    {
        var member = http.Member();
        if (await FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var previous = await db.Periods.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && x.StartDate < period.StartDate)
            .OrderByDescending(x => x.StartDate)
            .FirstOrDefaultAsync(cancellationToken);
        if (previous is null)
        {
            return TypedResults.Ok(new SuggestedAvailability([]));
        }

        var earlier = await db.AvailabilityBlocks.AsNoTracking()
            .Where(x => db.Availabilities.Any(a => a.Id == x.AvailabilityId && a.PeriodId == previous.Id && a.MembershipId == member.MembershipId))
            .Join(db.Shifts.AsNoTracking(), block => block.ShiftId, shift => shift.Id, (block, shift) => shift)
            .ToListAsync(cancellationToken);
        // Week 1 Monday closing maps to week 1 Monday closing; a shorter earlier period repeats.
        var pattern = earlier
            .Select(x => (Week: NodaTime.Period.DaysBetween(previous.StartDate, x.Date) / 7, x.Date.DayOfWeek, x.SourceBlockId))
            .ToHashSet();
        var shifts = await db.Shifts.AsNoTracking().Where(x => x.PeriodId == periodId).ToListAsync(cancellationToken);
        var suggested = shifts
            .Where(x => pattern.Contains(((NodaTime.Period.DaysBetween(period.StartDate, x.Date) / 7) % previous.Weeks, x.Date.DayOfWeek, x.SourceBlockId)))
            .Select(x => x.Id)
            .ToList();
        return TypedResults.Ok(new SuggestedAvailability(suggested));
    }

    /// <summary>Who has answered, what they offered, and their notes, at a glance (M4-04).</summary>
    private static async Task<Results<Ok<TeamAvailability>, ProblemHttpResult>> GetTeamAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, IWorkplaceDirectory directory, CancellationToken cancellationToken)
    {
        var member = http.Member();
        if (await FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var people = (await directory.GetMembersAsync(workplaceId, cancellationToken)).Where(x => x.WorksShifts).ToList();
        var answers = await db.Availabilities.AsNoTracking()
            .Include(x => x.Blocks)
            .Include(x => x.Notes)
            .Where(x => x.PeriodId == periodId)
            .ToDictionaryAsync(x => x.MembershipId, cancellationToken);
        var shifts = await db.Shifts.AsNoTracking().Where(x => x.PeriodId == periodId).ToDictionaryAsync(x => x.Id, cancellationToken);
        // FR-103: notes go only to people who may read them, never to anyone else who can open this screen.
        var mayReadNotes = member.Can(Permission.ViewAvailabilityComments);

        var rows = people
            .Select(person =>
            {
                var answer = answers.GetValueOrDefault(person.MembershipId);
                var sent = answer?.Status == Availability.Sent;
                return new TeamAvailabilityRow(
                    person.MembershipId,
                    person.DisplayName,
                    person.Level,
                    sent ? Availability.Sent : Availability.NotSent,
                    sent ? answer!.Blocks.Sum(block => shifts.TryGetValue(block.ShiftId, out var shift) ? shift.Hours : 0) / period.Weeks : 0,
                    sent ? answer!.DesiredWeeklyHours : null,
                    mayReadNotes
                        ? (answer?.Notes ?? []).OrderBy(x => x.CreatedAt).Select(x => new AvailabilityNoteView(x.Id, x.Body, x.CreatedAt.ToDateTimeOffset())).ToList()
                        : []);
            })
            .OrderBy(x => x.Status == Availability.Sent).ThenBy(x => x.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
        return TypedResults.Ok(new TeamAvailability(Support.Summarize(period), rows.Count(x => x.Status == Availability.Sent), rows.Count, rows));
    }

    /// <summary>Reminds one person, or everyone who has not sent. Never someone who already has (M4-05).</summary>
    private static async Task<Results<Ok<RemindResult>, ProblemHttpResult>> RemindAsync(
        Guid workplaceId, Guid periodId, RemindRequest request, SchedulingDb db, IWorkplaceDirectory directory, INotifier notifier, CancellationToken cancellationToken)
    {
        if (await FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var sent = await db.Availabilities.AsNoTracking()
            .Where(x => x.PeriodId == periodId && x.Status == Availability.Sent)
            .Select(x => x.MembershipId)
            .ToListAsync(cancellationToken);
        var missing = (await directory.GetMembersAsync(workplaceId, cancellationToken))
            .Where(x => x.WorksShifts && !sent.Contains(x.MembershipId))
            .Where(x => request.MembershipId is null || x.MembershipId == request.MembershipId)
            .ToList();
        await notifier.NotifyAsync(
            missing.Select(x => new NotificationRequest(workplaceId, x.MembershipId, x.UserId, NotificationTypes.AvailabilityReminder, PeriodParameters(period))).ToList(),
            cancellationToken);
        return TypedResults.Ok(new RemindResult(missing.Count));
    }

    internal static Task<Period?> FindPeriodAsync(SchedulingDb db, Guid workplaceId, Guid periodId, CancellationToken cancellationToken) =>
        db.Periods.SingleOrDefaultAsync(x => x.Id == periodId && x.WorkplaceId == workplaceId, cancellationToken);

    /// <summary>A Building Schedule page that went quiet counts as left, unsaved, so availability unlocks (4.3).</summary>
    private static async Task SettleVisitAsync(SchedulingDb db, Period period, IClock clock, CancellationToken cancellationToken)
    {
        if (await BuildSession.SettleAsync(db, period, clock.GetCurrentInstant(), cancellationToken))
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    private static async Task<Availability> GetOrAddAsync(SchedulingDb db, Guid periodId, Guid membershipId, CancellationToken cancellationToken)
    {
        var availability = await db.Availabilities
            .Include(x => x.Blocks)
            .Include(x => x.Notes)
            .SingleOrDefaultAsync(x => x.PeriodId == periodId && x.MembershipId == membershipId, cancellationToken);
        if (availability is null)
        {
            availability = new Availability { Id = Guid.NewGuid(), PeriodId = periodId, MembershipId = membershipId, Status = Availability.NotSent };
            db.Availabilities.Add(availability);
        }
        return availability;
    }

    /// <summary>
    /// One person's answer, read-only, for a manager (2026-11-18): the shifts they can work, their hours per
    /// week and their notes, as they see them. Someone who has not sent shows nothing selected: a draft is
    /// private. Notes only for those who may read them (FR-103).
    /// </summary>
    private static async Task<Results<Ok<PersonAvailability>, ProblemHttpResult>> GetPersonAsync(
        Guid workplaceId, Guid periodId, Guid membershipId, HttpContext http, SchedulingDb db, IWorkplaceDirectory directory, CancellationToken cancellationToken)
    {
        if (await FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var person = (await directory.GetMembersAsync(workplaceId, cancellationToken)).SingleOrDefault(x => x.MembershipId == membershipId);
        if (person is null)
        {
            return Problems.NotFound();
        }
        var answer = await db.Availabilities.AsNoTracking()
            .Include(x => x.Blocks)
            .Include(x => x.Notes)
            .SingleOrDefaultAsync(x => x.PeriodId == periodId && x.MembershipId == membershipId, cancellationToken);
        var sent = answer?.Status == Availability.Sent;
        var selected = sent ? answer!.Blocks.Select(x => x.ShiftId).ToHashSet() : [];
        var shifts = await db.Shifts.AsNoTracking().Where(x => x.PeriodId == periodId).OrderBy(x => x.Date).ThenBy(x => x.StartTime).ToListAsync(cancellationToken);
        var notes = http.Member().Can(Permission.ViewAvailabilityComments) ? answer?.Notes ?? [] : [];
        // A shift that overlaps their work at another workplace shows as simply not available: no flag, no reason (FR-094).
        var busy = await BusyElsewhere.LoadAsync(db, period, [person.UserId], cancellationToken);
        return TypedResults.Ok(new PersonAvailability(
            Support.Summarize(period),
            person.MembershipId,
            person.DisplayName,
            sent ? Availability.Sent : Availability.NotSent,
            sent ? answer!.DesiredWeeklyHours : null,
            shifts.Select(x => new AvailabilityShift(
                x.Id, x.SourceBlockId, x.Date.ToDateOnly(), Support.Time(x.StartTime), Support.Time(x.EndTime), x.Hours,
                selected.Contains(x.Id) && !busy.Any(b => b.Overlaps(x)), BusyElsewhere: false)).ToList(),
            notes.OrderBy(x => x.CreatedAt).Select(x => new AvailabilityNoteView(x.Id, x.Body, x.CreatedAt.ToDateTimeOffset())).ToList()));
    }

    private static async Task<MyAvailability> ViewMineAsync(SchedulingDb db, Period period, MemberAccess member, CancellationToken cancellationToken)
    {
        var membershipId = member.MembershipId;
        var availability = await db.Availabilities.AsNoTracking()
            .Include(x => x.Blocks)
            .Include(x => x.Notes)
            .SingleOrDefaultAsync(x => x.PeriodId == period.Id && x.MembershipId == membershipId, cancellationToken);
        var selected = availability?.Blocks.Select(x => x.ShiftId).ToHashSet() ?? [];
        var shifts = await db.Shifts.AsNoTracking().Where(x => x.PeriodId == period.Id).ToListAsync(cancellationToken);
        // FR-094: blocks that overlap a shift the person holds at another workplace are greyed out. They know where
        // they work; the response still says only "busy", never where.
        var busy = await BusyElsewhere.LoadAsync(db, period, [member.UserId], cancellationToken);
        var hasPrevious = await db.Periods.AnyAsync(x => x.WorkplaceId == period.WorkplaceId && x.StartDate < period.StartDate, cancellationToken);
        // BR-032: until this period has a number, offer the one from the person's most recent earlier period.
        var hours = availability?.DesiredWeeklyHours ?? await db.Availabilities.AsNoTracking()
            .Where(x => x.MembershipId == membershipId && x.DesiredWeeklyHours != null
                && db.Periods.Any(p => p.Id == x.PeriodId && p.WorkplaceId == period.WorkplaceId && p.StartDate < period.StartDate))
            .OrderByDescending(x => db.Periods.Where(p => p.Id == x.PeriodId).Select(p => p.StartDate).First())
            .Select(x => x.DesiredWeeklyHours)
            .FirstOrDefaultAsync(cancellationToken);
        return new MyAvailability(
            Support.Summarize(period),
            availability?.Status ?? Availability.NotSent,
            period.LockedAt is null,
            hasPrevious,
            hours,
            shifts.OrderBy(x => x.Date).ThenBy(x => x.StartTime)
                .Select(x =>
                {
                    var elsewhere = busy.Any(b => b.Overlaps(x));
                    return new AvailabilityShift(
                        x.Id, x.SourceBlockId, x.Date.ToDateOnly(), Support.Time(x.StartTime), Support.Time(x.EndTime), x.Hours,
                        selected.Contains(x.Id) && !elsewhere, elsewhere);
                })
                .ToList(),
            (availability?.Notes ?? []).OrderBy(x => x.CreatedAt).Select(x => new AvailabilityNoteView(x.Id, x.Body, x.CreatedAt.ToDateTimeOffset())).ToList());
    }

    private static async Task NotifyAdminsAsync(
        IWorkplaceDirectory directory, INotifier notifier, Guid workplaceId, Guid aboutMembershipId, string type, Period period, CancellationToken cancellationToken)
    {
        var members = await directory.GetMembersAsync(workplaceId, cancellationToken);
        var parameters = PeriodParameters(period);
        parameters["name"] = members.SingleOrDefault(x => x.MembershipId == aboutMembershipId)?.DisplayName ?? string.Empty;
        // So the alert opens that person's answer (2026-11-18).
        parameters["periodId"] = period.Id.ToString();
        parameters["membershipId"] = aboutMembershipId.ToString();
        await notifier.NotifyAsync(
            members.Where(x => x.Can(Permission.ManageSchedule) && x.MembershipId != aboutMembershipId)
                .Select(x => new NotificationRequest(workplaceId, x.MembershipId, x.UserId, type, parameters))
                .ToList(),
            cancellationToken);
    }

    private static Dictionary<string, string> PeriodParameters(Period period) => new() { ["periodStart"] = Support.IsoDate(period.StartDate) };
}

/// <param name="DesiredWeeklyHours">Hours per week wanted in this period (BR-032). Required to send; null leaves it as it was.</param>
public sealed record AvailabilityRequest(IReadOnlyList<Guid>? ShiftIds, decimal? DesiredWeeklyHours = null);

public sealed record NoteRequest(string? Body);

/// <param name="MembershipId">Null to remind everyone who has not sent.</param>
public sealed record RemindRequest(Guid? MembershipId);

public sealed record RemindResult(int Reminded);

public sealed record SuggestedAvailability(IReadOnlyList<Guid> ShiftIds);

/// <param name="Status">"not_sent" or "sent".</param>
/// <param name="CanEdit">False while the manager builds and once published (FR-100). Notes stay possible.</param>
/// <param name="HasPrevious">Whether "Same as last period" has anything to offer (FR-095).</param>
/// <param name="DesiredWeeklyHours">This period's number, or, until there is one, the person's number from their last period; null the first time (BR-032).</param>
public sealed record MyAvailability(
    PeriodSummary Period,
    string Status,
    bool CanEdit,
    bool HasPrevious,
    decimal? DesiredWeeklyHours,
    IReadOnlyList<AvailabilityShift> Shifts,
    IReadOnlyList<AvailabilityNoteView> Notes);

/// <param name="BlockId">The template block the shift came from; shifts of one block share a label.</param>
/// <param name="Selected">Never true for a shift the person cannot work because they work elsewhere then.</param>
/// <param name="BusyElsewhere">
/// Only on the person's own answer: they already hold a shift at another workplace at that time, so the block is
/// greyed out (FR-094). Always false on the managers' view, which sees only "not available".
/// </param>
public sealed record AvailabilityShift(Guid Id, Guid BlockId, DateOnly Date, string Start, string End, decimal Hours, bool Selected, bool BusyElsewhere);

public sealed record AvailabilityNoteView(Guid Id, string Body, DateTimeOffset CreatedAt);

/// <param name="DesiredWeeklyHours">Only once sent.</param>
/// <param name="Notes">Empty unless the caller may read availability notes (FR-103).</param>
public sealed record PersonAvailability(
    PeriodSummary Period,
    Guid MembershipId,
    string Name,
    string Status,
    decimal? DesiredWeeklyHours,
    IReadOnlyList<AvailabilityShift> Shifts,
    IReadOnlyList<AvailabilityNoteView> Notes);

public sealed record TeamAvailability(PeriodSummary Period, int SentCount, int Total, IReadOnlyList<TeamAvailabilityRow> People);

/// <param name="HoursOffered">Hours per week the person said they can work, averaged over the period.</param>
/// <param name="Notes">Empty unless the caller may read availability notes (FR-103).</param>
public sealed record TeamAvailabilityRow(
    Guid MembershipId,
    string Name,
    int Level,
    string Status,
    decimal HoursOffered,
    decimal? DesiredWeeklyHours,
    IReadOnlyList<AvailabilityNoteView> Notes);
