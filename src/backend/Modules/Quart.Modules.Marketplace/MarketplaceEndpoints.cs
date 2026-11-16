using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using NodaTime.Text;
using Quart.Modules.Marketplace.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Notifications;
using Quart.SharedKernel.Scheduling;

namespace Quart.Modules.Marketplace;

/// <summary>
/// Give away, claim and trade (M7). Offering a shift never removes its holder (FR-181); a claim or a trade
/// changes the published schedule through the ledger, which re-checks everything at that moment (FR-192).
/// </summary>
internal static class MarketplaceEndpoints
{
    public const string NotYourShift = "marketplace.not_your_shift";
    public const string ShiftStarted = "marketplace.shift_started";
    public const string AlreadyOffered = "marketplace.already_offered";
    public const string ShiftTaken = "marketplace.shift_taken";
    public const string Overlap = "marketplace.overlap";
    public const string MissingLevel = "marketplace.missing_level";
    public const string AlreadyRequested = "marketplace.already_requested";
    public const string NotShiftWorker = "marketplace.not_shift_worker";
    public const string OwnShift = "marketplace.own_shift";
    public const string NothingToClaim = "marketplace.nothing_to_claim";
    public const string NoLongerPending = "marketplace.no_longer_pending";
    public const string TradeInvalid = "marketplace.trade_invalid";

    private static readonly Duration TradeLifetime = Duration.FromDays(14);
    private static readonly LocalTimePattern TimePattern = LocalTimePattern.CreateWithInvariantCulture("HH:mm");

    public static void MapMarketplace(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/marketplace");
        group.MapGet("/", GetBoardAsync).AllowAnyMember().WithName("GetMarketplace");
        group.MapPost("/give-aways", OfferAsync).AllowAnyMember().WithName("GiveAwayShift");
        group.MapDelete("/give-aways/{giveAwayId:guid}", CancelOfferAsync).AllowAnyMember().WithName("CancelGiveAway");
        group.MapPost("/claims", ClaimAsync).AllowAnyMember().WithName("ClaimShift");
        group.MapPost("/claims/{claimId:guid}/approve", ApproveClaimAsync).RequirePermission(Permission.ApproveRequests).WithName("ApproveClaim");
        group.MapPost("/claims/{claimId:guid}/decline", DeclineClaimAsync).RequirePermission(Permission.ApproveRequests).WithName("DeclineClaim");
        group.MapPost("/trades", RequestTradeAsync).AllowAnyMember().WithName("RequestTrade");
        group.MapPost("/trades/{tradeId:guid}/accept", AcceptTradeAsync).AllowAnyMember().WithName("AcceptTrade");
        group.MapPost("/trades/{tradeId:guid}/decline", DeclineTradeAsync).AllowAnyMember().WithName("DeclineTrade");
        group.MapPost("/trades/{tradeId:guid}/cancel", CancelTradeAsync).AllowAnyMember().WithName("CancelTrade");
        group.MapPost("/trades/{tradeId:guid}/approve", ApproveTradeAsync).RequirePermission(Permission.ApproveRequests).WithName("ApproveTrade");
        group.MapPost("/trades/{tradeId:guid}/reject", RejectTradeAsync).RequirePermission(Permission.ApproveRequests).WithName("RejectTrade");
    }

    /// <summary>Everything waiting on someone: open shifts, offers, the caller's requests, and what an approver must decide (M7-01).</summary>
    private static async Task<Ok<MarketplaceBoard>> GetBoardAsync(
        Guid workplaceId, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        var approver = member.Can(Permission.ApproveRequests);

        var offers = await db.GiveAways.AsNoTracking().Where(x => x.WorkplaceId == workplaceId && x.Status == GiveAway.Open).ToListAsync(cancellationToken);
        var claims = await db.Claims.AsNoTracking().Where(x => x.WorkplaceId == workplaceId && x.Status == Claim.Pending).ToListAsync(cancellationToken);
        var trades = await db.Trades.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && (x.Status == Trade.Requested || x.Status == Trade.AwaitingApproval))
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(cancellationToken);
        var myClaims = claims.Where(x => x.MembershipId == member.MembershipId).ToList();

