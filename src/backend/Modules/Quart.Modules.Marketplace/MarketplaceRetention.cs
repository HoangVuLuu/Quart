using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NodaTime;
using Quart.Modules.Marketplace.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Marketplace;

/// <summary>
/// Nightly cleanup (M6-05): give-aways, claims and trades 60 days after they ended, and any of them still open
/// after <see cref="Retention.AnyRequestDays"/> days, whose shift has long passed and whose schedule is gone.
/// The record of what someone opened on the Trade tab goes after 60 days too.
/// </summary>
internal sealed class MarketplaceRetention(MarketplaceDb db, IClock clock, ILogger<MarketplaceRetention> logger) : IJobHandler
{
    public const string JobType = "marketplace.retention";

    public string Type => JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var finishedBefore = now - Duration.FromDays(Retention.FinishedRequestDays);
        var anyBefore = now - Duration.FromDays(Retention.AnyRequestDays);

        // Claims first: one can point at a give-away.
        var claims = await Retention.InBatchesAsync(
            token => db.Claims
                .Where(x => db.Claims
                    .Where(c => c.CreatedAt < anyBefore || (c.CreatedAt < finishedBefore && c.Status != Claim.Pending))
                    .OrderBy(c => c.Id).Take(Retention.BatchSize).Select(c => c.Id).Contains(x.Id))
                .ExecuteDeleteAsync(token),
            cancellationToken);
        var offers = await Retention.InBatchesAsync(
            token => db.GiveAways
                .Where(x => db.GiveAways
                    .Where(g => (g.PostedAt < anyBefore || (g.PostedAt < finishedBefore && g.Status != GiveAway.Open))
                        && !db.Claims.Any(c => c.GiveAwayId == g.Id))
                    .OrderBy(g => g.Id).Take(Retention.BatchSize).Select(g => g.Id).Contains(x.Id))
                .ExecuteDeleteAsync(token),
            cancellationToken);
        var trades = await Retention.InBatchesAsync(
            token => db.Trades
                .Where(x => db.Trades
                    .Where(t => t.CreatedAt < anyBefore
                        || (t.CreatedAt < finishedBefore && t.Status != Trade.Requested && t.Status != Trade.AwaitingApproval))
                    .OrderBy(t => t.Id).Take(Retention.BatchSize).Select(t => t.Id).Contains(x.Id))
                .ExecuteDeleteAsync(token),
            cancellationToken);
        var seen = await Retention.InBatchesAsync(
            token => db.SeenItems.Where(x => x.SeenAt < finishedBefore).Take(Retention.BatchSize).ExecuteDeleteAsync(token),
            cancellationToken);
        logger.LogInformation(
            "Retention: deleted {Claims} claims, {GiveAways} give-aways, {Trades} trades and {Seen} seen marks",
            claims.Deleted, offers.Deleted, trades.Deleted, seen.Deleted);
        var more = claims.More || offers.More || trades.More || seen.More;
        return JobOutcome.RunAgain(more ? now : Retention.NextNight(now));
    }
}
