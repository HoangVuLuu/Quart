using System.Net;
using System.Text.Json.Nodes;

namespace Quart.Api.Tests;

/// <summary>A manager marks someone on a shift as starting earlier; the team sees the name in red (Hoang, 2026-11-25).</summary>
[Collection(PostgresCollection.Name)]
public sealed class StartsEarlyTests(PostgresFixture postgres)
{
    [Fact]
    public async Task A_mark_on_the_draft_reaches_the_team_when_published_and_comes_off_the_same_way()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var paul = team.Staff[4];
        var shift = Team.ShiftsOf(schedule, paul)[0];
        var early = $"{team.Period}/draft/assignments/{Team.Id(shift)}/{paul.MembershipId}/early";

        await team.Owner.PostAsync($"{team.Period}/draft/start");
        var draft = await team.Owner.SendAsync(HttpMethod.Put, early, new { startsEarly = true });
        var marked = await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });
        var seen = await team.ScheduleAsync(team.Staff[0]);
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        await team.Owner.SendAsync(HttpMethod.Put, early, new { startsEarly = false });
        await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });
        var after = await team.ScheduleAsync(team.Staff[0]);

        Assert.True(Person(Shift(draft, shift), paul)["startsEarly"]!.GetValue<bool>());
        Assert.True(draft["hasUnpublishedChanges"]!.GetValue<bool>());
        Assert.NotNull(marked);
        Assert.True(Person(Shift(seen, shift), paul)["startsEarly"]!.GetValue<bool>());
        Assert.False(Person(Shift(after, shift), paul)["startsEarly"]!.GetValue<bool>());
        Assert.All(Shift(seen, shift)["people"]!.AsArray().Where(x => x!["membershipId"]!.GetValue<string>() != paul.MembershipId.ToString()),
            x => Assert.False(x!["startsEarly"]!.GetValue<bool>()));
    }

    [Fact]
    public async Task Only_someone_on_the_shift_can_be_marked_and_only_by_whoever_builds()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var paul = team.Staff[4];
        var notHis = schedule["shifts"]!.AsArray().First(x => !Team.Holds(x!, paul))!;

        var notOn = await team.Owner.TryAsync(HttpMethod.Put, $"{team.Period}/draft/assignments/{Team.Id(notHis)}/{paul.MembershipId}/early", new { startsEarly = true });
        var staff = await paul.TryAsync(HttpMethod.Put, $"{team.Period}/draft/assignments/{Team.Id(notHis)}/{paul.MembershipId}/early", new { startsEarly = true });

        Assert.Equal((HttpStatusCode.Conflict, "schedule.not_on_shift"), notOn);
        Assert.Equal(HttpStatusCode.Forbidden, staff.Status);
    }

    [Fact]
    public async Task The_mark_belongs_to_the_place_so_whoever_takes_the_shift_over_is_marked()
    {
        // Hoang, 2026-11-26: if Selma gives her shift away, the person who takes it now starts earlier.
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var (nora, omar) = (team.Staff[2], team.Staff[3]);
        var shift = Team.ShiftsOf(schedule, nora).First(x => !Team.Holds(x, omar));
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        await team.Owner.SendAsync(HttpMethod.Put, $"{team.Period}/draft/assignments/{Team.Id(shift)}/{nora.MembershipId}/early", new { startsEarly = true });
        await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });

        await nora.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = Team.Id(shift) });
        var offer = (await omar.GetAsync($"{team.Base}/marketplace"))["offers"]!.AsArray().Single()!;
        await omar.PostAsync($"{team.Base}/marketplace/claims", new { shiftId = Team.Id(shift), giveAwayId = Team.Id(offer) });

        var after = Shift(await team.ScheduleAsync(), shift);
        Assert.True(Person(after, omar)["startsEarly"]!.GetValue<bool>());
        Assert.DoesNotContain(after["people"]!.AsArray(), x => x!["membershipId"]!.GetValue<string>() == nora.MembershipId.ToString());
    }

    private static JsonNode Shift(JsonNode view, JsonNode shift) =>
        view["shifts"]!.AsArray().Single(x => Team.Id(x!) == Team.Id(shift))!;

    private static JsonNode Person(JsonNode shift, TestUser person) =>
        shift["people"]!.AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == person.MembershipId.ToString())!;
}
