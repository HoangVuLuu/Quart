using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Npgsql;
using Quart.Generator;
using Quart.Modules.Scheduling.Availability;
using Quart.Modules.Scheduling.Periods;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Scheduling.Drafts;

using Assignment = Persistence.Assignment;
using Period = Persistence.Period;

/// <summary>
/// Building the schedule (M5-01 to M5-05, M5-07): generate, fix by hand, keep some people and redo the
/// rest, then publish or update. Staff never see any of this; they see the published schedule (AD-012).
/// </summary>
internal static class DraftEndpoints
{
    public const string NotBuilding = "schedule.not_building";
    public const string UnknownShift = "schedule.unknown_shift";
    public const string ReuseUnknown = "schedule.reuse_unknown";
    public const string NoteTooLong = "schedule.note_too_long";
    public const string UnknownMember = "schedule.unknown_member";
    public const string AlreadyOnShift = "schedule.already_on_shift";
    public const string NotOnShift = "schedule.not_on_shift";
    public const string PublishBlocked = "schedule.publish_blocked";
    public const string PublishNeedsConfirmation = "schedule.publish_needs_confirmation";
    public const string NothingToPublish = "schedule.nothing_to_publish";
    public const string DoubleBooking = "schedule.double_booking";
    public const string VisitEnded = "schedule.visit_ended";
    public const string ClearPublished = "schedule.cannot_clear_published";

    /// <summary>
    /// Whatever the settings say, this can never be published: the database refuses one person in two places
    /// at once (AD-011). More people than a shift asks for is the manager's choice and is only shown (FR-144).
    /// </summary>
    private static readonly HashSet<string> AlwaysBlocking = [IssueCodes.OverlappingShifts];

