using System.Net;
using System.Text.Json.Nodes;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>
/// One period's own shifts (FR-092, M4-01, 2026-11-23), changed from the pen next to each day on Building and
/// Editing Schedule: new hours, removed, added by hand, a closed day reopened.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class PeriodShiftTests(PostgresFixture postgres)
{
    private static readonly HttpMethod Put = HttpMethod.Put;

    private static string Shifts(Team team) => $"{team.Period}/shifts";

    /// <summary>The list the Editing Shift page saves: every shift not started, as it is, with <paramref name="change"/> applied.</summary>
    private static async Task<List<JsonObject>> ListAsync(Team team)
    {
        var view = await team.Owner.GetAsync(Shifts(team));
        return view["shifts"]!.AsArray().Where(x => !x!["started"]!.GetValue<bool>()).Select(x => new JsonObject
        {
            ["id"] = x!["id"]!.GetValue<string>(),
            ["date"] = x["date"]!.GetValue<string>(),
            ["blockId"] = null,
            ["name"] = x["name"]?.GetValue<string>(),
            ["start"] = x["start"]!.GetValue<string>(),
            ["end"] = x["end"]!.GetValue<string>(),
            ["headcount"] = x["headcount"]!.GetValue<int>(),
            ["requirements"] = x["requirements"]!.DeepClone(),
        }).ToList();
    }

    private static JsonObject On(List<JsonObject> list, string date, string start) =>
        list.Single(x => x["date"]!.GetValue<string>() == date && x["start"]!.GetValue<string>() == start);

    [Fact]
    public async Task Building_a_period_its_shifts_can_move_go_be_added_by_hand_and_a_closed_day_reopens()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var list = await ListAsync(team);
        var monday = On(list, "2026-11-09", "10:00");
        var mondayId = monday["id"]!.GetValue<string>();
        monday["end"] = "14:00";
        list.Remove(On(list, "2026-11-10", "16:00"));
        list.Add(new JsonObject { ["date"] = "2026-11-11", ["name"] = "Extra", ["start"] = "12:00", ["end"] = "15:00", ["headcount"] = 1 });
        await team.Owner.SendAsync(Put, Shifts(team), new { shifts = list });

        var view = await team.Owner.GetAsync(Shifts(team));
        var extra = view["shifts"]!.AsArray().Single(x => x!["name"]?.GetValue<string>() == "Extra")!;
        Assert.True(extra["addedByHand"]!.GetValue<bool>());
        Assert.DoesNotContain(view["shifts"]!.AsArray(), x => x!["date"]!.GetValue<string>() == "2026-11-10" && x["start"]!.GetValue<string>() == "16:00");

        // Staff never answer for a shift added by hand; answers stay with a shift whose hours moved.
        var mine = (await team.Staff[0].GetAsync($"{team.Period}/availability/me"))["shifts"]!.AsArray();
        Assert.DoesNotContain(mine, x => x!["id"]!.GetValue<string>() == Team.Id(extra));
        Assert.True(mine.Single(x => x!["id"]!.GetValue<string>() == mondayId)!["selected"]!.GetValue<bool>());

        // The generator leaves the added shift empty: nobody said they can work it.
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 3 });
        Assert.Empty(draft["shifts"]!.AsArray().Single(x => Team.Id(x!) == Team.Id(extra))!["people"]!.AsArray());
        Assert.Equal("14:00", draft["shifts"]!.AsArray().Single(x => Team.Id(x!) == mondayId)!["end"]!.GetValue<string>());

        // Reopen: the generator's own shift comes back, not as one added by hand.
        var rules = view["rules"]!.AsArray().Single(x => x!["date"]!.GetValue<string>() == "2026-11-10" && x["start"]!.GetValue<string>() == "16:00")!;
        list = await ListAsync(team);
        list.Add(new JsonObject
        {
            ["date"] = "2026-11-10", ["blockId"] = rules["blockId"]!.GetValue<string>(), ["start"] = "16:00",
            ["end"] = rules["end"]!.GetValue<string>(), ["headcount"] = rules["headcount"]!.GetValue<int>(),
        });
        await team.Owner.SendAsync(Put, Shifts(team), new { shifts = list });
        var back = (await team.Owner.GetAsync(Shifts(team)))["shifts"]!.AsArray()
            .Single(x => x!["date"]!.GetValue<string>() == "2026-11-10" && x["start"]!.GetValue<string>() == "16:00")!;
        Assert.False(back["addedByHand"]!.GetValue<bool>());
        Assert.Equal(rules["blockId"]!.GetValue<string>(), back["blockId"]!.GetValue<string>());
    }

    [Fact]
    public async Task On_a_published_period_the_people_on_a_moved_or_removed_shift_are_told_and_a_version_is_saved()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var lea = team.Staff[0];
        var hers = Team.ShiftsOf(schedule, lea);
        var (moving, going) = (Team.Id(hers[0]), Team.Id(hers[1]));
        // An open give-away on a shift that goes leaves the board with it.
        await lea.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = going });

        var list = await ListAsync(team);
        var moved = list.Single(x => x["id"]!.GetValue<string>() == moving);
        moved["start"] = moved["start"]!.GetValue<string>() == "10:00" ? "11:00" : "17:00";
        list.RemoveAll(x => x["id"]!.GetValue<string>() == going);
        await team.Owner.SendAsync(Put, Shifts(team), new { shifts = list });

        var now = await team.ScheduleAsync(lea);
        Assert.Equal(2, now["period"]!["version"]!.GetValue<int>());
        Assert.DoesNotContain(now["shifts"]!.AsArray(), x => Team.Id(x!) == going);
        Assert.Equal(moved["start"]!.GetValue<string>(), now["shifts"]!.AsArray().Single(x => Team.Id(x!) == moving)!["start"]!.GetValue<string>());
        var types = await team.NotificationTypesAsync(lea);
        Assert.Contains("shift.hours_changed", types);
        Assert.Contains("shift.removed", types);
        Assert.Empty((await team.Owner.GetAsync($"{team.Base}/marketplace"))["offers"]!.AsArray());
    }

    [Fact]
    public async Task Shifts_that_started_never_change_and_new_hours_cannot_double_book_anyone()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        // Lea works both of Tuesday's shifts.
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/start");
        var tuesday = draft["shifts"]!.AsArray().Where(x => x!["date"]!.GetValue<string>() == "2026-11-10").Select(x => Team.Id(x!)).ToList();
        foreach (var shift in tuesday)
        {
            await team.Owner.PostAsync($"{team.Period}/draft/assignments", new { shiftId = shift, membershipId = team.Staff[0].MembershipId });
        }
        await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });

        var list = await ListAsync(team);
        On(list, "2026-11-10", "10:00")["end"] = "17:00";
        Assert.Equal((HttpStatusCode.Conflict, "period.shift_double_booked"), await team.Owner.TryAsync(Put, Shifts(team), new { shifts = list }));

        // Monday has started: its shifts are not on the list, and leaving them out does not remove them.
        app.Clock.Advance(Duration.FromDays(7) + Duration.FromHours(1));
        var view = await team.Owner.GetAsync(Shifts(team));
        Assert.Contains("2026-11-09", view["startedDays"]!.AsArray().Select(x => x!.GetValue<string>()));
        var mondayId = Team.Id(view["shifts"]!.AsArray().First(x => x!["date"]!.GetValue<string>() == "2026-11-09")!);
        list = await ListAsync(team);
        await team.Owner.SendAsync(Put, Shifts(team), new { shifts = list });
        Assert.Contains((await team.Owner.GetAsync(Shifts(team)))["shifts"]!.AsArray(), x => Team.Id(x!) == mondayId);
        list.Add(new JsonObject { ["id"] = mondayId, ["date"] = "2026-11-09", ["start"] = "10:00", ["end"] = "12:00", ["headcount"] = 2 });
        Assert.Equal((HttpStatusCode.Conflict, "period.shift_started"), await team.Owner.TryAsync(Put, Shifts(team), new { shifts = list }));
        // Staff never change a period's shifts.
        Assert.Equal(HttpStatusCode.Forbidden, (await team.Staff[0].TryAsync(Put, Shifts(team), new { shifts = list })).Status);
    }
}
