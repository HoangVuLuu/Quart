using System.Text.Json.Nodes;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>
/// A small Presotea: the owner (level 3, works shifts) and six staff, two at each level, with the two
/// shifts a day. Enough people that every shift can be filled with a level 3 on it.
/// </summary>
public sealed class Team
{
    private Team(TestApp app, Guid workplaceId, TestUser owner, IReadOnlyList<TestUser> staff)
    {
        App = app;
        WorkplaceId = workplaceId;
        Owner = owner;
        Staff = staff;
    }

    public TestApp App { get; }

    public Guid WorkplaceId { get; }

    public TestUser Owner { get; }

    /// <summary>Lea and Marc are level 3, Nora and Omar level 2, Paul and Rita level 1.</summary>
    public IReadOnlyList<TestUser> Staff { get; }

    public Guid PeriodId { get; private set; }

    public IEnumerable<TestUser> Everyone => Staff.Prepend(Owner);

    public string Base => $"/api/workplaces/{WorkplaceId}";

    public string Period => $"{Base}/periods/{PeriodId}";

    public static async Task<Team> CreateAsync(TestApp app)
    {
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner);
        owner.MembershipId = await TestApp.MembershipIdAsync(owner, workplaceId);
        // FR-036: Philippe works shifts too.
        await owner.SendAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/members/{owner.MembershipId}", new { worksShifts = true });
        var staff = new List<TestUser>();
        foreach (var (name, level) in new[] { ("Lea Martin", 3), ("Marc Gagnon", 3), ("Nora Singh", 2), ("Omar Haddad", 2), ("Paul Chen", 1), ("Rita Lopez", 1) })
        {
            staff.Add(await app.JoinAsync(owner, workplaceId, name, level));
        }
        return new Team(app, workplaceId, owner, staff);
    }

    /// <summary>Opens a period starting on <paramref name="monday"/> (default: Monday 9 November 2026).</summary>
    /// <summary>Opens a period of <paramref name="weeks"/>: the length lives in the generator rules only (FR-090).</summary>
    public async Task OpenPeriodAsync(int weeks = 1, LocalDate? monday = null)
    {
        var start = monday ?? new LocalDate(2026, 11, 9);
        var rules = await Owner.GetAsync($"{Base}/generator");
        if (rules["periodWeeks"]!.GetValue<int>() != weeks)
        {
            rules["periodWeeks"] = weeks;
            await Owner.SendAsync(HttpMethod.Put, $"{Base}/generator", rules);
        }
        var period = await Owner.PostAsync($"{Base}/periods", new { startDate = start.ToString("yyyy-MM-dd", null) });
        PeriodId = Guid.Parse(period["id"]!.GetValue<string>());
    }

    /// <summary>The person says they can work every shift for which <paramref name="canWork"/> is true, and sends.</summary>
    /// <param name="hours">Hours per week wanted this period, sent with the availability (BR-032).</param>
    public async Task SendAvailabilityAsync(TestUser person, Func<JsonNode, bool>? canWork = null, decimal hours = 20)
    {
        var mine = await person.GetAsync($"{Period}/availability/me");
        var shiftIds = mine["shifts"]!.AsArray().Where(x => canWork?.Invoke(x!) ?? true).Select(x => x!["id"]!.GetValue<string>()).ToList();
        await person.PostAsync($"{Period}/availability/me/send", new { shiftIds, desiredWeeklyHours = hours });
    }

    /// <summary>A period where everyone can work everything, generated and published as version 1.</summary>
    public async Task<JsonNode> PublishAsync(int weeks = 1, LocalDate? monday = null, int seed = 7)
    {
        await OpenPeriodAsync(weeks, monday);
        foreach (var person in Everyone)
        {
            await SendAvailabilityAsync(person);
        }
        await Owner.PostAsync($"{Period}/draft/generate", new { seed });
        await Owner.PostAsync($"{Period}/draft/publish", new { confirmed = true });
        return await Owner.GetAsync($"{Period}/schedule");
    }

    public Task<JsonNode> ScheduleAsync(TestUser? asSeenBy = null) => (asSeenBy ?? Owner).GetAsync($"{Period}/schedule");

    /// <summary>Published shifts held by the person, soonest first.</summary>
    public static List<JsonNode> ShiftsOf(JsonNode schedule, TestUser person) =>
        schedule["shifts"]!.AsArray().Where(shift => Holds(shift!, person)).Select(x => x!).ToList();

    public static bool Holds(JsonNode shift, TestUser person) =>
        shift["people"]!.AsArray().Any(x => x!["membershipId"]!.GetValue<string>() == person.MembershipId.ToString());

    public static string Id(JsonNode node) => node["id"]!.GetValue<string>();

    public async Task<List<string>> NotificationTypesAsync(TestUser person) =>
        (await person.GetAsync($"{Base}/notifications"))["items"]!.AsArray().Select(x => x!["type"]!.GetValue<string>()).ToList();
}