    public static void MapDrafts(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/periods/{periodId:guid}/draft")
            .RequirePermission(Permission.ManageSchedule);
        group.MapGet("/", GetAsync).WithName("GetDraft");
        group.MapPost("/start", StartAsync).WithName("StartBuilding");
        group.MapPost("/heartbeat", HeartbeatAsync).WithName("KeepBuilding");
        group.MapPost("/save", SaveAsync).WithName("SaveDraft");
        group.MapPost("/leave", LeaveAsync).WithName("LeaveBuilding");
        group.MapPost("/clear", ClearAsync).WithName("ClearDraft");
        group.MapPost("/generate", GenerateAsync).WithName("GenerateDraft");
        group.MapGet("/reuse", ReuseSourcesAsync).WithName("GetReuseSources");
        group.MapPost("/reuse", ReuseAsync).WithName("ReuseSchedule");
        group.MapPost("/assignments", AddAsync).WithName("AddDraftAssignment");
        group.MapDelete("/assignments/{shiftId:guid}/{membershipId:guid}", RemoveAsync).WithName("RemoveDraftAssignment");
        group.MapPut("/assignments/{shiftId:guid}/{membershipId:guid}/lock", SetLockAsync).WithName("LockDraftAssignment");
        group.MapPut("/assignments/{shiftId:guid}/{membershipId:guid}/early", SetEarlyAsync).WithName("MarkDraftAssignmentEarly");
        group.MapPut("/shifts/{shiftId:guid}/note", SetNoteAsync).WithName("SetShiftNote");
        group.MapPost("/publish", PublishAsync).WithName("PublishDraft");
    }

    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> GetAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, DraftBuilder builder, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        return TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>A build by hand locks availability exactly as Generate does (FR-100).</summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> StartAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, DraftBuilder builder, IWorkplaceDirectory directory, IClock clock, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        // 4.3: entering Building or Editing Schedule. A visit left open by a closed app ends first, unsaved.
        await BuildSession.EnterAsync(db, period, clock.GetCurrentInstant(), cancellationToken);
        Lock(period, clock);
        await RefreshRulesAsync(db, directory, period, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>
    /// The open page's sign of life, every 30 seconds. A visit that already ended (the page went quiet for
    /// longer than the timeout and someone needed the answer) answers 409, so the page knows its unsaved
    /// changes are gone.
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> HeartbeatAsync(
        Guid workplaceId, Guid periodId, SchedulingDb db, IClock clock, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (period.SessionSeenAt is null)
        {
            return Problems.Conflict(VisitEnded);
        }
        period.SessionSeenAt = clock.GetCurrentInstant();
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>"Save draft": progress kept for later, and what leaving puts back from now on (4.3).</summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> SaveAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, DraftBuilder builder, IClock clock, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (period.LockedAt is null)
        {
            return Problems.Conflict(NotBuilding);
        }
        await BuildSession.SaveAsync(db, period, clock.GetCurrentInstant(), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>
    /// Leaving the page: unsaved changes are dropped, and an unpublished period's availability unlocks
    /// (4.3). Editing a published schedule unlocks nothing (4.4). Leaving twice changes nothing.
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> LeaveAsync(
        Guid workplaceId, Guid periodId, SchedulingDb db, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (period.SessionSeenAt is not null)
        {
            await BuildSession.LeaveAsync(db, period, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }
        return TypedResults.NoContent();
    }

    /// <summary>"Clear" on Building Schedule wipes the draft, kept or not. Never on a published schedule (4.4).</summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> ClearAsync(
        Guid workplaceId, Guid periodId, HttpContext http, SchedulingDb db, DraftBuilder builder, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (period.Version > 0)
        {
            return Problems.Conflict(ClearPublished);
        }
        if (period.LockedAt is null)
        {
            return Problems.Conflict(NotBuilding);
        }
        await db.Assignments.Where(x => x.PeriodId == period.Id && x.IsDraft).ExecuteDeleteAsync(cancellationToken);
        return TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>
    /// Locks availability, then rebuilds every assignment that is not kept (FR-120, FR-123). A new seed
    /// each time gives a different valid schedule; the seed is stored so the result can be reproduced (FR-122).
    /// </summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> GenerateAsync(
        Guid workplaceId, Guid periodId, GenerateRequest request, HttpContext http, SchedulingDb db, DraftBuilder builder,
        IScheduleGenerator generator, IWorkplaceDirectory directory, IClock clock, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var member = http.Member();
        Lock(period, clock);
        await RefreshRulesAsync(db, directory, period, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var data = await builder.LoadAsync(period, cancellationToken);
        var draft = await builder.AssignmentsAsync(period.Id, draft: true, cancellationToken);
        // Shifts that have already started are history: generating again in the middle of a published
        // period must not reshuffle the days people have already worked.
        var now = clock.GetCurrentInstant();
        bool Started(Instant startsAt) => period.Version > 0 && startsAt <= now;
        var kept = draft.Where(x => x.IsLocked || Started(x.StartsAt)).ToList();
        var seed = request.Seed ?? Random.Shared.Next(1, int.MaxValue);
        var result = generator.Generate(DraftBuilder.ToInput(data, kept, seed));

        db.Assignments.RemoveRange(draft.Except(kept));
        var keptKeys = kept.Select(x => (x.ShiftId, x.MembershipId)).ToHashSet();
        var shifts = data.Shifts.ToDictionary(x => x.Id);
        var members = data.Members.ToDictionary(x => x.MembershipId);
        foreach (var assignment in result.Assignments)
        {
            var shiftId = Guid.Parse(assignment.ShiftId);
            var membershipId = Guid.Parse(assignment.MemberId);
            if (!keptKeys.Contains((shiftId, membershipId)) && !Started(shifts[shiftId].StartsAt))
            {
                db.Assignments.Add(NewDraft(period, shifts[shiftId], members[membershipId], Assignment.Generated));
            }
        }
        period.Seed = seed;
        db.GenerationRuns.Add(new GenerationRun
        {
            Id = Guid.NewGuid(),
            PeriodId = period.Id,
            Seed = seed,
            Score = result.Score,
            Rules = period.Rules,
            CreatedBy = member.MembershipId,
            CreatedAt = clock.GetCurrentInstant(),
        });
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await ViewAsync(db, builder, period, member, cancellationToken));
    }

    /// <summary>"Reuse a past schedule" (FR-124, M5-08): the published periods before this one, newest first.</summary>
    private static async Task<Results<Ok<List<PastPeriod>>, ProblemHttpResult>> ReuseSourcesAsync(
        Guid workplaceId, Guid periodId, SchedulingDb db, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var past = await db.Periods.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && x.Version > 0 && x.StartDate < period.StartDate)
            .OrderByDescending(x => x.StartDate)
            .Select(x => new { x.Id, x.StartDate, x.EndDate, x.Weeks })
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(past.Select(x => new PastPeriod(x.Id, x.StartDate.ToDateOnly(), x.EndDate.ToDateOnly(), x.Weeks)).ToList());
    }

    /// <summary>
    /// "Reuse a past schedule" (FR-124, M5-08): who worked each shift of a past period goes on the shift of this one
    /// with the same week (counted round the past period's weeks), weekday and generator shift, the mapping "Same as
    /// last period" uses. Like Generate, it replaces the draft except the people kept and the shifts that started.
    /// Nothing is checked here: the evaluator then shows who is not available, as for any draft made by hand.
    /// </summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> ReuseAsync(
        Guid workplaceId, Guid periodId, ReuseRequest request, HttpContext http, SchedulingDb db, DraftBuilder builder,
        IWorkplaceDirectory directory, IClock clock, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var source = await db.Periods.AsNoTracking().SingleOrDefaultAsync(
            x => x.Id == request.SourcePeriodId && x.WorkplaceId == workplaceId && x.Version > 0 && x.StartDate < period.StartDate, cancellationToken);
        if (source is null)
        {
            return Problems.Validation(new FieldError(ReuseUnknown, "sourcePeriodId"));
        }
        Lock(period, clock);
        await RefreshRulesAsync(db, directory, period, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        var data = await builder.LoadAsync(period, cancellationToken);
        var draft = await builder.AssignmentsAsync(period.Id, draft: true, cancellationToken);
        var now = clock.GetCurrentInstant();
        bool Started(Instant startsAt) => period.Version > 0 && startsAt <= now;
        var kept = draft.Where(x => x.IsLocked || Started(x.StartsAt)).ToList();
        var keptKeys = kept.Select(x => (x.ShiftId, x.MembershipId)).ToHashSet();

        (int Week, IsoDayOfWeek Day, Guid Block) KeyOf(LocalDate start, LocalDate date, Guid block, int weeks) =>
            ((NodaTime.Period.DaysBetween(start, date) / 7) % weeks, date.DayOfWeek, block);
        var worked = (await db.Assignments.AsNoTracking()
                .Where(x => x.PeriodId == source.Id && !x.IsDraft)
                .Join(db.Shifts.AsNoTracking(), a => a.ShiftId, s => s.Id, (a, s) => new { a.MembershipId, s.Date, s.SourceBlockId })
                .ToListAsync(cancellationToken))
            .ToLookup(x => KeyOf(source.StartDate, x.Date, x.SourceBlockId, source.Weeks), x => x.MembershipId);
        // Only people who still work shifts here: those who left are skipped.
        var members = data.Members.ToDictionary(x => x.MembershipId);

        db.Assignments.RemoveRange(draft.Except(kept));
        foreach (var shift in data.Shifts.Where(x => !Started(x.StartsAt)))
        {
            foreach (var membershipId in worked[KeyOf(period.StartDate, shift.Date, shift.SourceBlockId, source.Weeks)].Distinct())
            {
                if (members.TryGetValue(membershipId, out var person) && !keptKeys.Contains((shift.Id, membershipId)))
                {
                    db.Assignments.Add(NewDraft(period, shift, person, Assignment.Manual));
                }
            }
        }
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>
    /// Places someone by hand. Anyone who works shifts can be placed, available or not, and a manager who
    /// wants an extra pair of hands can go past the headcount: the evaluator shows it (FR-121, FR-142). Only
    /// a duplicate is refused. The generator itself never goes past the headcount (BR-003).
    /// </summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> AddAsync(
        Guid workplaceId, Guid periodId, AssignRequest request, HttpContext http, SchedulingDb db, DraftBuilder builder, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (period.LockedAt is null)
        {
            return Problems.Conflict(NotBuilding);
        }
        var data = await builder.LoadAsync(period, cancellationToken);
        if (data.Shifts.FirstOrDefault(x => x.Id == request.ShiftId) is not { } shift)
        {
            return Problems.Validation(new FieldError(UnknownShift, "shiftId"));
        }
        if (data.Members.FirstOrDefault(x => x.MembershipId == request.MembershipId) is not { } person)
        {
            return Problems.Validation(new FieldError(UnknownMember, "membershipId"));
        }
        var onShift = await db.Assignments.Where(x => x.ShiftId == shift.Id && x.IsDraft).ToListAsync(cancellationToken);
        if (onShift.Any(x => x.MembershipId == person.MembershipId))
        {
            return Problems.Conflict(AlreadyOnShift);
        }
        db.Assignments.Add(NewDraft(period, shift, person, Assignment.Manual));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // The same tap arrived twice.
            return Problems.Conflict(AlreadyOnShift);
        }
        return TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>
    /// The manager's note on a shift, such as "Leaving at 5pm" (FR-145). Part of the draft: the team sees it once
    /// published or updated. Plain text, 100 characters at most; empty removes it.
    /// </summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> SetNoteAsync(
        Guid workplaceId, Guid periodId, Guid shiftId, ShiftNoteChange request, HttpContext http, SchedulingDb db, DraftBuilder builder, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (period.LockedAt is null)
        {
            return Problems.Conflict(NotBuilding);
        }
        if (await db.Shifts.SingleOrDefaultAsync(x => x.Id == shiftId && x.PeriodId == period.Id, cancellationToken) is not { } shift)
        {
            return Problems.NotFound();
        }
        var note = (request.Note ?? string.Empty).Trim();
        if (note.Length > Shift.NoteMaxLength)
        {
            return Problems.Validation(new FieldError(NoteTooLong, "note"));
        }
        shift.DraftNote = note.Length == 0 ? null : note;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> RemoveAsync(
        Guid workplaceId, Guid periodId, Guid shiftId, Guid membershipId, HttpContext http, SchedulingDb db, DraftBuilder builder, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var removed = await db.Assignments
            .Where(x => x.PeriodId == period.Id && x.ShiftId == shiftId && x.MembershipId == membershipId && x.IsDraft)
            .ExecuteDeleteAsync(cancellationToken);
        return removed == 0
            ? Problems.Conflict(NotOnShift)
            : TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>"Keep": the assignment survives the next Generate (FR-123, BR-004).</summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> SetLockAsync(
        Guid workplaceId, Guid periodId, Guid shiftId, Guid membershipId, LockRequest request, HttpContext http, SchedulingDb db, DraftBuilder builder, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var updated = await db.Assignments
            .Where(x => x.PeriodId == period.Id && x.ShiftId == shiftId && x.MembershipId == membershipId && x.IsDraft)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.IsLocked, request.Locked), cancellationToken);
        return updated == 0
            ? Problems.Conflict(NotOnShift)
            : TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>
    /// Tapping a person on a shift marks them as starting earlier, and tapping again takes it off (Hoang,
    /// 2026-11-25). Like any draft change it reaches the team when published.
    /// </summary>
    private static async Task<Results<Ok<DraftView>, ProblemHttpResult>> SetEarlyAsync(
        Guid workplaceId, Guid periodId, Guid shiftId, Guid membershipId, EarlyRequest request, HttpContext http, SchedulingDb db, DraftBuilder builder, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        var updated = await db.Assignments
            .Where(x => x.PeriodId == period.Id && x.ShiftId == shiftId && x.MembershipId == membershipId && x.IsDraft)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.StartsEarly, request.StartsEarly), cancellationToken);
        return updated == 0
            ? Problems.Conflict(NotOnShift)
            : TypedResults.Ok(await ViewAsync(db, builder, period, http.Member(), cancellationToken));
    }

