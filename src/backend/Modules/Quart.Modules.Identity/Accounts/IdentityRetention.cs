using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NodaTime;
using Quart.Modules.Identity.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Identity.Accounts;

/// <summary>
/// Nightly cleanup (M6-05): sign-in sessions and one-time links a day after they expired, and accounts whose
/// email was never confirmed, 7 days after sign-up, with everything they had (they could never sign in, so
/// they belong to no workplace). Confirmed accounts stay until their owner deletes them (spec 13). Running it
/// twice deletes nothing more.
/// </summary>
internal sealed class IdentityRetention(IdentityDb db, IClock clock, ILogger<IdentityRetention> logger) : IJobHandler
{
    public const string JobType = "identity.retention";

    public string Type => JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var cutoff = now - Duration.FromDays(Retention.ExpiredSignInDays);
        var sessions = await Retention.InBatchesAsync(
            token => db.Sessions
                .Where(x => db.Sessions.Where(s => s.ExpiresAt < cutoff).OrderBy(s => s.Id).Take(Retention.BatchSize).Select(s => s.Id).Contains(x.Id))
                .ExecuteDeleteAsync(token),
            cancellationToken);
        var links = await Retention.InBatchesAsync(
            token => db.AccountLinks
                .Where(x => db.AccountLinks.Where(l => l.ExpiresAt < cutoff).OrderBy(l => l.Id).Take(Retention.BatchSize).Select(l => l.Id).Contains(x.Id))
                .ExecuteDeleteAsync(token),
            cancellationToken);
        var signedUpBefore = now - Duration.FromDays(Retention.UnconfirmedAccountDays);
        var unconfirmed = await Retention.InBatchesAsync(
            async token =>
            {
                var ids = await db.Users
                    // Not while a confirmation link sent since still works: they may be opening it right now.
                    .Where(x => !x.EmailConfirmed && x.CreatedAt < signedUpBefore && !db.AccountLinks.Any(l => l.UserId == x.Id && l.ExpiresAt > now))
                    .OrderBy(x => x.Id).Take(Retention.BatchSize).Select(x => x.Id)
                    .ToListAsync(token);
                await db.AccountLinks.Where(x => ids.Contains(x.UserId)).ExecuteDeleteAsync(token);
                await db.Sessions.Where(x => ids.Contains(x.UserId)).ExecuteDeleteAsync(token);
                // Claims, logins and tokens go with the row (cascade).
                return await db.Users.Where(x => ids.Contains(x.Id)).ExecuteDeleteAsync(token);
            },
            cancellationToken);
        logger.LogInformation(
            "Retention: deleted {Sessions} expired sessions, {Links} one-time links and {Accounts} unconfirmed accounts",
            sessions.Deleted, links.Deleted, unconfirmed.Deleted);
        return JobOutcome.RunAgain(sessions.More || links.More || unconfirmed.More ? now : Retention.NextNight(now));
    }
}
