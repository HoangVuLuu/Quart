using System.Text.Json;
using NodaTime;
using NodaTime.Text;
using Quart.Modules.Scheduling.Periods;
using Quart.Modules.Scheduling.Persistence;

namespace Quart.Modules.Scheduling;

using Period = Persistence.Period;

/// <summary>Small conversions shared by the module's endpoints: NodaTime inside, plain dates and "HH:mm" at the edge (AD-028).</summary>
internal static class Support
{
    private static readonly LocalTimePattern TimePattern = LocalTimePattern.CreateWithInvariantCulture("HH:mm");

    public static string Time(LocalTime time) => TimePattern.Format(time);

    public static string IsoDate(LocalDate date) => LocalDatePattern.Iso.Format(date);

    public static LocalDate Today(IClock clock, string timeZone) =>
        clock.GetCurrentInstant().InZone(DateTimeZoneProviders.Tzdb[timeZone]).Date;

    /// <summary>
    /// The instant a local date and time falls on. A time skipped by the spring clock change moves forward,
    /// and a repeated one takes the earlier instant, so a 16:00 shift is 16:00 on both sides (AD-028).
    /// </summary>
    public static Instant InstantOf(LocalDate date, LocalTime time, DateTimeZone zone) =>
        date.At(time).InZoneLeniently(zone).ToInstant();

    public static PeriodSummary Summarize(Period period) =>
        new(
            period.Id,
            period.StartDate.ToDateOnly(),
            period.EndDate.ToDateOnly(),
            period.Weeks,
            period.Status,
            period.Version,
            period.LockedAt is not null,
            period.Version == 0 && period.DraftSavedAt is not null,
            period.AvailabilityDueAt?.ToDateTimeOffset(),
            period.RequestAt?.ToDateTimeOffset(),
            period.RequestAt is null || period.StepsDone.Contains(AvailabilitySteps.Request));

    public static PeriodRules RulesOf(Period period) =>
        JsonSerializer.Deserialize<PeriodRules>(period.Rules, JsonSerializerOptions.Web)
        ?? new PeriodRules(3, true, true, []);
}