    /// <summary>
    /// Publishes the draft as version 1, or as the next version when one is already live (FR-160, FR-163).
    /// Issues set to "block" stop it; issues set to "confirm" need <see cref="PublishRequest.Confirmed"/>
    /// (FR-144). Empty slots are allowed and become open shifts (FR-165).
    /// </summary>
    private static async Task<Results<Ok<PeriodSummary>, ProblemHttpResult>> PublishAsync(
        Guid workplaceId, Guid periodId, PublishRequest request, HttpContext http, SchedulingDb db, DraftBuilder builder,
        IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        if (await AvailabilityEndpoints.FindPeriodAsync(db, workplaceId, periodId, cancellationToken) is not { } period)
        {
            return Problems.NotFound();
        }
        if (period.LockedAt is null)
        {
            return Problems.Conflict(NotBuilding);
        }

        var data = await builder.LoadAsync(period, cancellationToken);
        var draft = await builder.AssignmentsAsync(period.Id, draft: true, cancellationToken);
        var live = await builder.AssignmentsAsync(period.Id, draft: false, cancellationToken);
        var issues = DraftBuilder.Evaluate(data, draft).Issues;
        var checks = Support.RulesOf(period).PublishChecks;
        var blocking = issues.Where(x => SeverityOf(x.Code, checks) == Severity.Block).Select(x => x.Code).Distinct().ToList();
        if (blocking.Count > 0)
        {
            return IssueProblem(PublishBlocked, blocking);
        }
        var asking = issues.Where(x => SeverityOf(x.Code, checks) == Severity.Confirm).Select(x => x.Code).Distinct().ToList();
        if (asking.Count > 0 && !request.Confirmed)
        {
            return IssueProblem(PublishNeedsConfirmation, asking);
        }

        var draftKeys = draft.Select(x => (x.ShiftId, x.MembershipId)).ToHashSet();
        var liveKeys = live.Select(x => (x.ShiftId, x.MembershipId)).ToHashSet();
        var added = draft.Where(x => !liveKeys.Contains((x.ShiftId, x.MembershipId))).ToList();
        var removed = live.Where(x => !draftKeys.Contains((x.ShiftId, x.MembershipId))).ToList();
        // 2026-11-25: someone marked (or no longer marked) as starting earlier is a change to publish too.
        var earlyInDraft = draft.Where(x => x.StartsEarly).Select(x => (x.ShiftId, x.MembershipId)).ToHashSet();
        var remarked = live.Where(x => draftKeys.Contains((x.ShiftId, x.MembershipId))
            && x.StartsEarly != earlyInDraft.Contains((x.ShiftId, x.MembershipId))).Select(x => x.Id).ToList();
        // FR-145: a changed shift note is a change to publish too.
        var shifts = await db.Shifts.Where(x => x.PeriodId == period.Id).ToListAsync(cancellationToken);
        var renoted = shifts.Where(x => x.DraftNote != x.Note).ToList();
        if (period.Version > 0 && added.Count == 0 && removed.Count == 0 && renoted.Count == 0 && remarked.Count == 0)
        {
            return Problems.Conflict(NothingToPublish);
        }

        var member = http.Member();
        var now = clock.GetCurrentInstant();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            // Removals first, in their own statement: the database checks the no-double-booking rule (AD-011)
            // as each row arrives, so the person leaving a shift must be gone before their replacement lands.
            var removedIds = removed.Select(x => x.Id).ToList();
            await db.Assignments.Where(x => removedIds.Contains(x.Id)).ExecuteDeleteAsync(cancellationToken);
            db.Assignments.AddRange(added.Select(x => new Assignment
            {
                Id = Guid.NewGuid(),
                PeriodId = x.PeriodId,
                ShiftId = x.ShiftId,
                MembershipId = x.MembershipId,
                UserId = x.UserId,
                IsDraft = false,
                StartsEarly = x.StartsEarly,
                Source = x.Source,
                StartsAt = x.StartsAt,
                EndsAt = x.EndsAt,
            }));
            foreach (var shift in renoted)
            {
                shift.Note = shift.DraftNote;
            }
            await db.Assignments.Where(x => remarked.Contains(x.Id))
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.StartsEarly, x => !x.StartsEarly), cancellationToken);
            period.Version++;
            period.Status = Period.Published;
            period.PublishedAt = now;
            // The visit ends with the publish: what is live is now what there is to come back to (4.3).
            period.SessionSeenAt = null;
            period.SavedDraft = null;
            period.DraftSavedAt = null;
            db.ScheduleVersions.Add(new ScheduleVersion
            {
                Id = Guid.NewGuid(),
                PeriodId = period.Id,
                Version = period.Version,
                PublishedAt = now,
                PublishedBy = member.MembershipId,
                Snapshot = Snapshot(draft),
            });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation })
        {
            // Someone holds an overlapping shift in another period or workplace (BR-002).
            await transaction.RollbackAsync(cancellationToken);
            return Problems.Conflict(DoubleBooking);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // Publish was tapped twice, or the schedule changed in the same instant: the other one won.
            await transaction.RollbackAsync(cancellationToken);
            return Problems.Conflict(NothingToPublish);
        }

        var members = await directory.GetMembersAsync(workplaceId, cancellationToken);
        var start = Support.IsoDate(period.StartDate);
        if (period.Version == 1)
        {
            // FR-160: the first version goes to everyone.
            await notifier.NotifyAsync(
                members.Select(x => new NotificationRequest(workplaceId, x.MembershipId, x.UserId, NotificationTypes.SchedulePublished,
                    new Dictionary<string, string> { ["periodStart"] = start, ["version"] = "1" })).ToList(),
                cancellationToken);
        }
        else
        {
            // FR-163: an update reaches only the people whose own shifts changed, with what changed.
            var byId = members.ToDictionary(x => x.MembershipId);
            var affected = added.Select(x => x.MembershipId).Concat(removed.Select(x => x.MembershipId)).Distinct().Where(byId.ContainsKey);
            await notifier.NotifyAsync(
                affected.Select(id => new NotificationRequest(workplaceId, id, byId[id].UserId, NotificationTypes.ScheduleChanged,
                    new Dictionary<string, string>
                    {
                        ["periodStart"] = start,
                        ["added"] = added.Count(x => x.MembershipId == id).ToString(CultureInfo.InvariantCulture),
                        ["removed"] = removed.Count(x => x.MembershipId == id).ToString(CultureInfo.InvariantCulture),
                    })).ToList(),
                cancellationToken);

            // FR-145: a new or changed note reaches the people on that shift, without its text (FR-216).
            var people = draft.ToLookup(x => x.ShiftId);
            await notifier.NotifyAsync(
                renoted.Where(x => x.Note != null)
                    .SelectMany(shift => people[shift.Id].Where(x => byId.ContainsKey(x.MembershipId)).Select(x => new NotificationRequest(
                        workplaceId, x.MembershipId, byId[x.MembershipId].UserId, NotificationTypes.ShiftNoteChanged,
                        new Dictionary<string, string>
                        {
                            ["date"] = Support.IsoDate(shift.Date),
                            ["start"] = Support.Time(shift.StartTime),
                            ["end"] = Support.Time(shift.EndTime),
                            ["shiftId"] = shift.Id.ToString(),
                            ["periodId"] = period.Id.ToString(),
                        })))
                    .ToList(),
                cancellationToken);
        }
        return TypedResults.Ok(Support.Summarize(period));
    }

    internal static string Snapshot(IEnumerable<Assignment> assignments) =>
        JsonSerializer.Serialize(
            assignments.OrderBy(x => x.StartsAt).ThenBy(x => x.MembershipId).Select(x => new { shiftId = x.ShiftId, membershipId = x.MembershipId }),
            JsonSerializerOptions.Web);

    /// <summary>
    /// The period takes the rules as they are in Edit Generator now: fairness, the limit on shifts in a row,
    /// what publishing does about each issue, and who cannot work together. They were copied when the
    /// period was opened; without this, a rule changed since then would be silently ignored (FR-068).
    /// The shifts themselves (times, headcount, levels) stay as they were when the period was opened.
    /// </summary>
    private static async Task RefreshRulesAsync(SchedulingDb db, IWorkplaceDirectory directory, Period period, CancellationToken cancellationToken)
    {
        // FR-068: only until the period is published. A published schedule keeps the rules it was built with.
        if (period.Version > 0 || await directory.GetTemplateAsync(period.WorkplaceId, cancellationToken) is not { } template)
        {
            return;
        }
        period.Rules = PeriodEndpoints.RulesJson(template);
        var blockIds = await db.Shifts.Where(x => x.PeriodId == period.Id).Select(x => x.SourceBlockId).Distinct().ToListAsync(cancellationToken);
        await db.PeriodConflicts.Where(x => x.PeriodId == period.Id).ExecuteDeleteAsync(cancellationToken);
        db.PeriodConflicts.AddRange(template.Conflicts.Where(x => blockIds.Contains(x.BlockId)).Select(x => new PeriodConflict
        {
            Id = Guid.NewGuid(), PeriodId = period.Id, BlockId = x.BlockId, MembershipA = x.MembershipA, MembershipB = x.MembershipB,
        }));
    }

    private static void Lock(Period period, IClock clock)
    {
        period.LockedAt ??= clock.GetCurrentInstant();
        if (period.Status == Period.Collecting)
        {
            period.Status = Period.Building;
        }
    }

    private static Assignment NewDraft(Period period, Shift shift, WorkplaceMember person, string source) => new()
    {
        Id = Guid.NewGuid(),
        PeriodId = period.Id,
        ShiftId = shift.Id,
        MembershipId = person.MembershipId,
        UserId = person.UserId,
        IsDraft = true,
        Source = source,
        StartsAt = shift.StartsAt,
        EndsAt = shift.EndsAt,
    };

    private static string SeverityOf(string code, IReadOnlyDictionary<string, string> checks) =>
        AlwaysBlocking.Contains(code) ? Severity.Block : checks.GetValueOrDefault(code, Severity.Show);

    private static ProblemHttpResult IssueProblem(string code, List<string> issueCodes) =>
        TypedResults.Problem(
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = code, ["issues"] = issueCodes });

    private static async Task<DraftView> ViewAsync(SchedulingDb db, DraftBuilder builder, Period period, MemberAccess caller, CancellationToken cancellationToken)
    {
        var data = await builder.LoadAsync(period, cancellationToken);
        var draft = await db.Assignments.AsNoTracking().Where(x => x.PeriodId == period.Id && x.IsDraft).ToListAsync(cancellationToken);
        var live = await db.Assignments.AsNoTracking().Where(x => x.PeriodId == period.Id && !x.IsDraft).ToListAsync(cancellationToken);
        var evaluation = DraftBuilder.Evaluate(data, draft);
        var checks = Support.RulesOf(period).PublishChecks;
        var parts = DayParts.Of(DraftBuilder.ToInput(data, [], 0).Shifts);
        var canReadNotes = caller.Can(Permission.ViewAvailabilityComments);
        var availabilityOf = data.Availabilities.ToDictionary(x => x.MembershipId);
        var noteCounts = canReadNotes
            ? await db.AvailabilityNotes.AsNoTracking()
                .Join(db.Availabilities.Where(x => x.PeriodId == period.Id), n => n.AvailabilityId, a => a.Id, (n, a) => a.MembershipId)
                .GroupBy(x => x)
                .ToDictionaryAsync(x => x.Key, x => x.Count(), cancellationToken)
            : [];
        var summaries = evaluation.Members.ToDictionary(x => x.MemberId);
        var nameOf = data.Members.ToDictionary(x => x.MembershipId, x => x.DisplayName);

        var shifts = data.Shifts.Select(shift => new DraftShift(
            shift.Id,
            shift.SourceBlockId,
            shift.Date.ToDateOnly(),
            Support.Time(shift.StartTime),
            Support.Time(shift.EndTime),
            shift.Hours,
            shift.Headcount,
            PartOf(parts[DraftBuilder.Id(shift.Id)]),
            shift.Requirements.OrderBy(x => x.Level).Select(x => new DraftRequirement(x.Level, x.MinCount)).ToList(),
            // By name, so the list stays put when someone is kept or marked (the database returns rows in any order).
            draft.Where(x => x.ShiftId == shift.Id)
                .OrderBy(x => nameOf.GetValueOrDefault(x.MembershipId), StringComparer.CurrentCultureIgnoreCase)
                .ThenBy(x => x.MembershipId)
                .Select(x => new DraftAssignment(x.MembershipId, x.IsLocked, x.StartsEarly)).ToList(),
            // Someone working at another workplace then shows as simply not available (FR-094).
            data.Availabilities
                .Where(x => x.Status == Persistence.Availability.Sent && x.Blocks.Any(b => b.ShiftId == shift.Id)
                    && !DraftBuilder.IsBusyElsewhere(data, x.MembershipId, shift))
                .Select(x => x.MembershipId).ToList(),
            // FR-103a: only this shift's notes, from the people who can work it, for those who may read notes.
            canReadNotes
                ? data.Availabilities
                    .Where(x => x.Status == Persistence.Availability.Sent && !DraftBuilder.IsBusyElsewhere(data, x.MembershipId, shift))
                    .SelectMany(x => x.Blocks.Where(b => b.ShiftId == shift.Id && b.Note != null).Select(b => new DraftShiftNote(x.MembershipId, b.Note!)))
                    .ToList()
                : [],
            shift.DraftNote,
            shift.Name,
            shift.AddedByHand)).ToList();

        var people = data.Members.Select(person => new DraftPerson(
            person.MembershipId,
            person.DisplayName,
            person.Level,
            DraftBuilder.DesiredOf(data, person),
            person.MaxWeeklyHours,
            availabilityOf.GetValueOrDefault(person.MembershipId)?.Status ?? Persistence.Availability.NotSent,
            summaries.TryGetValue(DraftBuilder.Id(person.MembershipId), out var summary) ? summary.WeeklyHours : new decimal[period.Weeks],
            noteCounts.GetValueOrDefault(person.MembershipId))).ToList();

        var draftKeys = draft.Select(x => (x.ShiftId, x.MembershipId, x.StartsEarly)).ToHashSet();
        var liveKeys = live.Select(x => (x.ShiftId, x.MembershipId, x.StartsEarly)).ToHashSet();
        return new DraftView(
            Support.Summarize(period),
            period.Seed,
            evaluation.Score,
            shifts.Sum(x => Math.Max(0, x.Headcount - x.People.Count)),
            // FR-161: Update only shows when the draft differs from what is live, shift notes included (FR-145).
            period.Version == 0 || !draftKeys.SetEquals(liveKeys) || data.Shifts.Any(x => x.DraftNote != x.Note),
            BuildSession.HasUnsavedChanges(period, draft, data.Shifts),
            shifts,
            people,
            evaluation.Issues.Select(x => new DraftIssue(
                x.Code,
                SeverityOf(x.Code, checks),
                x.ShiftIds.Select(Guid.Parse).ToList(),
                x.MemberIds.Select(Guid.Parse).ToList(),
                x.Parameters)).ToList());
    }

    internal static string PartOf(DayPart part) => part switch
    {
        DayPart.Opening => "opening",
        DayPart.Closing => "closing",
        DayPart.Opening | DayPart.Closing => "only",
        _ => "mid",
    };
}