        var openShifts = context.Shifts.Values
            .Where(x => x.OpenSlots > 0 && x.Holders.All(h => h.MembershipId != member.MembershipId))
            .OrderBy(x => x.Start)
            .Select(x => new OpenShiftView(Ref(x), x.OpenSlots, myClaims.Any(c => c.ShiftId == x.Id && c.GiveAwayId == null)))
            .ToList();

        var offerViews = offers
            .Where(x => context.Shifts.ContainsKey(x.ShiftId))
            .OrderBy(x => context.Shifts[x.ShiftId].Start)
            .Select(x =>
            {
                var shift = context.Shifts[x.ShiftId];
                var mine = x.FromMembershipId == member.MembershipId;
                var after = shift.Holders.Where(h => h.MembershipId != x.FromMembershipId)
                    .Append(new LedgerPerson(member.MembershipId, member.UserId, member.Level));
                return new OfferView(
                    x.Id,
                    Ref(shift),
                    x.FromMembershipId,
                    context.NameOf(x.FromMembershipId),
                    mine,
                    myClaims.Any(c => c.GiveAwayId == x.Id),
                    // FR-186: a warning, never a block.
                    !mine && !shift.LevelsCoveredBy(after),
                    shift.Holders.Any(h => h.MembershipId == member.MembershipId));
            })
            .ToList();

        var claimViews = approver
            ? claims.Where(x => context.Shifts.ContainsKey(x.ShiftId))
                .OrderBy(x => context.Shifts[x.ShiftId].Start).ThenBy(x => x.CreatedAt)
                .Select(x => new ClaimView(
                    x.Id,
                    Ref(context.Shifts[x.ShiftId]),
                    x.MembershipId,
                    context.NameOf(x.MembershipId),
                    offers.FirstOrDefault(o => o.Id == x.GiveAwayId) is { } offer ? context.NameOf(offer.FromMembershipId) : null))
                .ToList()
            : [];

        var tradeViews = trades
            .Where(x => context.Shifts.ContainsKey(x.AShiftId) && context.Shifts.ContainsKey(x.BShiftId))
            .Where(x => x.AMembershipId == member.MembershipId || x.BMembershipId == member.MembershipId || (approver && x.Status == Trade.AwaitingApproval))
            .Select(x => new TradeView(
                x.Id,
                x.Status,
                x.AMembershipId == member.MembershipId ? "requester" : x.BMembershipId == member.MembershipId ? "coworker" : "approver",
                context.NameOf(x.AMembershipId),
                Ref(context.Shifts[x.AShiftId]),
                context.NameOf(x.BMembershipId),
                Ref(context.Shifts[x.BShiftId]),
                !LevelsHold(context, x)))
            .ToList();

