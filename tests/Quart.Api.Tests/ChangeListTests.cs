using System.Net;
using System.Text.Json.Nodes;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>The change list of 2026-11-18: hours per period, the Trade tab, levels, and Building Schedule.</summary>
[Collection(PostgresCollection.Name)]
public sealed class ChangeListTests(PostgresFixture postgres)
{
    private static readonly HttpMethod Post = HttpMethod.Post;

    private static JsonNode Person(JsonNode draft, TestUser who) =>
        draft["people"]!.AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == who.MembershipId.ToString())!;

    private static async Task<int> DraftCountAsync(Team team) =>
        (await team.Owner.GetAsync($"{team.Period}/draft"))["shifts"]!.AsArray().Sum(x => x!["people"]!.AsArray().Count);

    // 1.1 ---------------------------------------------------------------------------------------------------

    [Fact]
    public async Task Hours_come_with_the_availability_once_per_period_and_the_generator_caps_them_at_the_maximum()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var (lea, marc) = (team.Staff[0], team.Staff[1]);
        await team.Owner.SendAsync(HttpMethod.Patch, $"{team.Base}/members/{marc.MembershipId}", new { maxWeeklyHours = 12 });
        await team.OpenPeriodAsync();

        // Mandatory to send, empty the first time.
        Assert.Null((await lea.GetAsync($"{team.Period}/availability/me"))["desiredWeeklyHours"]);
        Assert.Equal("availability.hours_required", (await lea.TryAsync(Post, $"{team.Period}/availability/me/send", new { shiftIds = Array.Empty<Guid>() })).Code);
        Assert.Equal("availability.hours_invalid", (await lea.TryAsync(Post, $"{team.Period}/availability/me/send", new { shiftIds = Array.Empty<Guid>(), desiredWeeklyHours = -1 })).Code);
        // Workers can no longer set it anywhere else.
        Assert.True((await lea.TryAsync(HttpMethod.Patch, $"{team.Base}/me", new { desiredWeeklyHours = 10 })).Status is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed);

        await team.SendAvailabilityAsync(lea, hours: 26);
        await team.SendAvailabilityAsync(marc, hours: 30);
        var teamView = await team.Owner.GetAsync($"{team.Period}/availability");
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/start");

        // Managers see each number; above the maximum the generator quietly uses the maximum.
        Assert.Equal(26m, teamView["people"]!.AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == lea.MembershipId.ToString())!["desiredWeeklyHours"]!.GetValue<decimal>());
        Assert.Equal(30m, teamView["people"]!.AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == marc.MembershipId.ToString())!["desiredWeeklyHours"]!.GetValue<decimal>());
        Assert.Equal(12m, Person(draft, marc)["desiredWeeklyHours"]!.GetValue<decimal>());
        // Someone who has not sent has no target, so no under-hours issue either.
        Assert.Null(Person(draft, team.Staff[5])["desiredWeeklyHours"]);
        Assert.DoesNotContain(draft["issues"]!.AsArray(), x => x!["code"]!.GetValue<string>() == "issue.under_hours"
            && x["memberIds"]!.AsArray().Any(m => m!.GetValue<string>() == team.Staff[5].MembershipId.ToString()));
    }

    [Fact]
    public async Task The_next_period_offers_last_periods_number()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person, hours: person == lea ? 18 : 20);
        }
        await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 7 });
        await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });

        await team.OpenPeriodAsync(monday: new LocalDate(2026, 11, 16));

        var mine = await lea.GetAsync($"{team.Period}/availability/me");
        Assert.Equal(18m, mine["desiredWeeklyHours"]!.GetValue<decimal>());
        Assert.Equal("not_sent", mine["status"]!.GetValue<string>());
    }

    // 2 and 3 -----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Opening_a_trade_item_takes_it_off_the_count_and_my_shifts_say_what_is_under_way()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var (nora, omar) = (team.Staff[2], team.Staff[3]);
        var hers = Team.Id(Team.ShiftsOf(schedule, nora).First(x => !Team.Holds(x, omar)));
        await nora.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = hers });

        var board = await omar.GetAsync($"{team.Base}/marketplace");
        var offer = board["offers"]!.AsArray().Single()!;
        Assert.Equal(1, board["unseen"]!.GetValue<int>());
        await omar.SendAsync(Post, $"{team.Base}/marketplace/seen", new { key = $"offer:{Team.Id(offer)}" });
        await omar.SendAsync(Post, $"{team.Base}/marketplace/seen", new { key = $"offer:{Team.Id(offer)}" });
        Assert.Equal(0, (await omar.GetAsync($"{team.Base}/marketplace"))["unseen"]!.GetValue<int>());
        Assert.Equal("marketplace.item_invalid", (await omar.TryAsync(Post, $"{team.Base}/marketplace/seen", new { key = "anything" })).Code);
        // Seen is per person.
        Assert.Equal(1, (await team.Staff[4].GetAsync($"{team.Base}/marketplace"))["unseen"]!.GetValue<int>());

        var mine = (await nora.GetAsync($"{team.Base}/marketplace"))["mine"]!.AsArray();
        Assert.Equal(Team.ShiftsOf(schedule, nora).Count, mine.Count);
        Assert.True(mine.Single(x => x!["shift"]!["id"]!.GetValue<string>() == hers)!["offered"]!.GetValue<bool>());
    }

    [Fact]
    public async Task A_manager_in_the_trade_skips_approval_and_workers_never_see_levels()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.Owner.SendAsync(HttpMethod.Patch, $"{team.Base}/settings", new { claimsNeedApproval = false, tradesNeedApproval = true });
        var schedule = await team.PublishAsync();
        var paul = team.Staff[4];
        var his = Team.ShiftsOf(schedule, paul).First(x => !Team.Holds(x, team.Owner));
        var owners = Team.ShiftsOf(schedule, team.Owner).First(x => !Team.Holds(x, paul) && Team.Id(x) != Team.Id(his));

        Assert.All(schedule["shifts"]!.AsArray().SelectMany(x => x!["people"]!.AsArray()), person => Assert.True(person!["level"] is not null));
        Assert.All((await team.ScheduleAsync(paul))["shifts"]!.AsArray().SelectMany(x => x!["people"]!.AsArray()), person => Assert.Null(person!["level"]));

        await paul.PostAsync($"{team.Base}/marketplace/trades", new { myShiftId = Team.Id(his), theirShiftId = Team.Id(owners), theirMembershipId = team.Owner.MembershipId });
        var trade = Team.Id((await team.Owner.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!);
        await team.Owner.PostAsync($"{team.Base}/marketplace/trades/{trade}/accept");

        // 2.6: applied at once, no approval waiting.
        var after = await team.ScheduleAsync();
        Assert.True(Team.Holds(after["shifts"]!.AsArray().Single(x => Team.Id(x!) == Team.Id(his))!, team.Owner));
        Assert.Contains("trade.applied", await team.NotificationTypesAsync(paul));
    }

    [Fact]
    public async Task Without_approval_a_claim_that_breaks_the_level_rule_goes_through_and_the_manager_hears_of_it()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.Owner.SendAsync(HttpMethod.Patch, $"{team.Base}/settings", new { claimsNeedApproval = false, tradesNeedApproval = false });
        var schedule = await team.PublishAsync();
        var level3 = new[] { team.Owner, team.Staff[0], team.Staff[1] };
        var lea = team.Staff[0];
        var only = Team.ShiftsOf(schedule, lea).FirstOrDefault(shift => level3.Count(x => Team.Holds(shift, x)) == 1);
        Assert.True(only is not null, "The generated schedule has no shift where Lea is the only level 3.");
        var junior = new[] { team.Staff[4], team.Staff[5] }.First(x => !Team.Holds(only!, x));
        await lea.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = Team.Id(only!) });
        var offer = (await junior.GetAsync($"{team.Base}/marketplace"))["offers"]!.AsArray().Single()!;
        Assert.False(offer["wouldMissLevel"]!.GetValue<bool>());

        var claimed = await junior.PostAsync($"{team.Base}/marketplace/claims", new { shiftId = Team.Id(only!), giveAwayId = Team.Id(offer) });

        Assert.True(claimed["applied"]!.GetValue<bool>());
        Assert.Contains("shift.missing_level", await team.NotificationTypesAsync(team.Owner));
        Assert.DoesNotContain("shift.missing_level", await team.NotificationTypesAsync(junior));
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/start");
        Assert.Contains(draft["issues"]!.AsArray(), x => x!["code"]!.GetValue<string>() == "issue.missing_level");
    }

    // 4.3 and 4.4 -------------------------------------------------------------------------------------------

    [Fact]
    public async Task Leaving_building_without_saving_drops_the_changes_and_unlocks_availability()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var lea = team.Staff[0];

        await team.Owner.PostAsync($"{team.Period}/draft/start");
        Assert.False((await lea.GetAsync($"{team.Period}/availability/me"))["canEdit"]!.GetValue<bool>());
        var generated = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 7 });
        Assert.True(generated["hasUnsavedChanges"]!.GetValue<bool>());
        await team.Owner.SendAsync(Post, $"{team.Period}/draft/leave");

        Assert.Equal(0, await DraftCountAsync(team));
        Assert.True((await lea.GetAsync($"{team.Period}/availability/me"))["canEdit"]!.GetValue<bool>());
        var current = await team.Owner.GetAsync($"{team.Base}/periods/current");
        Assert.False(current["next"]!["period"]!["draftSaved"]!.GetValue<bool>());
        Assert.False(current["next"]!["period"]!["locked"]!.GetValue<bool>());
        // While unlocked, a worker can change their availability; Generate reads it next time.
        await team.SendAvailabilityAsync(lea, _ => false);
    }

    [Fact]
    public async Task A_saved_draft_survives_leaving_and_the_issues_catch_availability_changed_meanwhile()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var lea = team.Staff[0];
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 7 });
        var saved = await team.Owner.PostAsync($"{team.Period}/draft/save");
        Assert.False(saved["hasUnsavedChanges"]!.GetValue<bool>());
        var count = await DraftCountAsync(team);
        await team.Owner.PostAsync($"{team.Period}/draft/clear");
        Assert.Equal(0, await DraftCountAsync(team));
        await team.Owner.SendAsync(Post, $"{team.Period}/draft/leave");

        // Clear was not saved, so leaving put the saved draft back; "Continue building" is offered.
        Assert.Equal(count, await DraftCountAsync(team));
        Assert.True((await team.Owner.GetAsync($"{team.Base}/periods/current"))["next"]!["period"]!["draftSaved"]!.GetValue<bool>());

        await team.SendAvailabilityAsync(lea, _ => false);
        var back = await team.Owner.PostAsync($"{team.Period}/draft/start");
        Assert.Contains(back["issues"]!.AsArray(), x => x!["code"]!.GetValue<string>() == "issue.unavailable"
            && x["memberIds"]!.AsArray().Any(m => m!.GetValue<string>() == lea.MembershipId.ToString()));
        Assert.False((await lea.GetAsync($"{team.Period}/availability/me"))["canEdit"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Closing_the_app_on_building_counts_as_leaving_without_saving()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var lea = team.Staff[0];
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 7 });

        // Signs of life keep it locked; silence for more than two minutes ends the visit, unsaved.
        app.Clock.Advance(Duration.FromSeconds(90));
        await team.Owner.SendAsync(Post, $"{team.Period}/draft/heartbeat");
        app.Clock.Advance(Duration.FromSeconds(90));
        Assert.False((await lea.GetAsync($"{team.Period}/availability/me"))["canEdit"]!.GetValue<bool>());
        app.Clock.Advance(Duration.FromSeconds(60));

        Assert.True((await lea.GetAsync($"{team.Period}/availability/me"))["canEdit"]!.GetValue<bool>());
        Assert.Equal(0, await DraftCountAsync(team));
        Assert.Equal((HttpStatusCode.Conflict, "schedule.visit_ended"), await team.Owner.TryAsync(Post, $"{team.Period}/draft/heartbeat"));
    }

    [Fact]
    public async Task Editing_a_published_schedule_keeps_availability_locked_and_cannot_clear()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.PublishAsync();
        var paul = team.Staff[4];
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/start");
        var shift = draft["shifts"]!.AsArray().First(x => Team.Holds(x!, paul))!;

        Assert.Equal((HttpStatusCode.Conflict, "schedule.cannot_clear_published"), await team.Owner.TryAsync(Post, $"{team.Period}/draft/clear"));
        await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Period}/draft/assignments/{Team.Id(shift)}/{paul.MembershipId}");
        await team.Owner.SendAsync(Post, $"{team.Period}/draft/leave");

        var again = await team.Owner.GetAsync($"{team.Period}/draft");
        Assert.True(again["shifts"]!.AsArray().Single(x => Team.Id(x!) == Team.Id(shift))!["people"]!.AsArray().Any(p => p!["membershipId"]!.GetValue<string>() == paul.MembershipId.ToString()));
        Assert.False(again["hasUnpublishedChanges"]!.GetValue<bool>());
        Assert.True(again["period"]!["locked"]!.GetValue<bool>());
    }

    // 5 -----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task Tapping_a_notification_marks_only_that_one_read_and_only_your_own()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.PublishAsync();
        var lea = team.Staff[0];
        var inbox = await lea.GetAsync($"{team.Base}/notifications");
        var first = Team.Id(inbox["items"]![0]!);
        var unread = inbox["unread"]!.GetValue<int>();

        await lea.SendAsync(Post, $"{team.Base}/notifications/{first}/read");

        Assert.Equal(unread - 1, (await lea.GetAsync($"{team.Base}/notifications"))["unread"]!.GetValue<int>());
        Assert.Equal(HttpStatusCode.NotFound, (await team.Staff[1].TryAsync(Post, $"{team.Base}/notifications/{first}/read")).Status);
    }
}
