using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Workplaces.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;

namespace Quart.Modules.Workplaces;

/// <summary>
/// "Edit a specific day" in Edit Generator (M4-01, 2026-11-23): changes to the shifts of one day of the week, in
/// one week of the period, for every period opened afterwards. The Editing Shift page has one Save button, so
/// the changes are read and saved as one list, all or nothing. They never touch a period already open.
/// </summary>
internal static class DayChangeEndpoints
{
    public const string DayInvalid = "template.day_invalid";
    public const string DayBlockUnknown = "template.day_block_unknown";
    public const string DayDuplicate = "template.day_duplicate";
    public const string TooManyDayChanges = "template.too_many_day_changes";

    /// <summary>Four weeks of seven days, with room for several changes a day.</summary>
    public const int MaxChanges = 300;

    public static void MapDayChanges(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/generator/days");
        group.MapGet("/", GetAsync).RequirePermission(Permission.ManageTemplate).WithName("GetDayChanges");
        group.MapPut("/", SaveAsync).RequirePermission(Permission.ManageTemplate).WithName("SaveDayChanges");
    }

    private static async Task<Ok<DayChanges>> GetAsync(Guid workplaceId, WorkplacesDb db, CancellationToken cancellationToken)
    {
        var changes = await db.DayChanges.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId)
            .OrderBy(x => x.Week).ThenBy(x => x.Day).ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(new DayChanges(changes.Select(ToSetup).ToList()));
    }

    /// <summary>
    /// Replaces every day change. A change saved again unchanged keeps the time it was first saved, so opening a
    /// period can tell the changes a previous period already used from the new ones.
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> SaveAsync(
        Guid workplaceId, DayChanges request, WorkplacesDb db, IClock clock, CancellationToken cancellationToken)
    {
        var memberIds = (await db.Memberships.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && x.LeftAt == null)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken)).ToHashSet();
        var blocks = await db.ShiftBlocks.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId)
            .ToDictionaryAsync(x => x.Id, x => x.Days, cancellationToken);
        var (errors, parsed) = Validate(request, blocks, memberIds);
        if (errors.Count > 0)
        {
            return Problems.Validation(errors);
        }

        // A change saved again as it was keeps its row: its ID (which an added shift's dated shifts and pairs point
        // to) and when it was first saved.
        var unmatched = (await db.DayChanges.Where(x => x.WorkplaceId == workplaceId).ToListAsync(cancellationToken))
            .GroupBy(Fingerprint)
            .ToDictionary(x => x.Key, x => new Queue<DayChange>(x));
        var now = clock.GetCurrentInstant();
        foreach (var change in parsed)
        {
            if (unmatched.TryGetValue(Fingerprint(change), out var same) && same.Count > 0)
            {
                same.Dequeue();
                continue;
            }
            change.Id = Guid.NewGuid();
            change.WorkplaceId = workplaceId;
            change.SavedAt = now;
            db.DayChanges.Add(change);
        }
        db.DayChanges.RemoveRange(unmatched.Values.SelectMany(x => x));
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    internal static (List<FieldError> Errors, List<DayChange> Changes) Validate(
        DayChanges request, IReadOnlyDictionary<Guid, int[]> blocks, IReadOnlySet<Guid> memberIds)
    {
        var errors = new List<FieldError>();
        var parsed = new List<DayChange>();
        var list = request.Changes ?? [];
        if (list.Count > MaxChanges)
        {
            errors.Add(new FieldError(TooManyDayChanges, "changes"));
            return (errors, parsed);
        }

        var touched = new HashSet<(int, int, Guid)>();
        for (var i = 0; i < list.Count; i++)
        {
            var item = list[i];
            var path = $"changes[{i}]";
            if (item.Week is < 1 or > 4 || item.Day is < 1 or > 7 || item.Kind is not (DayChange.Changed or DayChange.Removed or DayChange.Added))
            {
                errors.Add(new FieldError(DayInvalid, path));
                continue;
            }

            if (item.Kind == DayChange.Added)
            {
                var block = new BlockSetup(null, [item.Day], item.Start ?? string.Empty, item.End ?? string.Empty, item.Headcount ?? 0, item.Requirements, item.Conflicts, item.Name);
                if (TemplateEndpoints.ValidateBlock(block, path, memberIds, errors) is { } times)
                {
                    parsed.Add(new DayChange
                    {
                        Week = item.Week,
                        Day = item.Day,
                        Kind = DayChange.Added,
                        StartTime = times.Start,
                        EndTime = times.End,
                        Name = TemplateEndpoints.CleanName(item.Name),
                        Headcount = block.Headcount,
                        Requirements = JsonSerializer.Serialize((item.Requirements ?? []).OrderBy(x => x.Level).ToList(), JsonSerializerOptions.Web),
                        Conflicts = JsonSerializer.Serialize((item.Conflicts ?? []).Select(TemplateEndpoints.Ordered).Distinct().ToList(), JsonSerializerOptions.Web),
                    });
                }
                continue;
            }

            // A change to a template shift names a shift that runs on that weekday.
            if (item.BlockId is not { } blockId || !blocks.TryGetValue(blockId, out var days) || !days.Contains(item.Day))
            {
                errors.Add(new FieldError(DayBlockUnknown, $"{path}.blockId"));
                continue;
            }
            if (!touched.Add((item.Week, item.Day, blockId)))
            {
                errors.Add(new FieldError(DayDuplicate, path));
                continue;
            }
            var change = new DayChange { Week = item.Week, Day = item.Day, Kind = item.Kind, BlockId = blockId };
            if (item.Kind == DayChange.Changed)
            {
                if (TemplateEndpoints.ValidateTimes(item.Start, item.End, path, errors) is not { } times)
                {
                    continue;
                }
                change.StartTime = times.Start;
                change.EndTime = times.End;
            }
            parsed.Add(change);
        }
        return (errors, parsed);
    }

    private static string Fingerprint(DayChange x) =>
        string.Join('|', x.Week, x.Day, x.Kind, x.BlockId, x.StartTime, x.EndTime, x.Name, x.Headcount, x.Requirements, x.Conflicts);

    internal static DayChangeSetup ToSetup(DayChange x) => new(
        x.Id,
        x.Week,
        x.Day,
        x.Kind,
        x.BlockId,
        x.StartTime is { } start ? TemplateEndpoints.TimePattern.Format(start) : null,
        x.EndTime is { } end ? TemplateEndpoints.TimePattern.Format(end) : null,
        x.Name,
        x.Kind == DayChange.Added ? x.Headcount : null,
        RequirementsOf(x),
        ConflictsOf(x),
        x.SavedAt.ToDateTimeOffset());

    internal static List<RequirementSetup> RequirementsOf(DayChange x) =>
        JsonSerializer.Deserialize<List<RequirementSetup>>(x.Requirements, JsonSerializerOptions.Web) ?? [];

    internal static List<ConflictSetup> ConflictsOf(DayChange x) =>
        JsonSerializer.Deserialize<List<ConflictSetup>>(x.Conflicts, JsonSerializerOptions.Web) ?? [];
}