/// <summary>What publishing does about an issue (FR-144).</summary>
internal static class Severity
{
    public const string Block = "block";
    public const string Confirm = "confirm";
    public const string Show = "show";
}

/// <param name="Seed">Null picks a new one; give a stored seed to reproduce a schedule (FR-122).</param>
public sealed record GenerateRequest(int? Seed);

public sealed record AssignRequest(Guid ShiftId, Guid MembershipId);

public sealed record LockRequest(bool Locked);

public sealed record EarlyRequest(bool StartsEarly);

/// <param name="Confirmed">True once the admin has seen the issues that ask for confirmation (FR-144).</param>
public sealed record PublishRequest(bool Confirmed);

/// <param name="Seed">The seed of the last generation; null when nothing was generated.</param>
/// <param name="Score">The evaluator's score: lower is better, 0 is a schedule with nothing to report.</param>
/// <param name="HasUnpublishedChanges">True when the draft differs from what staff see.</param>
public sealed record DraftView(
    PeriodSummary Period,
    int? Seed,
    int Score,
    int OpenSlots,
    bool HasUnpublishedChanges,
    bool HasUnsavedChanges,
    IReadOnlyList<DraftShift> Shifts,
    IReadOnlyList<DraftPerson> People,
    IReadOnlyList<DraftIssue> Issues);

