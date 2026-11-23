using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>
/// "Edit a specific day" in Edit Generator (M4-01, 2026-11-23): changes to one day of the week in one week of the
/// period, used by every period opened afterwards, and asked about again once a period has used them.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class DayChangeTests(PostgresFixture postgres)
{
    private static readonly HttpMethod Put = HttpMethod.Put;

    private static async Task<(string Opening, string Closing)> BlocksAsync(Team team)
    {
        var blocks = (await team.Owner.GetAsync($"{team.Base}/generator"))["blocks"]!.AsArray();
        return (blocks[0]!["id"]!.GetValue<string>(), blocks[1]!["id"]!.GetValue<string>());
    }

    [Fact]
    public async Task Day_changes_shape_only_the_days_and_weeks_they_name_in_the_next_period_opened()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var (opening, closing) = await BlocksAsync(team);
        var (lea, marc) = (team.Staff[0].MembershipId, team.Staff[1].MembershipId);

        await team.Owner.SendAsync(Put, $"{team.Base}/generator/days", new
        {
            changes = new object[]
            {
                // Week 1: no opening on Monday, a Rush on Wednesday, Friday's closing ends at 21:00.
                new { week = 1, day = 1, kind = "removed", blockId = opening },
                new
                {
                    week = 1, day = 3, kind = "added", start = "11:00", end = "14:00", name = " Rush ", headcount = 1,
                    requirements = new[] { new { level = 2, minCount = 1 } },
                    conflicts = new[] { new { membershipA = lea, membershipB = marc } },
                },
                new { week = 1, day = 5, kind = "changed", blockId = closing, start = "16:00", end = "21:00" },
            },
        });
        var saved = (await team.Owner.GetAsync($"{team.Base}/generator/days"))["changes"]!.AsArray();
        Assert.Equal(3, saved.Count);
        var rush = saved.Single(x => x!["kind"]!.GetValue<string>() == "added")!;
        Assert.Equal("Rush", rush["name"]!.GetValue<string>());

        await team.OpenPeriodAsync(weeks: 2);
        var shifts = (await team.Staff[0].GetAsync($"{team.Period}/availability/me"))["shifts"]!.AsArray();
        List<JsonNode> On(string date) => shifts.Where(x => x!["date"]!.GetValue<string>() == date).Select(x => x!).ToList();

        Assert.Equal(["16:00"], On("2026-11-09").Select(x => x["start"]!.GetValue<string>()));
        Assert.Equal(2, On("2026-11-16").Count);
        var wednesday = On("2026-11-11");
        Assert.Equal(3, wednesday.Count);
        var rushShift = wednesday.Single(x => x["name"]?.GetValue<string>() == "Rush");
        // The added shift points back to its change, the way a weekly shift points to its block.
        Assert.Equal(rush["id"]!.GetValue<string>(), rushShift["blockId"]!.GetValue<string>());
        Assert.Equal("21:00", On("2026-11-13").Single(x => x["start"]!.GetValue<string>() == "16:00")["end"]!.GetValue<string>());
        Assert.NotEqual("21:00", On("2026-11-20").Single(x => x["start"]!.GetValue<string>() == "16:00")["end"]!.GetValue<string>());
        // Week 2 is untouched: 14 days of two shifts, less Monday's opening, plus the Rush.
        Assert.Equal(28, shifts.Count);

        // The pair applies on the added shift like on a weekly one (BR-036).
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/start");
        var rushId = Team.Id(draft["shifts"]!.AsArray().Single(x => x!["name"]?.GetValue<string>() == "Rush")!);
        await team.Owner.PostAsync($"{team.Period}/draft/assignments", new { shiftId = rushId, membershipId = lea });
        draft = await team.Owner.PostAsync($"{team.Period}/draft/assignments", new { shiftId = rushId, membershipId = marc });
        Assert.Contains(draft["issues"]!.AsArray(), x => x!["code"]!.GetValue<string>() == "issue.incompatible_pair");
    }

    [Fact]
    public async Task Day_changes_must_name_a_shift_that_runs_that_day_once_and_follow_the_shift_rules()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var (opening, _) = await BlocksAsync(team);
        var url = $"{team.Base}/generator/days";
        Task<(HttpStatusCode, string?)> Try(params object[] changes) => team.Owner.TryAsync(Put, url, new { changes });

        Assert.Equal("template.day_invalid", (await Try(new { week = 5, day = 1, kind = "removed", blockId = opening })).Item2);
        Assert.Equal("template.day_block_unknown", (await Try(new { week = 1, day = 1, kind = "removed", blockId = Guid.NewGuid() })).Item2);
        Assert.Equal("template.day_duplicate", (await Try(
            new { week = 1, day = 1, kind = "removed", blockId = opening },
            new { week = 1, day = 1, kind = "changed", blockId = opening, start = "09:00", end = "16:00" })).Item2);
        Assert.Equal("template.crosses_midnight", (await Try(new { week = 1, day = 1, kind = "changed", blockId = opening, start = "16:00", end = "10:00" })).Item2);
        Assert.Equal("template.headcount_invalid", (await Try(new { week = 1, day = 1, kind = "added", start = "11:00", end = "14:00", headcount = 0 })).Item2);
        Assert.Equal("template.name_too_long", (await Try(new { week = 1, day = 1, kind = "added", start = "11:00", end = "14:00", headcount = 1, name = new string('x', 25) })).Item2);
        // Staff never reach the generator rules.
        Assert.Equal(HttpStatusCode.Forbidden, (await team.Staff[0].TryAsync(HttpMethod.Get, url)).Status);
        Assert.Empty((await team.Owner.GetAsync(url))["changes"]!.AsArray());
    }

    [Fact]
    public async Task Opening_a_period_asks_before_using_again_the_day_changes_the_last_period_used()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var (opening, closing) = await BlocksAsync(team);
        var url = $"{team.Base}/generator/days";
        var removed = new { week = 1, day = 1, kind = "removed", blockId = opening };
        await team.Owner.SendAsync(Put, url, new { changes = new object[] { removed } });
        app.Clock.Advance(Duration.FromMinutes(5));
        await team.PublishAsync();
        app.Clock.Advance(Duration.FromMinutes(5));

        // Saving the same change again keeps when it was first saved: the period opened since then used it.
        await team.Owner.SendAsync(Put, url, new { changes = new object[] { removed } });
        var due = new { startDate = "2026-11-16", dueDate = "2026-11-13", dueTime = "18:00" };
        using (var response = await team.Owner.RawAsync(HttpMethod.Post, $"{team.Base}/periods", due))
        {
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var problem = await response.Content.ReadFromJsonAsync<JsonNode>(TestContext.Current.CancellationToken);
            Assert.Equal("period.old_day_changes", problem!["code"]!.GetValue<string>());
            Assert.Equal(1, problem["days"]![0]!["week"]!.GetValue<int>());
            Assert.Equal(1, problem["days"]![0]!["day"]!.GetValue<int>());
        }

        // A change saved after that period opened is new: alone, it asks nothing.
        await team.Owner.SendAsync(Put, url, new { changes = new object[] { new { week = 1, day = 2, kind = "removed", blockId = closing } } });
        var period = await team.Owner.PostAsync($"{team.Base}/periods", due);
        Assert.Equal("2026-11-16", period["startDate"]!.GetValue<string>());
    }

    [Fact]
    public async Task Yes_keep_them_opens_the_period_with_the_old_day_changes()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var (opening, _) = await BlocksAsync(team);
        await team.Owner.SendAsync(Put, $"{team.Base}/generator/days", new { changes = new object[] { new { week = 1, day = 1, kind = "removed", blockId = opening } } });
        app.Clock.Advance(Duration.FromMinutes(5));
        await team.PublishAsync();
        app.Clock.Advance(Duration.FromMinutes(5));

        var period = await team.Owner.PostAsync($"{team.Base}/periods", new { startDate = "2026-11-16", dueDate = "2026-11-13", dueTime = "18:00", keepOldDayChanges = true });

        var shifts = (await team.Staff[0].GetAsync($"{team.Base}/periods/{period["id"]!.GetValue<string>()}/availability/me"))["shifts"]!.AsArray();
        Assert.Single(shifts, x => x!["date"]!.GetValue<string>() == "2026-11-16");
    }
}
