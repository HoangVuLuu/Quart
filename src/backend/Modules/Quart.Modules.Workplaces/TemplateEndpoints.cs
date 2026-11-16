using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using NodaTime.Text;
using Quart.Modules.Workplaces.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;

namespace Quart.Modules.Workplaces;

/// <summary>
/// The Edit Generator page (M3): scheduling rules on the General tab, and the weekly grid of shift blocks
/// with headcount, level requirements and "cannot work together" pairs on the Per Day tab. The page has
/// one Save button, so it is read and saved as one document, all or nothing.
/// </summary>
internal static class TemplateEndpoints
{
    public const string PeriodWeeksInvalid = "settings.period_weeks_invalid";
    public const string MaxConsecutiveInvalid = "settings.max_consecutive_invalid";
    public const string TimeInvalid = "template.time_invalid";
    public const string OffGrid = "template.off_grid";
    public const string CrossesMidnight = "template.crosses_midnight";
    public const string NoDays = "template.no_days";
    public const string HeadcountInvalid = "template.headcount_invalid";
    public const string RequirementInvalid = "template.requirement_invalid";
    public const string RequirementExceedsHeadcount = "template.requirement_exceeds_headcount";
    public const string ConflictInvalid = "template.conflict_invalid";
    public const string ConflictDuplicate = "template.conflict_duplicate";
    public const string TooManyBlocks = "template.too_many_blocks";

    public const int MaxBlocks = 20;
    public const int MaxHeadcount = 20;

    private static readonly LocalTimePattern TimePattern = LocalTimePattern.CreateWithInvariantCulture("HH:mm");

    public static void MapTemplate(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/generator");
        group.MapGet("/", GetAsync).RequirePermission(Permission.ManageTemplate).WithName("GetGeneratorSetup");
        group.MapPut("/", SaveAsync).RequirePermission(Permission.ManageTemplate).WithName("SaveGeneratorSetup");
    }

    private static async Task<Ok<GeneratorSetup>> GetAsync(Guid workplaceId, WorkplacesDb db, CancellationToken cancellationToken)
    {
        var workplace = await db.Workplaces.AsNoTracking().SingleAsync(x => x.Id == workplaceId, cancellationToken);
        var settings = WorkplaceReader.ReadSettings(workplace);
        var blocks = await db.ShiftBlocks.AsNoTracking()
            .Include(x => x.Requirements)
            .Include(x => x.Conflicts)
            .Where(x => x.WorkplaceId == workplaceId)
            .OrderBy(x => x.StartTime).ThenBy(x => x.EndTime)
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(new GeneratorSetup(
            settings.PeriodWeeks,
            settings.LimitConsecutiveShifts ? settings.MaxConsecutiveShifts : null,
            settings.OpeningFairness,
            settings.ClosingFairness,
            blocks.Select(block => new BlockSetup(
                block.Id,
                block.Days.Order().ToList(),
                TimePattern.Format(block.StartTime),
                TimePattern.Format(block.EndTime),
                block.Headcount,
                block.Requirements.OrderBy(x => x.Level).Select(x => new RequirementSetup(x.Level, x.MinCount)).ToList(),
                block.Conflicts.Select(x => new ConflictSetup(x.MembershipA, x.MembershipB)).ToList())).ToList()));
    }

    /// <summary>
    /// Replaces the rules and the template. Blocks keep their ID when the request names it, so periods
    /// already created still point at the block they were copied from. Saving never touches a period
    /// that already exists (FR-068).
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> SaveAsync(
        Guid workplaceId, GeneratorSetup request, WorkplacesDb db, CancellationToken cancellationToken)
    {
        var memberIds = await db.Memberships.AsNoTracking()
            .Where(x => x.WorkplaceId == workplaceId && x.LeftAt == null)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);
        var (errors, parsed) = Validate(request, memberIds.ToHashSet());
        if (errors.Count > 0)
        {
            return Problems.Validation(errors);
        }

        var workplace = await db.Workplaces.SingleAsync(x => x.Id == workplaceId, cancellationToken);
        var settings = WorkplaceReader.ReadSettings(workplace);
        settings.PeriodWeeks = request.PeriodWeeks;
        settings.LimitConsecutiveShifts = request.MaxConsecutiveShifts is not null;
        settings.MaxConsecutiveShifts = request.MaxConsecutiveShifts ?? settings.MaxConsecutiveShifts;
        settings.OpeningFairness = request.OpeningFairness;
        settings.ClosingFairness = request.ClosingFairness;
        workplace.Settings = WorkplaceReader.WriteSettings(settings);

