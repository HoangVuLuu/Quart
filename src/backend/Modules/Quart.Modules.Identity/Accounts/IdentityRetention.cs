using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NodaTime;
using Quart.Modules.Identity.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Identity.Accounts;

/// <summary>
/// Nightly cleanup (M6-05): sign-in sessions and one-time links a day after they expired. Accounts stay until
/// their owner deletes them (spec 13). Running it twice deletes nothing more.
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
        logger.LogInformation("Retention: deleted {Sessions} expired sessions and {Links} one-time links", sessions.Deleted, links.Deleted);
        return JobOutcome.RunAgain(sessions.More || links.More ? now : Retention.NextNight(now));
    }
}
