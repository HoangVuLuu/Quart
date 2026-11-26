using System.Net;
using System.Text.Json.Nodes;
using NodaTime;
using NodaTime.Text;

namespace Quart.Api.Tests;

/// <summary>Time off (BL-01, Hoang 2026-11-25): asked by staff, decided by a manager, honoured by the schedule.</summary>
[Collection(PostgresCollection.Name)]
public sealed class TimeOffTests(PostgresFixture postgres)
{
    private static string Date(JsonNode shift) => shift["date"]!.GetValue<string>();

    private static async Task<string> AskAsync(Team team, TestUser person, string first, string? last, string? reason = null) =>
        (await person.PostAsync($"{team.Base}/time-off", new { firstDay = first, lastDay = last, reason }))["id"]!.GetValue<string>();

    private static async Task<JsonNode> RowAsync(Team team, TestUser person) =>
        (await team.Owner.GetAsync($"{team.Base}/members")).AsArray()
            .Single(x => x!["membershipId"]!.GetValue<string>() == person.MembershipId.ToString())!;

    private static void At(TestApp app, int day, int hour = 12) =>
        app.Clock.Advance(Instant.FromUtc(2026, 11, day, hour + 5, 0) - app.Clock.GetCurrentInstant());

    [Fact]
    public async Task Accepting_takes_the_person_off_their_shifts_on_those_days_and_opens_the_places()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var before = Team.ShiftsOf(await team.PublishAsync(), team.Staff[4]);
        var paul = team.Staff[4];
        // The days off are the day of Paul's first shift and the day after, whatever the generator gave him.
        var first = LocalDatePattern.Iso.Parse(Date(before[0])).Value;
        var days = new[] { first, first.PlusDays(1) }.Select(x => LocalDatePattern.Iso.Format(x)).ToList();
        var inside = before.Where(x => days.Contains(Date(x))).ToList();

        var id = await AskAsync(team, paul, days[0], days[1], "Exams");
        var waiting = Assert.Single((await team.Owner.GetAsync($"{team.Base}/time-off")).AsArray())!;
        await team.Owner.PostAsync($"{team.Base}/time-off/{id}/accept");

