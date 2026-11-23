using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Marketplace.Persistence;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Notifications;
using Quart.SharedKernel.Scheduling;

namespace Quart.Modules.Marketplace;

/// <summary>
/// The Trade board's timed work (M7-05, M7-08). Reading the board still ends old requests on its own (jobs can be
/// late); these make sure the people hear in time even when nobody opens it. Both are safe to run twice.
/// </summary>
internal static class MarketplaceJobs
{
    public const string OfferUnclaimed = "marketplace.offer_unclaimed";
    public const string TradeExpiry = "marketplace.trade_expiry";

    /// <summary>FR-183 (Hoang, 2026-11-23): 36 hours before the shift, always; there is no setting.</summary>
    public static readonly Duration UnclaimedLead = Duration.FromHours(36);

    /// <summary>A shift offered later than that is checked this long after it was offered, if it has not started.</summary>
    public static readonly Duration LateOfferGrace = Duration.FromHours(2);

    public sealed record OfferPayload(Guid GiveAwayId);

    public sealed record TradePayload(Guid TradeId);

    /// <summary>When to check whether an offer is still untaken; null when the shift starts before that could help.</summary>
    public static Instant? UnclaimedCheckAt(Instant shiftStart, Instant offeredAt)
    {
        var at = Instant.Max(shiftStart - UnclaimedLead, offeredAt + LateOfferGrace);
        return at < shiftStart ? at : null;
    }
}

/// <summary>Still untaken 36 hours before: the managers and the person giving it away hear it, once (FR-183, M7-05).</summary>
internal sealed class OfferUnclaimedHandler(
    MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock) : IJobHandler
{
    public string Type => MarketplaceJobs.OfferUnclaimed;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var id = job.ReadPayload<MarketplaceJobs.OfferPayload>().GiveAwayId;
        if (await db.GiveAways.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken) is not { } found)
        {
            return JobOutcome.Done;
        }
        // Loading the board first closes an offer whose shift its giver no longer holds.
        var context = await MarketplaceEndpoints.Context.LoadAsync(found.WorkplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        var offer = await db.GiveAways.SingleAsync(x => x.Id == id, cancellationToken);
        if (offer.Status != GiveAway.Open || offer.UnclaimedAlertedAt is not null || !context.Shifts.TryGetValue(offer.ShiftId, out var shift))
        {
            return JobOutcome.Done;
        }
        // Marked before telling, so a second run tells nobody.
        offer.UnclaimedAlertedAt = clock.GetCurrentInstant();
        await db.SaveChangesAsync(cancellationToken);
        var giver = context.Members.Values.Where(x => x.MembershipId == offer.FromMembershipId).ToList();
        await context.NotifyAsync(giver, NotificationTypes.ShiftUnclaimedMine, shift, offer.FromMembershipId, cancellationToken);
        await context.NotifyAsync(
            context.Approvers.Where(x => x.MembershipId != offer.FromMembershipId),
            NotificationTypes.ShiftUnclaimed, shift, offer.FromMembershipId, cancellationToken);
        return JobOutcome.Done;
    }
}

/// <summary>A trade nobody answered ends on time, and both people are told (FR-191, M7-08).</summary>
internal sealed class TradeExpiryHandler(
    MarketplaceDb db, IScheduleLedger ledger, IWorkplaceDirectory directory, INotifier notifier, IClock clock) : IJobHandler
{
    public string Type => MarketplaceJobs.TradeExpiry;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var id = job.ReadPayload<MarketplaceJobs.TradePayload>().TradeId;
        if (await db.Trades.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken) is { } trade)
        {
            // Loading the board ends every trade whose time is up and tells both people; a trade already ended
            // is left alone, so running twice tells nobody twice.
            await MarketplaceEndpoints.Context.LoadAsync(trade.WorkplaceId, db, ledger, directory, notifier, clock, cancellationToken);
        }
        return JobOutcome.Done;
    }
}
