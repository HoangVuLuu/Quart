using System.Net;
using Microsoft.Extensions.DependencyInjection;
using NodaTime;
using Quart.Modules.Jobs;
using Quart.SharedKernel.Notifications;

namespace Quart.Api.Tests;

/// <summary>
/// Bundling and the Email switch (M8-07, FR-211, FR-213). Pushes and emails leave five minutes after an alert,
/// one per kind and person for everything of that kind that came in meanwhile. The Alerts tab lists each one.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class NotificationBundlingTests(PostgresFixture postgres)
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Five_changes_within_five_minutes_are_one_push_and_one_email_and_a_later_one_goes_on_its_own()
    {
        await using var app = await TestApp.StartAsync(postgres, bundle: true);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var phone = await SubscribeAsync(lea);
        var before = app.Emails.To(lea.Email).Count;

        for (var change = 0; change < 5; change++)
        {
            await NotifyAsync(app, team, lea, NotificationTypes.ScheduleChanged, new() { ["added"] = "1", ["removed"] = "0" });
            app.Clock.Advance(Duration.FromSeconds(50));
        }
        await app.Factory.Services.RunTickAsync(Cancellation);
        Assert.Empty(app.Pushes.To(phone.Endpoint));
        Assert.Equal(before, app.Emails.To(lea.Email).Count);

        app.Clock.Advance(Duration.FromMinutes(2));
        await app.Factory.Services.RunTickAsync(Cancellation);

        var push = Assert.Single(app.Pushes.To(phone.Endpoint));
        Assert.Equal("schedule.changed", push["type"]!.GetValue<string>());
        Assert.Equal(5, push["count"]!.GetValue<int>());
        var email = Assert.Single(app.Emails.To(lea.Email).Skip(before));
        Assert.Equal("Your schedule changed", email.Subject);
        Assert.Contains("Your schedule changed 5 times.", email.TextBody, StringComparison.Ordinal);
        // The Alerts tab keeps every one.
        Assert.Equal(5, (await team.NotificationTypesAsync(lea)).Count(x => x == "schedule.changed"));

        // After the bundle went out, the next change starts a new one: alone, it reads like the alert.
        await NotifyAsync(app, team, lea, NotificationTypes.ScheduleChanged, new() { ["added"] = "0", ["removed"] = "1" });
        app.Clock.Advance(Duration.FromMinutes(5));
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Equal(2, app.Pushes.To(phone.Endpoint).Count);
        Assert.Equal(1, app.Pushes.To(phone.Endpoint)[1]["count"]!.GetValue<int>());
        Assert.Contains("Your schedule changed: 0 added, 1 removed.", app.Emails.To(lea.Email)[^1].TextBody, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_period_cancelled_before_its_request_left_the_app_takes_it_back_and_sends_nothing()
    {
        await using var app = await TestApp.StartAsync(postgres, bundle: true);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var phone = await SubscribeAsync(lea);
        var before = app.Emails.To(lea.Email).Count;

        await team.OpenPeriodAsync();
        app.Clock.Advance(Duration.FromMinutes(1));
        await team.Owner.SendAsync(HttpMethod.Delete, team.Period);
        app.Clock.Advance(Duration.FromMinutes(10));
        await app.Factory.Services.RunTickAsync(Cancellation);

        // Neither the request nor the cancellation leaves the app: Léa never heard of the period.
        Assert.Empty(app.Pushes.To(phone.Endpoint));
        Assert.Equal(before, app.Emails.To(lea.Email).Count);
        var types = await team.NotificationTypesAsync(lea);
        Assert.DoesNotContain("availability.requested", types);
        Assert.Contains("period.cancelled", types);
    }

    [Fact]
    public async Task A_period_cancelled_after_its_request_went_out_is_pushed_too()
    {
        await using var app = await TestApp.StartAsync(postgres, bundle: true);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var phone = await SubscribeAsync(lea);

        await team.OpenPeriodAsync();
        app.Clock.Advance(Duration.FromMinutes(6));
        await app.Factory.Services.RunTickAsync(Cancellation);
        await team.Owner.SendAsync(HttpMethod.Delete, team.Period);
        app.Clock.Advance(Duration.FromMinutes(6));
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Equal(["availability.requested", "period.cancelled"], app.Pushes.To(phone.Endpoint).Select(x => x["type"]!.GetValue<string>()));
    }

    [Fact]
    public async Task Kinds_and_people_are_bundled_apart()
    {
        await using var app = await TestApp.StartAsync(postgres, bundle: true);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var paul = team.Staff[4];
        var leas = await SubscribeAsync(lea);
        var pauls = await SubscribeAsync(paul);

        await NotifyAsync(app, team, lea, NotificationTypes.ScheduleChanged, new() { ["added"] = "1", ["removed"] = "0" });
        await NotifyAsync(app, team, lea, NotificationTypes.SchedulePublished, new() { ["periodStart"] = "2026-11-09" });
        await NotifyAsync(app, team, paul, NotificationTypes.ScheduleChanged, new() { ["added"] = "1", ["removed"] = "0" });
        app.Clock.Advance(Duration.FromMinutes(5));
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Equal(2, app.Pushes.To(leas.Endpoint).Count);
        Assert.All(app.Pushes.To(leas.Endpoint), x => Assert.Equal(1, x["count"]!.GetValue<int>()));
        Assert.Single(app.Pushes.To(pauls.Endpoint));
    }

    [Fact]
    public async Task Alerts_read_in_the_app_before_the_bundle_goes_are_left_out_and_nothing_goes_when_all_are_read()
    {
        await using var app = await TestApp.StartAsync(postgres, bundle: true);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var phone = await SubscribeAsync(lea);
        var before = app.Emails.To(lea.Email).Count;

        for (var change = 0; change < 3; change++)
        {
            await NotifyAsync(app, team, lea, NotificationTypes.ScheduleChanged, new() { ["added"] = "1", ["removed"] = "0" });
        }
        var first = (await lea.GetAsync($"{team.Base}/notifications"))["items"]![0]!["id"]!.GetValue<string>();
        await lea.PostAsync($"{team.Base}/notifications/{first}/read");
        app.Clock.Advance(Duration.FromMinutes(5));
        await app.Factory.Services.RunTickAsync(Cancellation);
        Assert.Equal(2, Assert.Single(app.Pushes.To(phone.Endpoint))["count"]!.GetValue<int>());

        await NotifyAsync(app, team, lea, NotificationTypes.ScheduleChanged, new() { ["added"] = "1", ["removed"] = "0" });
        await lea.PostAsync($"{team.Base}/notifications/read-all");
        app.Clock.Advance(Duration.FromMinutes(5));
        await app.Factory.Services.RunTickAsync(Cancellation);
        Assert.Single(app.Pushes.To(phone.Endpoint));
        Assert.Equal(before + 1, app.Emails.To(lea.Email).Count);
    }

    [Fact]
    public async Task Email_is_on_until_the_person_turns_it_off_in_that_workplace_and_push_carries_on()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var phone = await SubscribeAsync(lea);
        var settings = $"{team.Base}/notifications/settings";

        Assert.True((await lea.GetAsync(settings))["email"]!.GetValue<bool>());
        Assert.False((await lea.SendAsync(HttpMethod.Put, settings, new { email = false }))["email"]!.GetValue<bool>());
        Assert.False((await lea.GetAsync(settings))["email"]!.GetValue<bool>());
        // Someone else's choice is their own, and a stranger cannot see a workplace's settings.
        Assert.True((await team.Staff[1].GetAsync(settings))["email"]!.GetValue<bool>());
        var stranger = await app.PersonAsync("Sam Stranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.TryAsync(HttpMethod.Get, settings)).Status);

        var before = app.Emails.To(lea.Email).Count;
        await team.PublishAsync();
        await app.Factory.Services.RunTickAsync(Cancellation);
        Assert.Equal(before, app.Emails.To(lea.Email).Count);
        Assert.Contains(app.Pushes.To(phone.Endpoint), x => x["type"]!.GetValue<string>() == "schedule.published");
        Assert.True(app.Emails.To(team.Staff[1].Email).Count > 0);

        await lea.SendAsync(HttpMethod.Put, settings, new { email = true });
        await NotifyAsync(app, team, lea, NotificationTypes.ScheduleChanged, new() { ["added"] = "1", ["removed"] = "0" });
        await app.Factory.Services.RunTickAsync(Cancellation);
        Assert.Equal(before + 1, app.Emails.To(lea.Email).Count);
    }

    private static async Task NotifyAsync(TestApp app, Team team, TestUser person, string type, Dictionary<string, string> parameters)
    {
        await using var scope = app.Factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<INotifier>().NotifyAsync(
            [new NotificationRequest(team.WorkplaceId, person.MembershipId, person.UserId, type, parameters)],
            Cancellation);
    }

    private static async Task<(string Endpoint, Guid Id)> SubscribeAsync(TestUser user)
    {
        var endpoint = $"https://push.example/{Guid.NewGuid():N}";
        var (p256dh, auth) = CapturedPushes.BrowserKeys();
        var answer = await user.PostAsync("/api/push/subscriptions", new { endpoint, keys = new { p256dh, auth }, label = "iPhone · Safari" });
        return (endpoint, Guid.Parse(answer["id"]!.GetValue<string>()));
    }
}