        var existing = await db.ShiftBlocks
            .Include(x => x.Requirements)
            .Include(x => x.Conflicts)
            .Where(x => x.WorkplaceId == workplaceId)
            .ToListAsync(cancellationToken);
        var kept = new HashSet<Guid>();
        foreach (var (setup, start, end) in parsed)
        {
            var block = setup.Id is { } id ? existing.SingleOrDefault(x => x.Id == id) : null;
            if (block is null)
            {
                block = new ShiftBlock { Id = Guid.NewGuid(), WorkplaceId = workplaceId, Days = [] };
                db.ShiftBlocks.Add(block);
            }
            kept.Add(block.Id);
            block.Days = setup.Days.Distinct().Order().ToArray();
            block.StartTime = start;
            block.EndTime = end;
            block.Headcount = setup.Headcount;
            block.Requirements.Clear();
            block.Requirements.AddRange((setup.Requirements ?? []).Select(x => new ShiftBlockRequirement { Id = Guid.NewGuid(), Level = x.Level, MinCount = x.MinCount }));
            block.Conflicts.Clear();
            block.Conflicts.AddRange((setup.Conflicts ?? []).Select(x => Ordered(x)).Distinct()
                .Select(x => new ShiftBlockConflict { Id = Guid.NewGuid(), MembershipA = x.MembershipA, MembershipB = x.MembershipB }));
        }
        db.ShiftBlocks.RemoveRange(existing.Where(x => !kept.Contains(x.Id)));

        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    internal static (List<FieldError> Errors, List<(BlockSetup Setup, LocalTime Start, LocalTime End)> Blocks) Validate(GeneratorSetup request, IReadOnlySet<Guid> memberIds)
    {
        var errors = new List<FieldError>();
        var parsed = new List<(BlockSetup, LocalTime, LocalTime)>();
        if (request.PeriodWeeks is < 1 or > 4)
        {
            errors.Add(new FieldError(PeriodWeeksInvalid, "periodWeeks"));
        }
        if (request.MaxConsecutiveShifts is < 1 or > 4)
        {
            errors.Add(new FieldError(MaxConsecutiveInvalid, "maxConsecutiveShifts"));
        }
        var blocks = request.Blocks ?? [];
        if (blocks.Count > MaxBlocks)
        {
            errors.Add(new FieldError(TooManyBlocks, "blocks"));
            return (errors, parsed);
        }

        for (var i = 0; i < blocks.Count; i++)
        {
            var block = blocks[i];
            var path = $"blocks[{i}]";
            var start = TimePattern.Parse(block.Start ?? string.Empty);
            var end = TimePattern.Parse(block.End ?? string.Empty);
            if (!start.Success || !end.Success)
            {
                errors.Add(new FieldError(TimeInvalid, path));
                continue;
            }
            // FR-061: times snap to 15 minutes.
            if (start.Value.Minute % 15 != 0 || end.Value.Minute % 15 != 0)
            {
                errors.Add(new FieldError(OffGrid, path));
            }
            // FR-062: a shift ends after it starts, on the same day. 23:00 to 00:30 is refused.
            if (end.Value <= start.Value)
            {
                errors.Add(new FieldError(CrossesMidnight, path));
            }
            if (block.Days is null || block.Days.Count == 0 || block.Days.Any(day => day is < 1 or > 7))
            {
                errors.Add(new FieldError(NoDays, $"{path}.days"));
            }
            if (block.Headcount is < 1 or > MaxHeadcount)
            {
                errors.Add(new FieldError(HeadcountInvalid, $"{path}.headcount"));
            }

            var requirements = block.Requirements ?? [];
            if (requirements.Any(x => x.Level is < 1 or > 3 || x.MinCount < 1) || requirements.Select(x => x.Level).Distinct().Count() != requirements.Count)
            {
                errors.Add(new FieldError(RequirementInvalid, $"{path}.requirements"));
            }
            // FR-065: requirements count inside the headcount. Levels are a ladder (FR-066), so the highest
            // levels are counted first: "1 level 3 and 2 level 2" needs two people, not three.
            else if (SeatsNeeded(requirements) > block.Headcount)
            {
                errors.Add(new FieldError(RequirementExceedsHeadcount, $"{path}.requirements"));
            }

            var conflicts = (block.Conflicts ?? []).Select(Ordered).ToList();
            if (conflicts.Any(x => x.MembershipA == x.MembershipB || !memberIds.Contains(x.MembershipA) || !memberIds.Contains(x.MembershipB)))
            {
                errors.Add(new FieldError(ConflictInvalid, $"{path}.conflicts"));
            }
            else if (conflicts.Distinct().Count() != conflicts.Count)
            {
                errors.Add(new FieldError(ConflictDuplicate, $"{path}.conflicts"));
            }

            parsed.Add((block, start.Value, end.Value));
        }
        return (errors, parsed);
    }

    /// <summary>The fewest people who can satisfy every "at least N of level L or above" rule at once.</summary>
    internal static int SeatsNeeded(IEnumerable<RequirementSetup> requirements)
    {
        var seats = 0;
        foreach (var requirement in requirements.OrderByDescending(x => x.Level))
        {
            seats = Math.Max(seats, requirement.MinCount);
        }
        return seats;
    }

    private static ConflictSetup Ordered(ConflictSetup pair) =>
        pair.MembershipA.CompareTo(pair.MembershipB) <= 0 ? pair : new ConflictSetup(pair.MembershipB, pair.MembershipA);
}

/// <summary>Everything on the Edit Generator page (mockups 1k3 to 1k5).</summary>
/// <param name="PeriodWeeks">1 to 4: the length offered for the next period (FR-090).</param>
/// <param name="MaxConsecutiveShifts">1 to 4, or null for no limit (BR-005).</param>
public sealed record GeneratorSetup(
    int PeriodWeeks,
    int? MaxConsecutiveShifts,
    bool OpeningFairness,
    bool ClosingFairness,
    IReadOnlyList<BlockSetup>? Blocks);

/// <param name="Id">Null for a new block.</param>
/// <param name="Days">ISO weekdays, 1 for Monday to 7 for Sunday.</param>
/// <param name="Start">Local time as "HH:mm", on a 15-minute grid.</param>
public sealed record BlockSetup(
    Guid? Id,
    IReadOnlyList<int> Days,
    string Start,
    string End,
    int Headcount,
    IReadOnlyList<RequirementSetup>? Requirements,
    IReadOnlyList<ConflictSetup>? Conflicts);

public sealed record RequirementSetup(int Level, int MinCount);

public sealed record ConflictSetup(Guid MembershipA, Guid MembershipB);