/// <param name="Part">"opening", "closing", "mid", or "only" for a day's single shift (BR-034).</param>
/// <param name="AvailableIds">Members who sent their availability and can work this shift.</param>
/// <param name="Notes">Their notes on this shift (FR-103a); empty unless the caller may read notes.</param>
/// <param name="ManagerNote">The manager's own note on the shift as drafted (FR-145); the team sees it once published.</param>
/// <param name="Name">The shift's custom name, or null to be called by its part (M3-04).</param>
/// <param name="AddedByHand">Added on Building or Editing Schedule: nobody gave availability, filled by hand (M4-01).</param>
public sealed record DraftShift(
    Guid Id,
    Guid BlockId,
    DateOnly Date,
    string Start,
    string End,
    decimal Hours,
    int Headcount,
    string Part,
    IReadOnlyList<DraftRequirement> Requirements,
    IReadOnlyList<DraftAssignment> People,
    IReadOnlyList<Guid> AvailableIds,
    IReadOnlyList<DraftShiftNote> Notes,
    string? ManagerNote,
    string? Name,
    bool AddedByHand = false);

/// <summary>A published period that "Reuse a past schedule" can copy (FR-124).</summary>
public sealed record PastPeriod(Guid Id, DateOnly StartDate, DateOnly EndDate, int Weeks);

