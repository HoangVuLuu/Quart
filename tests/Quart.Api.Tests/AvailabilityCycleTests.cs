using System.Net;
using System.Text.Json.Nodes;
using NodaTime;
using Quart.Modules.Jobs;

namespace Quart.Api.Tests;

/// <summary>
/// The availability cycle runs by itself (FR-091, M4-05): the request on the chosen day, a deadline,
/// reminders 48 and 24 hours before it to people who have not sent, and a note to the admins when it is due.
/// The test clock starts on Monday 2 November 2026 at 09:00 in Montreal.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class AvailabilityCycleTests(PostgresFixture postgres)
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    private static async Task<int> CountAsync(TestUser person, Team team, string type) =>
        (await person.GetAsync($"{team.Base}/notifications"))["items"]!.AsArray().Count(x => x!["type"]!.GetValue<string>() == type);

    /// <summary>Moves the clock to a moment in Montreal and runs one tick, as the deployed job would.</summary>
    private static async Task TickAtAsync(TestApp app, LocalDateTime montreal)
    {
        var target = montreal.InZoneLeniently(DateTimeZoneProviders.Tzdb["America/Toronto"]).ToInstant();
        app.Clock.Advance(target - app.Clock.GetCurrentInstant());
        await app.Factory.Services.RunTickAsync(Cancellation);
    }

    private static async Task<JsonNode> OpenAsync(Team team, string start, string dueDate, string dueTime = "18:00") =>
        await team.Owner.PostAsync($"{team.Base}/periods", new { startDate = start, dueDate, dueTime });

    [Fact]
    public async Task Opening_a_period_asks_everyone_at_once()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);

        await OpenAsync(team, "2026-11-23", "2026-11-21", "00:00");

        // No day to wait for any more (2026-11-20): everyone who works shifts is asked right away.
        foreach (var person in team.Everyone)
        {
            Assert.Equal(1, await CountAsync(person, team, "availability.requested"));
        }
    }

    [Fact]
    public async Task Reminders_reach_only_people_who_have_not_sent_and_the_admins_hear_at_the_deadline()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        // Due Friday 6 November at 18:00; the request goes out at once (the default).
        await team.OpenPeriodAsync();
        var (lea, marc) = (team.Staff[0], team.Staff[1]);
        await team.SendAvailabilityAsync(lea);

        await TickAtAsync(app, new LocalDateTime(2026, 11, 4, 18, 0));
        await team.SendAvailabilityAsync(marc);
        await TickAtAsync(app, new LocalDateTime(2026, 11, 5, 18, 0));
        // A tick that runs again sends nothing twice.
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Equal(0, await CountAsync(lea, team, "availability.reminder"));
        Assert.Equal(1, await CountAsync(marc, team, "availability.reminder"));
        Assert.Equal(2, await CountAsync(team.Staff[2], team, "availability.reminder"));
        Assert.Equal(0, await CountAsync(team.Owner, team, "availability.due"));

        await TickAtAsync(app, new LocalDateTime(2026, 11, 6, 18, 0));

        var due = (await team.Owner.GetAsync($"{team.Base}/notifications"))["items"]!.AsArray().Single(x => x!["type"]!.GetValue<string>() == "availability.due")!;
        Assert.Equal("2", due["parameters"]!["sent"]!.GetValue<string>());
        Assert.Equal("7", due["parameters"]!["total"]!.GetValue<string>());
        Assert.Equal(0, await CountAsync(team.Staff[2], team, "availability.due"));
        // Nothing locks by itself (FR-100): staff can still send after the deadline.
        await team.SendAvailabilityAsync(team.Staff[2]);
        // Emailed too (FR-211), on the same tick.
        Assert.Single(app.Emails.To(team.Owner.Email), x => x.Subject == "Availability is due");
    }

    [Fact]
    public async Task A_step_waits_while_the_manager_is_building_and_nothing_is_sent_once_published()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var zone = DateTimeZoneProviders.Tzdb["America/Toronto"];

        // On Building Schedule when the 48-hour reminder is due: availability is locked, so it waits (FR-100).
        app.Clock.Advance(new LocalDateTime(2026, 11, 4, 17, 59).InZoneLeniently(zone).ToInstant() - app.Clock.GetCurrentInstant());
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        await TickAtAsync(app, new LocalDateTime(2026, 11, 4, 18, 0));
        Assert.Equal(0, await CountAsync(team.Staff[2], team, "availability.reminder"));

        // Once the manager leaves, availability unlocks and the reminder goes out on a later tick.
        await team.Owner.PostAsync($"{team.Period}/draft/leave");
        await TickAtAsync(app, new LocalDateTime(2026, 11, 4, 18, 6));
        Assert.Equal(1, await CountAsync(team.Staff[2], team, "availability.reminder"));

        // Published: the rest is not sent.
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 1 });
        await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });
        await TickAtAsync(app, new LocalDateTime(2026, 11, 6, 18, 0));
        Assert.Equal(1, await CountAsync(team.Staff[2], team, "availability.reminder"));
        Assert.Equal(0, await CountAsync(team.Owner, team, "availability.due"));
    }

    [Theory]
    [InlineData("2026-11-02", "08:00", "period.due_in_past")]
    [InlineData("2026-11-09", "00:01", "period.due_after_start")]
    [InlineData(null, null, "period.due_required")]
    [InlineData("2026-11-06", "6pm", "period.due_required")]
    public async Task A_deadline_is_required_in_the_future_and_before_the_first_day(string? dueDate, string? dueTime, string code)
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);

        var result = await team.Owner.TryAsync(HttpMethod.Post, $"{team.Base}/periods", new { startDate = "2026-11-09", dueDate, dueTime });

        Assert.Equal((HttpStatusCode.BadRequest, code), result);
    }

    [Fact]
    public async Task A_period_that_has_already_started_takes_any_deadline_before_it_ends()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);

        // Today is Monday 2 November, the first day; the period lasts two weeks (the generator rules).
        Assert.Equal((HttpStatusCode.BadRequest, "period.due_after_start"), await team.Owner.TryAsync(HttpMethod.Post, $"{team.Base}/periods", new { startDate = "2026-11-02", dueDate = "2026-11-16", dueTime = "00:01" }));
        await OpenAsync(team, "2026-11-02", "2026-11-03");
    }

    [Fact]
    public async Task The_deadline_cannot_be_moved_once_the_period_is_open()
    {
        // 2026-11-21: the deadline is set when opening the period, and only then (FR-091).
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();

        var status = (await team.Owner.TryAsync(HttpMethod.Patch, $"{team.Period}/deadline", new { dueDate = "2026-11-07", dueTime = "18:00" })).Status;

        Assert.True(status is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed, status.ToString());
    }
}
