using System.Text.Json.Nodes;

namespace Quart.Api.Tests;

/// <summary>
/// Someone in two workplaces is never booked twice, and neither manager learns where else they work
/// (BR-002, FR-094, M5-11).
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class CrossWorkplaceTests(PostgresFixture postgres)
{
    private const string OtherName = "Bubble Lab Laval";

    [Fact]
    public async Task Generating_never_places_someone_on_a_shift_they_already_work_at_another_workplace()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var elsewhere = await PublishElsewhereAsync(app, lea);
        Assert.NotEmpty(elsewhere.Busy);

        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 7 });

        foreach (var shift in draft["shifts"]!.AsArray().Where(x => elsewhere.Overlaps(x!)))
        {
            Assert.DoesNotContain(shift!["people"]!.AsArray(), p => p!["membershipId"]!.GetValue<string>() == lea.MembershipId.ToString());
            Assert.DoesNotContain(shift["availableIds"]!.AsArray(), id => id!.GetValue<string>() == lea.MembershipId.ToString());
        }
        // She still works the shifts that do not overlap.
        Assert.Contains(
            draft["shifts"]!.AsArray().Where(x => !elsewhere.Overlaps(x!)),
            shift => shift!["availableIds"]!.AsArray().Any(id => id!.GetValue<string>() == lea.MembershipId.ToString()));
    }

    [Fact]
    public async Task Placing_someone_by_hand_where_they_work_elsewhere_shows_only_not_available()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var elsewhere = await PublishElsewhereAsync(app, lea);
        await team.OpenPeriodAsync();
        await team.SendAvailabilityAsync(lea);
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        var shift = (await team.Owner.GetAsync($"{team.Period}/draft"))["shifts"]!.AsArray().First(x => elsewhere.Overlaps(x!))!;

        var draft = await team.Owner.PostAsync($"{team.Period}/draft/assignments", new { shiftId = Team.Id(shift), membershipId = lea.MembershipId });

        var issue = Assert.Single(draft["issues"]!.AsArray(), x =>
            x!["memberIds"]!.AsArray().Any(id => id!.GetValue<string>() == lea.MembershipId.ToString())
            && x["shiftIds"]!.AsArray().Any(id => id!.GetValue<string>() == Team.Id(shift)));
        Assert.Equal("issue.unavailable", issue!["code"]!.GetValue<string>());
        AssertNothingNames(elsewhere, draft);
    }

    [Fact]
    public async Task The_person_sees_those_blocks_greyed_out_and_the_manager_sees_only_not_available()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var elsewhere = await PublishElsewhereAsync(app, lea);
        await team.OpenPeriodAsync();
        await team.SendAvailabilityAsync(lea);

        var mine = await lea.GetAsync($"{team.Period}/availability/me");
        foreach (var shift in mine["shifts"]!.AsArray())
        {
            var busy = elsewhere.Overlaps(shift!);
            Assert.Equal(busy, shift!["busyElsewhere"]!.GetValue<bool>());
            Assert.Equal(!busy, shift["selected"]!.GetValue<bool>());
        }

        var seenByManager = await team.Owner.GetAsync($"{team.Period}/availability/{lea.MembershipId}");
        foreach (var shift in seenByManager["shifts"]!.AsArray())
        {
            Assert.False(shift!["busyElsewhere"]!.GetValue<bool>());
            Assert.Equal(!elsewhere.Overlaps(shift), shift["selected"]!.GetValue<bool>());
        }
        AssertNothingNames(elsewhere, seenByManager);
        AssertNothingNames(elsewhere, await team.Owner.GetAsync($"{team.Period}/availability"));
        AssertNothingNames(elsewhere, await team.Owner.GetAsync($"{team.Period}/draft"));
    }

    [Fact]
    public async Task A_draft_at_another_workplace_blocks_nothing()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var elsewhere = await PublishElsewhereAsync(app, lea, publish: false);
        await team.OpenPeriodAsync();

        var mine = await lea.GetAsync($"{team.Period}/availability/me");

        Assert.All(mine["shifts"]!.AsArray(), shift => Assert.False(shift!["busyElsewhere"]!.GetValue<bool>()));
        Assert.Empty(elsewhere.Busy);
    }

    private static void AssertNothingNames(Elsewhere elsewhere, JsonNode response)
    {
        var text = response.ToJsonString();
        Assert.DoesNotContain(OtherName, text, StringComparison.Ordinal);
        Assert.DoesNotContain(elsewhere.WorkplaceId.ToString(), text, StringComparison.Ordinal);
        Assert.DoesNotContain(elsewhere.PeriodId.ToString(), text, StringComparison.Ordinal);
        Assert.DoesNotContain(elsewhere.MembershipId.ToString(), text, StringComparison.Ordinal);
    }

    /// <summary>
    /// A second workplace where <paramref name="person"/> is the only one who works shifts, and only the
    /// 10:00 to 16:00 ones, for the same week as the team's default period.
    /// </summary>
    private static async Task<Elsewhere> PublishElsewhereAsync(TestApp app, TestUser person, bool publish = true)
    {
        var owner = await app.PersonAsync("Gabriel Tremblay");
        var workplaceId = await app.WorkplaceAsync(owner, name: OtherName);
        var code = (await owner.GetAsync($"/api/workplaces/{workplaceId}"))["joinCode"]!.GetValue<string>();
        await person.PostAsync("/api/workplaces/join", new { code });
        var membershipId = await TestApp.MembershipIdAsync(person, workplaceId);
        await owner.SendAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/members/{membershipId}", new { level = 3 });

        var rules = await owner.GetAsync($"/api/workplaces/{workplaceId}/generator");
        rules["periodWeeks"] = 1;
        await owner.SendAsync(HttpMethod.Put, $"/api/workplaces/{workplaceId}/generator", rules);
        var created = await owner.PostAsync($"/api/workplaces/{workplaceId}/periods", new { startDate = "2026-11-09", dueDate = "2026-11-06", dueTime = "18:00" });
        var period = $"/api/workplaces/{workplaceId}/periods/{created["id"]!.GetValue<string>()}";
        var shiftIds = (await person.GetAsync($"{period}/availability/me"))["shifts"]!.AsArray()
            .Where(x => x!["start"]!.GetValue<string>() == "10:00")
            .Select(x => x!["id"]!.GetValue<string>())
            .ToList();
        await person.PostAsync($"{period}/availability/me/send", new { shiftIds, desiredWeeklyHours = 42 });
        await owner.PostAsync($"{period}/draft/generate", new { seed = 3 });
        if (publish)
        {
            await owner.PostAsync($"{period}/draft/publish", new { confirmed = true });
        }

        var busy = publish
            ? (await person.GetAsync($"{period}/schedule"))["shifts"]!.AsArray()
                .Where(x => x!["people"]!.AsArray().Any(p => p!["membershipId"]!.GetValue<string>() == membershipId.ToString()))
                .Select(x => (x!["date"]!.GetValue<string>(), x["start"]!.GetValue<string>()))
                .ToHashSet()
            : [];
        return new Elsewhere(workplaceId, Guid.Parse(created["id"]!.GetValue<string>()), membershipId, busy);
    }

    /// <param name="Busy">Date and start of each shift held there. Both workplaces run the same two shifts a day, so a shift here overlaps one there exactly when both match.</param>
    private sealed record Elsewhere(Guid WorkplaceId, Guid PeriodId, Guid MembershipId, HashSet<(string Date, string Start)> Busy)
    {
        public bool Overlaps(JsonNode shift) => Busy.Contains((shift["date"]!.GetValue<string>(), shift["start"]!.GetValue<string>()));
    }
}