        Assert.Equal("Exams", waiting["reason"]!.GetValue<string>());
        Assert.Equal(inside.Count, waiting["shiftsInDays"]!.GetValue<int>());
        var after = Team.ShiftsOf(await team.ScheduleAsync(), paul);
        Assert.Equal(before.Except(inside).Select(Team.Id), after.Select(Team.Id));
        Assert.Empty((await team.Owner.GetAsync($"{team.Base}/time-off")).AsArray());
        Assert.Contains("timeoff.accepted", await team.NotificationTypesAsync(paul));
        var row = await RowAsync(team, paul);
        Assert.True(row["worksShifts"]!.GetValue<bool>());
        Assert.Equal("2026-11-11", row["timeOff"]!["firstDay"]!.GetValue<string>());
        Assert.False(row["timeOff"]!["now"]!.GetValue<bool>());
    }

    [Fact]
    public async Task During_the_days_shifts_read_off_and_the_day_after_they_are_back_by_themselves()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var paul = team.Staff[4];
        var id = await AskAsync(team, paul, "2026-11-11", "2026-11-12");
        await team.Owner.PostAsync($"{team.Base}/time-off/{id}/accept");

        At(app, 11);
        var during = await RowAsync(team, paul);
        var mineDuring = await paul.GetAsync($"{team.Base}/time-off/mine");
        At(app, 13);
        var afterwards = await RowAsync(team, paul);

        Assert.False(during["worksShifts"]!.GetValue<bool>());
        Assert.True(during["timeOff"]!["now"]!.GetValue<bool>());
        Assert.True(mineDuring["current"]!["now"]!.GetValue<bool>());
        Assert.True(afterwards["worksShifts"]!.GetValue<bool>());
        Assert.Null(afterwards["timeOff"]);
        Assert.True((await paul.GetAsync($"{team.Base}/time-off/mine"))["canRequest"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Turning_shifts_back_on_early_ends_an_undetermined_time_off()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var paul = team.Staff[4];
        var id = await AskAsync(team, paul, "2026-11-04", null);
        await team.Owner.PostAsync($"{team.Base}/time-off/{id}/accept");
        At(app, 5);
        await team.OpenPeriodAsync();

        var offAsked = await paul.TryAsync(HttpMethod.Get, $"{team.Period}/availability/me");
        // Saving the sheet for something else leaves the time off alone.
        await team.Owner.SendAsync(HttpMethod.Patch, $"{team.Base}/members/{paul.MembershipId}", new { level = 2, worksShifts = false });
        var still = await RowAsync(team, paul);
        await team.Owner.SendAsync(HttpMethod.Patch, $"{team.Base}/members/{paul.MembershipId}", new { worksShifts = true });

        Assert.Equal((HttpStatusCode.Forbidden, "availability.not_shift_worker"), offAsked);
        Assert.True(still["timeOff"]!["now"]!.GetValue<bool>());
        var back = await RowAsync(team, paul);
        Assert.True(back["worksShifts"]!.GetValue<bool>());
        Assert.Null(back["timeOff"]);
        Assert.Contains("timeoff.ended", await team.NotificationTypesAsync(paul));
        Assert.Equal(HttpStatusCode.OK, (await paul.TryAsync(HttpMethod.Get, $"{team.Period}/availability/me")).Status);
    }

    [Fact]
    public async Task Availability_and_the_generator_skip_the_days_off()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var paul = team.Staff[4];
        var id = await AskAsync(team, paul, "2026-11-11", "2026-11-12");
        await team.Owner.PostAsync($"{team.Base}/time-off/{id}/accept");

        var schedule = await team.PublishAsync();
        var mine = (await paul.GetAsync($"{team.Period}/availability/me"))["shifts"]!.AsArray();

        Assert.All(mine.Where(x => Date(x!) is "2026-11-11" or "2026-11-12"), x => Assert.True(x!["timeOff"]!.GetValue<bool>()));
        Assert.All(mine.Where(x => Date(x!) is "2026-11-11" or "2026-11-12"), x => Assert.False(x!["selected"]!.GetValue<bool>()));
        Assert.DoesNotContain(Team.ShiftsOf(schedule, paul), x => Date(x) is "2026-11-11" or "2026-11-12");
        Assert.NotEmpty(Team.ShiftsOf(schedule, paul));
    }

    [Fact]
    public async Task Refusing_or_cancelling_leaves_everything_as_it_was()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var paul = team.Staff[4];
        var refused = await AskAsync(team, paul, "2026-11-11", "2026-11-12");
        await team.Owner.PostAsync($"{team.Base}/time-off/{refused}/refuse");
        var cancelled = await AskAsync(team, paul, "2026-11-20", null);
        await paul.PostAsync($"{team.Base}/time-off/{cancelled}/cancel");

        Assert.Contains("timeoff.refused", await team.NotificationTypesAsync(paul));
        Assert.Null((await RowAsync(team, paul))["timeOff"]);
        var mine = await paul.GetAsync($"{team.Base}/time-off/mine");
        Assert.True(mine["canRequest"]!.GetValue<bool>());
        Assert.Null(mine["current"]);
        Assert.Equal(HttpStatusCode.Conflict, (await team.Owner.TryAsync(HttpMethod.Post, $"{team.Base}/time-off/{refused}/accept")).Status);
    }

    [Fact]
    public async Task Only_staff_ask_one_at_a_time_for_days_ahead_and_only_managers_decide()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var paul = team.Staff[4];
        var stranger = await app.PersonAsync("Marc Dube");

        var manager = await team.Owner.TryAsync(HttpMethod.Post, $"{team.Base}/time-off", new { firstDay = "2026-11-11" });
        var past = await paul.TryAsync(HttpMethod.Post, $"{team.Base}/time-off", new { firstDay = "2026-11-01" });
        var backwards = await paul.TryAsync(HttpMethod.Post, $"{team.Base}/time-off", new { firstDay = "2026-11-11", lastDay = "2026-11-10" });
        var tooLong = await paul.TryAsync(HttpMethod.Post, $"{team.Base}/time-off", new { firstDay = "2026-11-11", reason = new string('x', 301) });
        var id = await AskAsync(team, paul, "2026-11-11", null);
        var second = await paul.TryAsync(HttpMethod.Post, $"{team.Base}/time-off", new { firstDay = "2026-12-01" });

        Assert.Equal((HttpStatusCode.Forbidden, "timeoff.not_staff"), manager);
        Assert.Equal((HttpStatusCode.BadRequest, "timeoff.first_day_past"), past);
        Assert.Equal((HttpStatusCode.BadRequest, "timeoff.last_before_first"), backwards);
        Assert.Equal((HttpStatusCode.BadRequest, "timeoff.reason_too_long"), tooLong);
        Assert.Equal((HttpStatusCode.Conflict, "timeoff.already_open"), second);
        Assert.False((await team.Owner.GetAsync($"{team.Base}/time-off/mine"))["canRequest"]!.GetValue<bool>());
        Assert.Equal(HttpStatusCode.Forbidden, (await team.Staff[0].TryAsync(HttpMethod.Get, $"{team.Base}/time-off")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await team.Staff[0].TryAsync(HttpMethod.Post, $"{team.Base}/time-off/{id}/accept")).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.TryAsync(HttpMethod.Get, $"{team.Base}/time-off/mine")).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await team.Staff[0].TryAsync(HttpMethod.Post, $"{team.Base}/time-off/{id}/cancel")).Status);
    }
}