public sealed record ReuseRequest(Guid SourcePeriodId);

/// <param name="Note">Plain text, 100 characters at most; empty removes the note (FR-145).</param>
public sealed record ShiftNoteChange(string? Note);

/// <summary>One person's note on one shift (FR-103a). Plain text.</summary>
public sealed record DraftShiftNote(Guid MembershipId, string Note);

public sealed record DraftRequirement(int Level, int MinCount);

/// <param name="Locked">Kept through the next generation (FR-123).</param>
/// <param name="StartsEarly">The manager marked them as starting earlier than the shift (2026-11-25).</param>
public sealed record DraftAssignment(Guid MembershipId, bool Locked, bool StartsEarly = false);

/// <param name="Availability">"sent" or "not_sent".</param>
/// <param name="WeeklyHours">Hours assigned in the draft, one entry per week of the period (FR-141).</param>
/// <param name="NoteCount">How many availability notes they left; 0 unless the caller may read notes (FR-103).</param>
public sealed record DraftPerson(
    Guid MembershipId,
    string Name,
    int Level,
    decimal? DesiredWeeklyHours,
    decimal? MaxWeeklyHours,
    string Availability,
    IReadOnlyList<decimal> WeeklyHours,
    int NoteCount);

/// <param name="Code">One of the evaluator's issue codes, such as <c>issue.missing_level</c>.</param>
/// <param name="Severity">"block", "confirm" or "show" (FR-144).</param>
public sealed record DraftIssue(
    string Code,
    string Severity,
    IReadOnlyList<Guid> ShiftIds,
    IReadOnlyList<Guid> MemberIds,
    IReadOnlyDictionary<string, string> Parameters);
