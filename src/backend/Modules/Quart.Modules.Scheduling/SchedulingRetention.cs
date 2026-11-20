using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NodaTime;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Scheduling;

/// <summary>
/// Nightly cleanup (spec 13, M6-05). Counted from the day after a period's last day, in its own time zone:
/// availability and its notes go after 60 days; the whole period (shifts, who worked them, published versions,
/// generation runs) after 2 calendar months, published or not. Nobody keeps a schedule longer unless they saved
/// one themselves (decision log, 2026-11-17).
/// </summary>
internal sealed class SchedulingRetention(SchedulingDb db, IClock clock, ILogger<SchedulingRetention> logger) : IJobHandler
{
    public const string JobType = "scheduling.retention";

    /// <summary>Periods handled per run; the next tick goes on with the rest.</summary>
    private const int MaxPeriods = 50;

    public string Type => JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        // Few rows: a workplace keeps about three months of periods, and fewer once this has run.
        var candidates = await db.Periods.AsNoTracking()
            .OrderBy(x => x.StartDate)
            .Select(x => new { x.Id, x.StartDate, x.Weeks, x.TimeZone })
            .ToListAsync(cancellationToken);

        int periods = 0, availability = 0, handled = 0;
        foreach (var period in candidates)
        {
            var today = now.InZone(DateTimeZoneProviders.Tzdb[period.TimeZone]).Date;
            var ended = period.StartDate.PlusDays((period.Weeks * 7) - 1);
            if (ended.PlusMonths(Retention.ScheduleMonthsAfterPeriodEnds) < today)
            {
                await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
                await db.ScheduleVersions.Where(x => x.PeriodId == period.Id).ExecuteDeleteAsync(cancellationToken);
                await db.GenerationRuns.Where(x => x.PeriodId == period.Id).ExecuteDeleteAsync(cancellationToken);
                // The rest goes with the period: shifts and their assignments, availability and its notes, conflicts.
                await db.Periods.Where(x => x.Id == period.Id).ExecuteDeleteAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                periods++;
            }
            else if (ended.PlusDays(Retention.AvailabilityDaysAfterPeriodEnds) < today)
            {
                // Chosen shifts and notes go with their row (cascade).
                var deleted = await db.Availabilities.Where(x => x.PeriodId == period.Id).ExecuteDeleteAsync(cancellationToken);
                if (deleted == 0)
                {
                    continue;
                }
                availability += deleted;
            }
            else
            {
                continue;
            }
            if (++handled == MaxPeriods)
            {
                break;
            }
        }

        logger.LogInformation("Retention: deleted {Periods} periods and the availability of {Availability} people", periods, availability);
        return JobOutcome.RunAgain(handled == MaxPeriods ? now : Retention.NextNight(now));
    }
}
