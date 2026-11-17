using System.Text.Json.Nodes;
using Quart.Modules.Jobs;
using Quart.Modules.Notifications.Email;

namespace Quart.Api.Tests;

/// <summary>Notifications that also go out by email (FR-211), in the recipient's language (FR-261).</summary>
[Collection(PostgresCollection.Name)]
public sealed class NotificationEmailTests(PostgresFixture postgres)
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Publishing_emails_every_member_once_in_their_own_language_on_the_next_tick()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0];
        await lea.SendAsync(HttpMethod.Patch, "/api/me", new { language = "fr" });

        await team.PublishAsync();
        // Sent by a job, so publishing never waits on the email provider.
        Assert.DoesNotContain(app.Emails.Sent, x => x.Subject == "The new schedule is out");
        await app.Factory.Services.RunTickAsync(Cancellation);

        foreach (var person in team.Everyone)
        {
            var french = person == lea;
            var published = Assert.Single(app.Emails.To(person.Email), x => x.Subject == (french ? "Le nouvel horaire est publié" : "The new schedule is out"));
            Assert.Contains(french ? "est publié." : "is published.", published.TextBody, StringComparison.Ordinal);
            Assert.Contains("https://quart.test/schedule", published.TextBody, StringComparison.Ordinal);
        }
        // Joining and sending availability are in-app only: the owner got nothing else by email.
        var ownerSubjects = app.Emails.To(team.Owner.Email).Select(x => x.Subject).ToList();
        Assert.Equal(["Confirm your email for Quart", "Send your availability", "The new schedule is out"], ownerSubjects);
    }

    [Fact]
    public async Task An_email_is_sent_once_even_when_the_tick_runs_again()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.PublishAsync();

        await app.Factory.Services.RunTickAsync(Cancellation);
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Single(app.Emails.To(team.Staff[1].Email), x => x.Subject == "The new schedule is out");
    }

    [Fact]
    public async Task A_provider_outage_is_retried_later_instead_of_lost()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.PublishAsync();
        app.Emails.Down = true;
        await app.Factory.Services.RunTickAsync(Cancellation);
        app.Emails.Down = false;

        app.Clock.Advance(NodaTime.Duration.FromMinutes(6));
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Single(app.Emails.To(team.Staff[2].Email), x => x.Subject == "The new schedule is out");
    }

    [Fact]
    public async Task Every_emailed_type_repeats_the_in_app_sentence_in_both_languages()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (!File.Exists(Path.Combine(root.FullName, "Quart.slnx")))
        {
            root = root.Parent ?? throw new InvalidOperationException("Repository root not found.");
        }
        foreach (var language in new[] { "en", "fr" })
        {
            var json = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(root.FullName, "src", "web", "src", "i18n", "locales", $"{language}.json"), Cancellation))!;
            var types = json["alerts"]!["types"]!;
            foreach (var type in NotificationEmails.Types)
            {
                var (group, name) = (type[..type.IndexOf('.', StringComparison.Ordinal)], type[(type.IndexOf('.', StringComparison.Ordinal) + 1)..]);
                var web = (types[type] ?? types[group]?[name])?.GetValue<string>();
                Assert.True(web is not null, $"No in-app text for {type} in {language}.");
                Assert.Equal(web!.Replace("{{", "{", StringComparison.Ordinal).Replace("}}", "}", StringComparison.Ordinal), NotificationEmails.Sentence(type, language));
            }
        }
    }
}
