using NodaTime;
using Quart.SharedKernel.Directory;

namespace Quart.Modules.Scheduling.Periods;

/// <summary>One shift the template gives a date: a weekly shift, as changed that day, or a shift added for that day.</summary>
/// <param name="SourceId">The template shift, or for a shift added on that day the change that added it (M4-01).</param>
internal sealed record TemplateShift(
    LocalDate Date,
    Guid SourceId,
    string? Name,
    LocalTime Start,
    LocalTime End,
    int Headcount,
    IReadOnlyList<TemplateRequirement> Requirements);

/// <summary>
/// The shifts the generator rules give each date of a period (AD-010): the weekly shifts that run on its weekday,
/// with "Edit a specific day" applied for its week of the period (M4-01). The one place that reads day changes.
/// </summary>
internal static class TemplateShifts
{
    /// <summary>Week 1 to 4 of the period that <paramref name="date"/> falls in.</summary>
    public static int WeekOf(LocalDate periodStart, LocalDate date) => (NodaTime.Period.DaysBetween(periodStart, date) / 7) + 1;

    public static IEnumerable<TemplateShift> ForDate(WorkplaceTemplate template, LocalDate periodStart, LocalDate date)
    {
        var week = WeekOf(periodStart, date);
        var changes = (template.DayChanges ?? []).Where(x => x.Week == week && x.Day == date.DayOfWeek).ToList();
        foreach (var block in template.Blocks.Where(block => block.Days.Contains(date.DayOfWeek)))
        {
            var change = changes.FirstOrDefault(x => x.BlockId == block.Id);
            if (change?.Kind == TemplateDayChange.Removed)
            {
                continue;
            }
            var moved = change?.Kind == TemplateDayChange.Changed;
            yield return new TemplateShift(
                date,
                block.Id,
                block.Name,
                moved ? change!.Start!.Value : block.Start,
                moved ? change!.End!.Value : block.End,
                block.Headcount,
                block.Requirements);
        }
        foreach (var added in changes.Where(x => x.Kind == TemplateDayChange.Added))
        {
            yield return new TemplateShift(date, added.Id, added.Name, added.Start!.Value, added.End!.Value, added.Headcount, added.Requirements);
        }
    }

    /// <summary>
    /// Day changes a period opened from <paramref name="lastOpenedAt"/> on already used: saved before it opened, and
    /// within the weeks of the new period. Opening asks before using them again (M4-01, 2026-11-23).
    /// </summary>
    public static IReadOnlyList<TemplateDayChange> UsedBefore(WorkplaceTemplate template, int weeks, Instant? lastOpenedAt) =>
        lastOpenedAt is not { } since
            ? []
            : (template.DayChanges ?? []).Where(x => x.Week <= weeks && x.SavedAt < since).ToList();
}