/// <summary>Every "Edit a specific day" change of the workplace (M4-01).</summary>
public sealed record DayChanges(IReadOnlyList<DayChangeSetup>? Changes);

/// <summary>One change to one day of the week, in one week of the period.</summary>
/// <param name="Id">Given when read; ignored when saving (a change saved as it was keeps its ID).</param>
/// <param name="Week">Week of the period, 1 to 4.</param>
/// <param name="Day">ISO weekday, 1 for Monday to 7 for Sunday.</param>
/// <param name="Kind">"changed" (a template shift's hours that day), "removed" (not that day) or "added" (a shift of that day only).</param>
/// <param name="BlockId">The template shift changed or removed; null for an added shift.</param>
/// <param name="Start">"HH:mm" on a 15-minute grid; null for a removed shift.</param>
/// <param name="Name">An added shift's name; null for none or for the other kinds.</param>
/// <param name="Headcount">An added shift's people needed; null for the other kinds.</param>
/// <param name="SavedAt">When the change was first saved as it is; ignored when saving.</param>
public sealed record DayChangeSetup(
    Guid? Id,
    int Week,
    int Day,
    string Kind,
    Guid? BlockId,
    string? Start,
    string? End,
    string? Name,
    int? Headcount,
    IReadOnlyList<RequirementSetup>? Requirements,
    IReadOnlyList<ConflictSetup>? Conflicts,
    DateTimeOffset? SavedAt = null);
