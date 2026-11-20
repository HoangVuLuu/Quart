using NodaTime;

namespace Quart.SharedKernel;

/// <summary>
/// How long Quart keeps each kind of data (spec section 13, M6-05, AD-029). The nightly cleanup jobs read
/// their periods from here, <see cref="Table"/> mirrors the spec's table word for word (a test keeps the two
/// in sync), and the privacy page (task 6.2) will show the same table.
/// </summary>
public static class Retention
{
    /// <summary>In-app alerts, from when they were created.</summary>
    public const int NotificationDays = 60;

    /// <summary>Raw availability and the notes sent with it, from the day after the period's last day.</summary>
    public const int AvailabilityDaysAfterPeriodEnds = 60;

    /// <summary>
    /// A period and everything in it (shifts, who worked them, versions, generation runs), from the day after
    /// its last day. Calendar months, so a period ending 31 March goes on 1 June.
    /// </summary>
    public const int ScheduleMonthsAfterPeriodEnds = 2;

    // Housekeeping, not personal records (section 13, "Housekeeping").

    /// <summary>Emails in the outbox: their address and template, after sending or failing for good.</summary>
    public const int EmailDays = 7;

    /// <summary>Sign-in sessions and one-time links, once expired or used.</summary>
    public const int ExpiredSignInDays = 1;

    /// <summary>Give-aways, claims and trades that are over, and the record of which ones someone opened.</summary>
    public const int FinishedRequestDays = 60;

    /// <summary>Any give-away, claim or trade, even one never closed: its shift and its schedule are long gone.</summary>
    public const int AnyRequestDays = 120;

    /// <summary>Background jobs that finished or failed for good. Their payloads hold IDs only.</summary>
    public const int FinishedJobDays = 30;

    /// <summary>
    /// Section 13's table, as written there. Rows without a number are kept until someone acts, or are not
    /// built yet (announcements, audit events, payslips).
    /// </summary>
    public static IReadOnlyList<(string Data, string Kept)> Table { get; } =
    [
        ("Announcements and their photos", "until an admin deletes them"),
        ("Notifications", $"{NotificationDays} days"),
        ("Raw availability submissions", $"{AvailabilityDaysAfterPeriodEnds} days after the period ends"),
        ("Availability comments", $"{AvailabilityDaysAfterPeriodEnds} days after the period ends"),
        ("Published schedules", $"{ScheduleMonthsAfterPeriodEnds} months after the period ends"),
        ("Audit events", "2 months"),
        ("Generation runs (seed, score)", $"{ScheduleMonthsAfterPeriodEnds} months after the period ends"),
        ("Payslips (backlog)", "to be decided before build (Q-11)"),
        ("Payslip access log (backlog)", "12 months, so incidents can be investigated"),
        ("Accounts", "until deleted by the user"),
    ];

    /// <summary>Deleted per statement; a run stops after <see cref="MaxBatches"/> and the next tick goes on.</summary>
    public const int BatchSize = 1000;

    public const int MaxBatches = 20;

    /// <summary>The cleanup runs at night in Montreal, when nobody is building a schedule.</summary>
    public static DateTimeZone Zone { get; } = DateTimeZoneProviders.Tzdb["America/Toronto"];

    public static LocalTime RunsAt { get; } = new(3, 0);

    /// <summary>The next 03:00 in Montreal strictly after <paramref name="now"/>.</summary>
    public static Instant NextNight(Instant now)
    {
        var local = now.InZone(Zone);
        var date = local.TimeOfDay < RunsAt ? local.Date : local.Date.PlusDays(1);
        return date.At(RunsAt).InZoneLeniently(Zone).ToInstant();
    }

    /// <summary>
    /// Runs <paramref name="deleteBatch"/> (one statement deleting at most <see cref="BatchSize"/> rows) until it
    /// deletes fewer, or <see cref="MaxBatches"/> times.
    /// </summary>
    /// <returns>How many rows went, and whether rows may remain for the next run.</returns>
    public static async Task<(int Deleted, bool More)> InBatchesAsync(Func<CancellationToken, Task<int>> deleteBatch, CancellationToken cancellationToken)
    {
        var total = 0;
        for (var i = 0; i < MaxBatches; i++)
        {
            var deleted = await deleteBatch(cancellationToken);
            total += deleted;
            if (deleted < BatchSize)
            {
                return (total, false);
            }
        }
        return (total, true);
    }
}