        return TypedResults.Ok(new MarketplaceBoard(context.Rules.ClaimsNeedApproval, context.Rules.TradesNeedApproval, openShifts, offerViews, claimViews, tradeViews));
    }

    /// <summary>Offers a shift the caller holds, any time before it starts (FR-180, FR-182).</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> OfferAsync(
        Guid workplaceId, GiveAwayRequest request, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        if (!context.Shifts.TryGetValue(request.ShiftId, out var shift))
        {
            return Problems.Conflict(ShiftStarted);
        }
        if (shift.Holders.All(x => x.MembershipId != member.MembershipId))
        {
            return Problems.Conflict(NotYourShift);
        }
        if (await db.GiveAways.AnyAsync(x => x.ShiftId == shift.Id && x.FromMembershipId == member.MembershipId && x.Status == GiveAway.Open, cancellationToken))
        {
            return Problems.Conflict(AlreadyOffered);
        }

        db.GiveAways.Add(new GiveAway
        {
            Id = Guid.NewGuid(),
            WorkplaceId = workplaceId,
            ShiftId = shift.Id,
            FromMembershipId = member.MembershipId,
            Status = GiveAway.Open,
            PostedAt = clock.GetCurrentInstant(),
        });
        await db.SaveChangesAsync(cancellationToken);
        await context.NotifyAsync(
            context.Members.Values.Where(x => x.WorksShifts && x.MembershipId != member.MembershipId),
            NotificationTypes.ShiftOffered, shift, member.MembershipId, cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> CancelOfferAsync(
        Guid workplaceId, Guid giveAwayId, HttpContext http, MarketplaceDb db, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var offer = await db.GiveAways.SingleOrDefaultAsync(x => x.Id == giveAwayId && x.WorkplaceId == workplaceId && x.FromMembershipId == member.MembershipId, cancellationToken);
        if (offer is null)
        {
            return Problems.NotFound();
        }
        if (offer.Status != GiveAway.Open)
        {
            return Problems.Conflict(NoLongerPending);
        }
        offer.Status = GiveAway.Cancelled;
        // Requests for an offer that no longer exists have nothing left to ask for.
        await db.Claims.Where(x => x.GiveAwayId == offer.Id && x.Status == Claim.Pending)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.Status, Claim.Cancelled), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// Takes an open slot or an offered shift. With approval off the first claim wins at once; with it on
    /// the claim waits for an admin (FR-184, FR-187). The one hard block is an overlapping shift (FR-185).
    /// </summary>
    private static async Task<Results<Ok<ClaimResult>, ProblemHttpResult>> ClaimAsync(
        Guid workplaceId, ClaimRequest request, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        if (!member.WorksShifts)
        {
            return Problems.Forbidden(NotShiftWorker);
        }
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        GiveAway? offer = null;
        if (request.GiveAwayId is { } giveAwayId)
        {
            offer = await db.GiveAways.SingleOrDefaultAsync(x => x.Id == giveAwayId && x.WorkplaceId == workplaceId, cancellationToken);
            if (offer is null || offer.Status != GiveAway.Open || offer.ShiftId != request.ShiftId)
            {
                return Problems.Conflict(ShiftTaken);
            }
            if (offer.FromMembershipId == member.MembershipId)
            {
                return Problems.Conflict(OwnShift);
            }
        }
        if (!context.Shifts.TryGetValue(request.ShiftId, out var shift))
        {
            return Problems.Conflict(ShiftTaken);
        }
        if (shift.Holders.Any(x => x.MembershipId == member.MembershipId))
        {
            return Problems.Conflict(Overlap);
        }
        if (offer is null && shift.OpenSlots == 0)
        {
            return Problems.Conflict(NothingToClaim);
        }

        if (context.Rules.ClaimsNeedApproval)
        {
            if (await db.Claims.AnyAsync(x => x.ShiftId == shift.Id && x.MembershipId == member.MembershipId && x.Status == Claim.Pending, cancellationToken))
            {
                return Problems.Conflict(AlreadyRequested);
            }
            db.Claims.Add(new Claim
            {
                Id = Guid.NewGuid(),
                WorkplaceId = workplaceId,
                ShiftId = shift.Id,
                MembershipId = member.MembershipId,
                UserId = member.UserId,
                GiveAwayId = offer?.Id,
                Status = Claim.Pending,
                CreatedAt = clock.GetCurrentInstant(),
            });
            await db.SaveChangesAsync(cancellationToken);
            await context.NotifyAsync(context.Approvers, NotificationTypes.ClaimRequested, shift, member.MembershipId, cancellationToken);
            return TypedResults.Ok(new ClaimResult(Applied: false));
        }

        var result = await ledger.TransferAsync(
            workplaceId, shift.Id, offer?.FromMembershipId, new LedgerPerson(member.MembershipId, member.UserId, member.Level), "claim", cancellationToken);
        if (ProblemFor(result) is { } problem)
        {
            return problem;
        }
        if (offer is not null)
        {
            offer.Status = GiveAway.Taken;
            offer.TakenBy = member.MembershipId;
            await db.SaveChangesAsync(cancellationToken);
        }
        var told = context.Approvers.Concat(context.Members.Values.Where(x => x.MembershipId == offer?.FromMembershipId)).DistinctBy(x => x.MembershipId);
        await context.NotifyAsync(told.Where(x => x.MembershipId != member.MembershipId), NotificationTypes.ShiftClaimed, shift, member.MembershipId, cancellationToken);
        return TypedResults.Ok(new ClaimResult(Applied: true));
    }

    /// <summary>Approving one request declines the others for the same slot, in the same step (FR-187).</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> ApproveClaimAsync(
        Guid workplaceId, Guid claimId, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var approver = http.Member();
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        var claim = await db.Claims.SingleOrDefaultAsync(x => x.Id == claimId && x.WorkplaceId == workplaceId, cancellationToken);
        if (claim is null)
        {
            return Problems.NotFound();
        }
        if (claim.Status != Claim.Pending)
        {
            return Problems.Conflict(NoLongerPending);
        }
        var offer = claim.GiveAwayId is { } id ? await db.GiveAways.SingleOrDefaultAsync(x => x.Id == id, cancellationToken) : null;
        if (!context.Members.TryGetValue(claim.MembershipId, out var claimant) || (offer is not null && offer.Status != GiveAway.Open))
        {
            return Problems.Conflict(ShiftTaken);
        }

        var result = await ledger.TransferAsync(
            workplaceId, claim.ShiftId, offer?.FromMembershipId, new LedgerPerson(claimant.MembershipId, claimant.UserId, claimant.Level), "claim", cancellationToken);
        if (ProblemFor(result) is { } problem)
        {
            return problem;
        }

        claim.Status = Claim.Approved;
        claim.DecidedBy = approver.MembershipId;
        if (offer is not null)
        {
            offer.Status = GiveAway.Taken;
            offer.TakenBy = claim.MembershipId;
        }
        // The others wanted the same thing: the same offer, or the last empty slot.
        var shift = await ledger.FindAsync(workplaceId, claim.ShiftId, cancellationToken);
        var rivals = await db.Claims
            .Where(x => x.ShiftId == claim.ShiftId && x.Status == Claim.Pending && x.Id != claim.Id)
            .ToListAsync(cancellationToken);
        var declined = rivals.Where(x => offer is not null ? x.GiveAwayId == offer.Id : x.GiveAwayId == null && (shift?.OpenSlots ?? 0) == 0).ToList();
        foreach (var rival in declined)
        {
            rival.Status = Claim.Declined;
            rival.DecidedBy = approver.MembershipId;
        }
        await db.SaveChangesAsync(cancellationToken);

        if (context.Shifts.TryGetValue(claim.ShiftId, out var before))
        {
            await context.NotifyAsync([claimant], NotificationTypes.ClaimApproved, before, claimant.MembershipId, cancellationToken);
            await context.NotifyAsync(
                context.Members.Values.Where(x => declined.Any(d => d.MembershipId == x.MembershipId)),
                NotificationTypes.ClaimDeclined, before, claimant.MembershipId, cancellationToken);
            if (offer is not null && context.Members.TryGetValue(offer.FromMembershipId, out var giver))
            {
                await context.NotifyAsync([giver], NotificationTypes.ShiftClaimed, before, claimant.MembershipId, cancellationToken);
            }
        }
        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> DeclineClaimAsync(
        Guid workplaceId, Guid claimId, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        var claim = await db.Claims.SingleOrDefaultAsync(x => x.Id == claimId && x.WorkplaceId == workplaceId, cancellationToken);
        if (claim is null)
        {
            return Problems.NotFound();
        }
        if (claim.Status != Claim.Pending)
        {
            return Problems.Conflict(NoLongerPending);
        }
        claim.Status = Claim.Declined;
        claim.DecidedBy = http.Member().MembershipId;
        await db.SaveChangesAsync(cancellationToken);
        if (context.Shifts.TryGetValue(claim.ShiftId, out var shift) && context.Members.TryGetValue(claim.MembershipId, out var claimant))
        {
            await context.NotifyAsync([claimant], NotificationTypes.ClaimDeclined, shift, claimant.MembershipId, cancellationToken);
        }
        return TypedResults.NoContent();
    }

    /// <summary>Strictly one-for-one: one of my published shifts for one of yours (FR-188).</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> RequestTradeAsync(
        Guid workplaceId, TradeRequest request, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        if (!context.Shifts.TryGetValue(request.MyShiftId, out var mine) || !context.Shifts.TryGetValue(request.TheirShiftId, out var theirs)
            || !context.Members.TryGetValue(request.TheirMembershipId, out var coworker) || coworker.MembershipId == member.MembershipId)
        {
            return Problems.Validation(new FieldError(TradeInvalid, "theirShiftId"));
        }
        if (mine.Holders.All(x => x.MembershipId != member.MembershipId))
        {
            return Problems.Conflict(NotYourShift);
        }
        if (theirs.Holders.All(x => x.MembershipId != coworker.MembershipId)
            || theirs.Holders.Any(x => x.MembershipId == member.MembershipId)
            || mine.Holders.Any(x => x.MembershipId == coworker.MembershipId))
        {
            return Problems.Validation(new FieldError(TradeInvalid, "theirShiftId"));
        }
        if (await db.Trades.AnyAsync(
            x => x.AMembershipId == member.MembershipId && x.AShiftId == mine.Id && x.BShiftId == theirs.Id
                && (x.Status == Trade.Requested || x.Status == Trade.AwaitingApproval), cancellationToken))
        {
            return Problems.Conflict(AlreadyRequested);
        }

        var now = clock.GetCurrentInstant();
        db.Trades.Add(new Trade
        {
            Id = Guid.NewGuid(),
            WorkplaceId = workplaceId,
            AMembershipId = member.MembershipId,
            AShiftId = mine.Id,
            BMembershipId = coworker.MembershipId,
            BShiftId = theirs.Id,
            Status = Trade.Requested,
            ExpiresAt = Instant.Min(now + TradeLifetime, Instant.Min(mine.Start, theirs.Start)),
            CreatedAt = now,
        });
        await db.SaveChangesAsync(cancellationToken);
        await context.NotifyAsync([coworker], NotificationTypes.TradeRequested, mine, member.MembershipId, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>Only the coworker who was asked can accept. With approval on, it then waits for an admin (FR-189).</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> AcceptTradeAsync(
        Guid workplaceId, Guid tradeId, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        var trade = await db.Trades.SingleOrDefaultAsync(x => x.Id == tradeId && x.WorkplaceId == workplaceId && x.BMembershipId == member.MembershipId, cancellationToken);
        if (trade is null)
        {
            return Problems.NotFound();
        }
        if (trade.Status != Trade.Requested)
        {
            return Problems.Conflict(NoLongerPending);
        }
        if (context.Rules.TradesNeedApproval)
        {
            trade.Status = Trade.AwaitingApproval;
            await db.SaveChangesAsync(cancellationToken);
            if (context.Shifts.TryGetValue(trade.AShiftId, out var shift))
            {
                await context.NotifyAsync(context.Approvers, NotificationTypes.TradeAwaitingApproval, shift, trade.AMembershipId, cancellationToken);
                await context.NotifyAsync(context.Members.Values.Where(x => x.MembershipId == trade.AMembershipId), NotificationTypes.TradeAccepted, shift, member.MembershipId, cancellationToken);
            }
            return TypedResults.NoContent();
        }
        return await ApplyTradeAsync(context, db, ledger, trade, requireLevels: false, cancellationToken);
    }

    private static Task<Results<NoContent, ProblemHttpResult>> DeclineTradeAsync(
        Guid workplaceId, Guid tradeId, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken) =>
        CloseTradeAsync(workplaceId, tradeId, http, db, ledger, directory, notifier, clock, Trade.Declined, cancellationToken);

    /// <summary>The requester can cancel until the trade is applied (FR-190).</summary>
    private static Task<Results<NoContent, ProblemHttpResult>> CancelTradeAsync(
        Guid workplaceId, Guid tradeId, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken) =>
        CloseTradeAsync(workplaceId, tradeId, http, db, ledger, directory, notifier, clock, Trade.Cancelled, cancellationToken);

    private static Task<Results<NoContent, ProblemHttpResult>> RejectTradeAsync(
        Guid workplaceId, Guid tradeId, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken) =>
        CloseTradeAsync(workplaceId, tradeId, http, db, ledger, directory, notifier, clock, Trade.Rejected, cancellationToken);

    /// <summary>Re-checks everything at the moment of approval, then applies the swap whole or not at all (FR-192).</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> ApproveTradeAsync(
        Guid workplaceId, Guid tradeId, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
    {
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        var trade = await db.Trades.SingleOrDefaultAsync(x => x.Id == tradeId && x.WorkplaceId == workplaceId, cancellationToken);
        if (trade is null)
        {
            return Problems.NotFound();
        }
        if (trade.Status != Trade.AwaitingApproval)
        {
            return Problems.Conflict(NoLongerPending);
        }
        return await ApplyTradeAsync(context, db, ledger, trade, requireLevels: true, cancellationToken);
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> ApplyTradeAsync(
        Context context, MarketplaceDb db, IScheduleLedger ledger, Trade trade, bool requireLevels, CancellationToken cancellationToken)
    {
        var parties = context.Members.Values.Where(x => x.MembershipId == trade.AMembershipId || x.MembershipId == trade.BMembershipId).ToList();
        var result = context.Members.TryGetValue(trade.AMembershipId, out var a) && context.Members.TryGetValue(trade.BMembershipId, out var b)
            ? await ledger.SwapAsync(
                trade.WorkplaceId, trade.AShiftId, new LedgerPerson(a.MembershipId, a.UserId, a.Level),
                trade.BShiftId, new LedgerPerson(b.MembershipId, b.UserId, b.Level), requireLevels, cancellationToken)
            : LedgerResult.Taken;
        var shift = context.Shifts.GetValueOrDefault(trade.AShiftId);

        if (result == LedgerResult.Applied)
        {
            trade.Status = Trade.Applied;
            await db.SaveChangesAsync(cancellationToken);
            if (shift is not null)
            {
                await context.NotifyAsync(parties, NotificationTypes.TradeApplied, shift, trade.AMembershipId, cancellationToken);
            }
            return TypedResults.NoContent();
        }

        // A trade that no longer makes sense is rejected with the reason, never applied in part.
        trade.Status = Trade.Rejected;
        await db.SaveChangesAsync(cancellationToken);
        var problem = ProblemFor(result)!;
        if (shift is not null)
        {
            var reason = result switch { LedgerResult.Overlap => "overlap", LedgerResult.MissingLevel => "missing_level", _ => "stale" };
            await context.NotifyAsync(parties, NotificationTypes.TradeRejected, shift, trade.AMembershipId, cancellationToken, reason);
        }
        return problem;
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> CloseTradeAsync(
        Guid workplaceId, Guid tradeId, HttpContext http, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, string outcome, CancellationToken cancellationToken)
    {
        var member = http.Member();
        var context = await Context.LoadAsync(workplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        var trade = await db.Trades.SingleOrDefaultAsync(x => x.Id == tradeId && x.WorkplaceId == workplaceId, cancellationToken);
        var allowed = trade is not null && outcome switch
        {
            Trade.Declined => trade.BMembershipId == member.MembershipId && trade.Status == Trade.Requested,
            Trade.Cancelled => trade.AMembershipId == member.MembershipId && trade.IsPending,
            _ => trade.Status == Trade.AwaitingApproval,
        };
        if (trade is null || (!allowed && outcome != Trade.Rejected && trade.AMembershipId != member.MembershipId && trade.BMembershipId != member.MembershipId))
        {
            // Nobody else learns the trade exists.
            return Problems.NotFound();
        }
        if (!allowed)
        {
            return Problems.Conflict(NoLongerPending);
        }

        trade.Status = outcome;
        await db.SaveChangesAsync(cancellationToken);
        if (context.Shifts.TryGetValue(trade.AShiftId, out var shift))
        {
            var others = context.Members.Values.Where(x => (x.MembershipId == trade.AMembershipId || x.MembershipId == trade.BMembershipId) && x.MembershipId != member.MembershipId);
            var type = outcome == Trade.Rejected ? NotificationTypes.TradeRejected : NotificationTypes.TradeDeclined;
            await context.NotifyAsync(others, type, shift, member.MembershipId, cancellationToken, outcome == Trade.Rejected ? "declined" : null);
        }
        return TypedResults.NoContent();
    }

    private static bool LevelsHold(Context context, Trade trade)
    {
        if (!context.Members.TryGetValue(trade.AMembershipId, out var a) || !context.Members.TryGetValue(trade.BMembershipId, out var b))
        {
            return false;
        }
        var first = context.Shifts[trade.AShiftId];
        var second = context.Shifts[trade.BShiftId];
        var personA = new LedgerPerson(a.MembershipId, a.UserId, a.Level);
        var personB = new LedgerPerson(b.MembershipId, b.UserId, b.Level);
        return first.LevelsCoveredBy(first.Holders.Where(x => x.MembershipId != a.MembershipId).Append(personB))
            && second.LevelsCoveredBy(second.Holders.Where(x => x.MembershipId != b.MembershipId).Append(personA));
    }

    private static ProblemHttpResult? ProblemFor(LedgerResult result) => result switch
    {
        LedgerResult.Applied => null,
        LedgerResult.Overlap => Problems.Conflict(Overlap),
        LedgerResult.MissingLevel => Problems.Conflict(MissingLevel),
        _ => Problems.Conflict(ShiftTaken),
    };

    private static ShiftRef Ref(LiveShift shift) =>
        new(shift.Id, shift.PeriodId, shift.Date.ToDateOnly(), TimePattern.Format(shift.StartTime), TimePattern.Format(shift.EndTime));

    /// <summary>What every marketplace request starts from: the upcoming published shifts, the people and the approval rules.</summary>
    private sealed class Context
    {
        private readonly INotifier notifier;
        private readonly Guid workplaceId;

        private Context(Guid workplaceId, INotifier notifier, Dictionary<Guid, LiveShift> shifts, Dictionary<Guid, WorkplaceMember> members, WorkplaceRules rules)
        {
            this.workplaceId = workplaceId;
            this.notifier = notifier;
            Shifts = shifts;
            Members = members;
            Rules = rules;
        }

        public Dictionary<Guid, LiveShift> Shifts { get; }

        public Dictionary<Guid, WorkplaceMember> Members { get; }

        public WorkplaceRules Rules { get; }

        public IEnumerable<WorkplaceMember> Approvers => Members.Values.Where(x => x.Can(Permission.ApproveRequests));

        public static async Task<Context> LoadAsync(
            Guid workplaceId, MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock, CancellationToken cancellationToken)
        {
            var shifts = (await ledger.GetUpcomingAsync(workplaceId, cancellationToken)).ToDictionary(x => x.Id);
            var members = (await directory.GetMembersAsync(workplaceId, cancellationToken)).ToDictionary(x => x.MembershipId);
            var template = await directory.GetTemplateAsync(workplaceId, cancellationToken);
            var context = new Context(workplaceId, notifier, shifts, members, template!.Rules);
            await context.ExpireAsync(db, clock, cancellationToken);
            return context;
        }

        public string NameOf(Guid membershipId) => Members.GetValueOrDefault(membershipId)?.DisplayName ?? string.Empty;

        /// <param name="about">Whose name the notification carries ("Sarah is giving away...").</param>
        public Task NotifyAsync(IEnumerable<WorkplaceMember> to, string type, LiveShift shift, Guid about, CancellationToken cancellationToken, string? reason = null)
        {
            var parameters = new Dictionary<string, string>
            {
                ["date"] = LocalDatePattern.Iso.Format(shift.Date),
                ["start"] = TimePattern.Format(shift.StartTime),
                ["end"] = TimePattern.Format(shift.EndTime),
                ["name"] = NameOf(about),
            };
            if (reason is not null)
            {
                parameters["reason"] = reason;
            }
            return notifier.NotifyAsync(
                to.Select(x => new NotificationRequest(workplaceId, x.MembershipId, x.UserId, type, parameters)).ToList(), cancellationToken);
        }

        /// <summary>
        /// Old requests never linger (FR-191, M7-08): a pending trade ends when its time is up, and an offer
        /// or a claim ends when its shift has started. Checked whenever the marketplace is read or used.
        /// </summary>
        private async Task ExpireAsync(MarketplaceDb db, IClock clock, CancellationToken cancellationToken)
        {
            var now = clock.GetCurrentInstant();
            var due = await db.Trades
                .Where(x => x.WorkplaceId == workplaceId && (x.Status == Trade.Requested || x.Status == Trade.AwaitingApproval) && x.ExpiresAt <= now)
                .ToListAsync(cancellationToken);
            foreach (var trade in due)
            {
                trade.Status = Trade.Expired;
            }
            var upcoming = Shifts.Keys.ToList();
            var staleOffers = await db.GiveAways
                .Where(x => x.WorkplaceId == workplaceId && x.Status == GiveAway.Open && !upcoming.Contains(x.ShiftId))
                .ToListAsync(cancellationToken);
            staleOffers.ForEach(x => x.Status = GiveAway.Cancelled);
            var staleClaims = await db.Claims
                .Where(x => x.WorkplaceId == workplaceId && x.Status == Claim.Pending && !upcoming.Contains(x.ShiftId))
                .ToListAsync(cancellationToken);
            staleClaims.ForEach(x => x.Status = Claim.Cancelled);
            if (due.Count + staleOffers.Count + staleClaims.Count > 0)
            {
                await db.SaveChangesAsync(cancellationToken);
            }
        }
    }
}

public sealed record GiveAwayRequest(Guid ShiftId);

/// <param name="GiveAwayId">The offer being taken; null to take an empty slot.</param>
public sealed record ClaimRequest(Guid ShiftId, Guid? GiveAwayId);

/// <param name="Applied">True when the shift is now the caller's; false when the request waits for an admin.</param>
public sealed record ClaimResult(bool Applied);

public sealed record TradeRequest(Guid MyShiftId, Guid TheirShiftId, Guid TheirMembershipId);

public sealed record ShiftRef(Guid Id, Guid PeriodId, DateOnly Date, string Start, string End);

public sealed record MarketplaceBoard(
    bool ClaimsNeedApproval,
    bool TradesNeedApproval,
    IReadOnlyList<OpenShiftView> OpenShifts,
    IReadOnlyList<OfferView> Offers,
    IReadOnlyList<ClaimView> Claims,
    IReadOnlyList<TradeView> Trades);

/// <param name="Requested">The caller already asked for it and is waiting for an admin.</param>
public sealed record OpenShiftView(ShiftRef Shift, int OpenSlots, bool Requested);

/// <param name="Mine">The caller is the one giving it away.</param>
/// <param name="WouldMissLevel">Taking it would leave the shift without its required level: a warning, not a block (FR-186).</param>
/// <param name="OnShift">The caller already works this shift, so cannot take it.</param>
public sealed record OfferView(Guid Id, ShiftRef Shift, Guid FromMembershipId, string FromName, bool Mine, bool Requested, bool WouldMissLevel, bool OnShift);

/// <param name="FromName">Who is giving the shift away; null for an empty slot.</param>
public sealed record ClaimView(Guid Id, ShiftRef Shift, Guid MembershipId, string Name, string? FromName);

/// <param name="Status">"requested" or "awaiting_approval".</param>
/// <param name="Role">The caller's part: "requester", "coworker" or "approver".</param>
/// <param name="WouldMissLevel">Applying it now would leave a shift without its required level (FR-192).</param>
public sealed record TradeView(Guid Id, string Status, string Role, string RequesterName, ShiftRef Gives, string CoworkerName, ShiftRef Gets, bool WouldMissLevel);
