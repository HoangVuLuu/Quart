using System.Net;
using Microsoft.Extensions.DependencyInjection;
using NodaTime;
using Npgsql;
using Quart.Modules.Jobs;
using Quart.Modules.Notifications;

namespace Quart.Api.Tests;

/// <summary>Web push, the server side (M8-06, FR-211, FR-212), with the push services replaced by <see cref="CapturedPushes"/>.</summary>
[Collection(PostgresCollection.Name)]
public sealed class PushTests(PostgresFixture postgres)
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Fact]
    public async Task The_key_is_given_to_someone_signed_in_and_only_where_push_is_set_up()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Silva");
        using var stranger = app.Browser();

        Assert.Equal(CapturedPushes.Vapid.PublicKey, (await ana.GetAsync("/api/push/key"))["publicKey"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Unauthorized, (await stranger.GetAsync("/api/push/key", Cancellation)).StatusCode);

        await using var off = await TestApp.StartAsync(postgres, settings: new Dictionary<string, string?> { ["Push:PublicKey"] = "", ["Push:PrivateKey"] = "" });
        var ben = await off.PersonAsync("Ben Roy");
        Assert.Equal((HttpStatusCode.NotFound, "push.off"), await ben.TryAsync(HttpMethod.Get, "/api/push/key"));
        var (p256dh, auth) = CapturedPushes.BrowserKeys();
        Assert.Equal((HttpStatusCode.NotFound, "push.off"), await ben.TryAsync(HttpMethod.Post, "/api/push/subscriptions", new { endpoint = "https://push.example/a", keys = new { p256dh, auth } }));
    }

    [Fact]
    public async Task A_browser_is_saved_once_and_only_an_https_endpoint_with_real_keys_is_accepted()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Silva");

        var first = await SubscribeAsync(ana, "https://push.example/ana-phone");
        var again = await SubscribeAsync(ana, "https://push.example/ana-phone");
        Assert.Equal(first.Id, again.Id);

        var (p256dh, auth) = CapturedPushes.BrowserKeys();
        foreach (var endpoint in new[] { "http://push.example/a", "https://ana:secret@push.example/a", "push.example/a", "", "ftp://push.example/a" })
        {
            Assert.Equal((HttpStatusCode.BadRequest, "push.endpoint_invalid"), await ana.TryAsync(HttpMethod.Post, "/api/push/subscriptions", new { endpoint, keys = new { p256dh, auth } }));
        }
        foreach (var keys in new object?[] { null, new { p256dh, auth = "short" }, new { p256dh = auth, auth }, new { p256dh = "not base64!", auth } })
        {
            Assert.Equal((HttpStatusCode.BadRequest, "push.keys_invalid"), await ana.TryAsync(HttpMethod.Post, "/api/push/subscriptions", new { endpoint = "https://push.example/b", keys }));
        }
    }

    [Fact]
    public async Task Only_one_s_own_browser_can_be_removed_and_a_shared_phone_belongs_to_whoever_signed_in_last()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Silva");
        var ben = await app.PersonAsync("Ben Roy");
        var anas = await SubscribeAsync(ana);

        Assert.Equal(HttpStatusCode.NotFound, (await ben.TryAsync(HttpMethod.Delete, $"/api/push/subscriptions/{anas.Id}")).Status);
        await ana.SendAsync(HttpMethod.Delete, $"/api/push/subscriptions/{anas.Id}");
        Assert.Equal(HttpStatusCode.NotFound, (await ana.TryAsync(HttpMethod.Delete, $"/api/push/subscriptions/{anas.Id}")).Status);

        // The same phone, Ana then Ben: it is Ben's now, and Ana can no longer remove it.
        var shared = await SubscribeAsync(ana, "https://push.example/shared-phone");
        Assert.Equal(shared.Id, (await SubscribeAsync(ben, "https://push.example/shared-phone")).Id);
        Assert.Equal(HttpStatusCode.NotFound, (await ana.TryAsync(HttpMethod.Delete, $"/api/push/subscriptions/{shared.Id}")).Status);
    }

    [Fact]
    public async Task Alerts_reach_every_browser_of_the_person_and_the_email_stops_for_them()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var paul = team.Staff[4];
        var phone = await SubscribeAsync(lea);
        var laptop = await SubscribeAsync(lea);
        var leaEmails = app.Emails.To(lea.Email).Count;
        var paulEmails = app.Emails.To(paul.Email).Count;

        await team.PublishAsync();
        await app.Factory.Services.RunTickAsync(Cancellation);

        foreach (var endpoint in new[] { phone.Endpoint, laptop.Endpoint })
        {
            var published = Assert.Single(app.Pushes.To(endpoint), x => x["type"]!.GetValue<string>() == "schedule.published");
            Assert.Equal("2026-11-09", published["parameters"]!["periodStart"]!.GetValue<string>());
            Assert.Equal("en", published["language"]!.GetValue<string>());
            Assert.Equal(team.Base.Split('/')[3], published["workplaceId"]!.GetValue<string>());
            Assert.NotNull(published["id"]);
        }
        // FR-211: email is the fallback for people without push.
        Assert.Equal(leaEmails, app.Emails.To(lea.Email).Count);
        Assert.True(app.Emails.To(paul.Email).Count > paulEmails);
    }

    [Fact]
    public async Task The_just_so_you_know_updates_stay_in_Alerts()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var owner = await SubscribeAsync(team.Owner);
        await team.OpenPeriodAsync();
        foreach (var person in team.Staff)
        {
            await team.SendAvailabilityAsync(person);
        }
        await team.Owner.PostAsync($"{team.Period}/availability/me/notes", new { body = "Closing only" });
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Contains("availability.sent", await team.NotificationTypesAsync(team.Owner));
        var pushed = app.Pushes.To(owner.Endpoint).Select(x => x["type"]!.GetValue<string>()).ToList();
        Assert.Contains("availability.requested", pushed);
        Assert.DoesNotContain("availability.sent", pushed);
        Assert.DoesNotContain("availability.note_added", pushed);
        Assert.DoesNotContain("member.joined", pushed);
    }

    [Fact]
    public async Task A_browser_the_push_service_no_longer_knows_is_forgotten_and_a_failure_is_tried_again()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        var gone = await SubscribeAsync(lea);
        var flaky = await SubscribeAsync(lea);
        app.Pushes.Answers[gone.Endpoint] = PushResult.Gone;
        app.Pushes.Answers[flaky.Endpoint] = PushResult.Failed;

        await team.OpenPeriodAsync();
        var first = await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.True(first.Retried > 0);
        Assert.Equal(HttpStatusCode.NotFound, (await lea.TryAsync(HttpMethod.Delete, $"/api/push/subscriptions/{gone.Id}")).Status);
        Assert.Empty(app.Pushes.To(flaky.Endpoint));

        app.Pushes.Answers.Remove(flaky.Endpoint);
        app.Clock.Advance(Duration.FromMinutes(10));
        await app.Factory.Services.RunTickAsync(Cancellation);
        Assert.Single(app.Pushes.To(flaky.Endpoint), x => x["type"]!.GetValue<string>() == "availability.requested");
    }

    [Fact]
    public async Task Signing_out_everywhere_or_deleting_the_account_forgets_every_browser()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Silva");
        var ben = await app.PersonAsync("Ben Roy");
        await SubscribeAsync(ana);
        await SubscribeAsync(ben);

        await ana.PostAsync("/api/auth/sign-out-everywhere");
        await ben.PostAsync("/api/me/delete", new { email = ben.Email });

        Assert.Equal(0, await CountAsync(app, ana.UserId));
        Assert.Equal(0, await CountAsync(app, ben.UserId));
    }

    private static async Task<(string Endpoint, Guid Id)> SubscribeAsync(TestUser user, string? endpoint = null)
    {
        endpoint ??= $"https://push.example/{Guid.NewGuid():N}";
        var (p256dh, auth) = CapturedPushes.BrowserKeys();
        var answer = await user.PostAsync("/api/push/subscriptions", new { endpoint, keys = new { p256dh, auth }, label = "iPhone · Safari" });
        return (endpoint, Guid.Parse(answer["id"]!.GetValue<string>()));
    }

    private static async Task<long> CountAsync(TestApp app, Guid userId)
    {
        await using var connection = await app.Factory.Services.GetRequiredService<NpgsqlDataSource>().OpenConnectionAsync(Cancellation);
        await using var command = new NpgsqlCommand("SELECT count(*) FROM notifications.push_subscription WHERE user_id = $1", connection);
        command.Parameters.AddWithValue(userId);
        return (long)(await command.ExecuteScalarAsync(Cancellation))!;
    }
}
