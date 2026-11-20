using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using NodaTime;
using Npgsql;

namespace Quart.Api.Tests;

/// <summary>Delete my account (FR-009, M2-16, mockup 1g-del).</summary>
[Collection(PostgresCollection.Name)]
public sealed class AccountDeletionTests(PostgresFixture postgres)
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Deleting_an_account_leaves_every_workplace_and_past_shifts_read_as_former_employee()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.PublishAsync();
        var paul = team.Staff[4];
        await paul.PostAsync($"{team.Period}/availability/me/notes", new { body = "Exams on Thursday" });
        // Wednesday 12 November, 10:30 in Montreal: what started is kept, the rest is ahead.
        app.Clock.Advance(Instant.FromUtc(2026, 11, 12, 15, 30) - app.Clock.GetCurrentInstant());
        var before = Team.ShiftsOf(await team.ScheduleAsync(), paul);
        var now = app.Clock.GetCurrentInstant();
        Assert.Contains(before, x => Start(x) < now);
        Assert.Contains(before, x => Start(x) > now);

        await paul.PostAsync("/api/me/delete", new { email = paul.Email.ToUpperInvariant() });

        var after = await team.ScheduleAsync();
        var kept = Team.ShiftsOf(after, paul);
        Assert.Equal(before.Where(x => Start(x) < now).Select(Team.Id), kept.Select(Team.Id));
        Assert.All(kept, shift => Assert.Null(
            shift["people"]!.AsArray().Single(p => p!["membershipId"]!.GetValue<string>() == paul.MembershipId.ToString())!["name"]));
        Assert.Contains("member.left", await team.NotificationTypesAsync(team.Owner));
        Assert.Equal(HttpStatusCode.NotFound, (await team.Owner.TryAsync(HttpMethod.Get, $"{team.Period}/availability/{paul.MembershipId}")).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await paul.TryAsync(HttpMethod.Get, "/api/me")).Status);
        var goodbye = Assert.Single(app.Emails.To(paul.Email), x => x.Subject == "Your Quart account was deleted");
        Assert.Contains("Former employee", goodbye.TextBody, StringComparison.Ordinal);

        // No table in any schema still holds the email or the full name. The short name stays only in other
        // people's alerts ("Paul C. left"), which the nightly cleanup removes after 60 days.
        var found = await TablesHoldingAsync(app, paul.Email, paul.FullName, "Exams on Thursday");
        Assert.Empty(found);
        Assert.Equal(["notifications.notification"], await TablesHoldingAsync(app, "Paul C."));

        // The address is free again.
        var again = await app.PersonAsync("Paul Chen", paul.Email);
        Assert.Empty((await again.GetAsync("/api/workplaces")).AsArray());
    }

    [Fact]
    public async Task An_owner_must_hand_over_the_workplace_first()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);

        Assert.Equal((HttpStatusCode.Conflict, "auth.owns_workplace"), await team.Owner.TryAsync(HttpMethod.Post, "/api/me/delete", new { email = team.Owner.Email }));

        Assert.Equal(team.Owner.Email, (await team.Owner.GetAsync("/api/me"))["email"]!.GetValue<string>());
        Assert.DoesNotContain(app.Emails.To(team.Owner.Email), x => x.Subject.Contains("deleted", StringComparison.Ordinal));
    }

    [Fact]
    public async Task The_typed_email_must_be_the_account_s_own()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var paul = team.Staff[4];

        Assert.Equal((HttpStatusCode.BadRequest, "auth.delete_email_mismatch"), await paul.TryAsync(HttpMethod.Post, "/api/me/delete", new { email = team.Owner.Email }));
        Assert.Equal((HttpStatusCode.BadRequest, "auth.delete_email_mismatch"), await paul.TryAsync(HttpMethod.Post, "/api/me/delete", new { email = (string?)null }));

        Assert.Equal(paul.Email, (await paul.GetAsync("/api/me"))["email"]!.GetValue<string>());
        Assert.NotEmpty((await paul.GetAsync("/api/workplaces")).AsArray());
    }

    [Fact]
    public async Task Someone_signed_out_cannot_delete_anything()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var paul = await app.PersonAsync("Paul Chen");
        using var stranger = app.Browser();

        using var response = await stranger.PostAsJsonAsync("/api/me/delete", new { email = paul.Email }, Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(paul.Email, (await paul.GetAsync("/api/me"))["email"]!.GetValue<string>());
    }

    private static Instant Start(System.Text.Json.Nodes.JsonNode shift)
    {
        var date = NodaTime.Text.LocalDatePattern.Iso.Parse(shift["date"]!.GetValue<string>()).Value;
        var time = NodaTime.Text.LocalTimePattern.CreateWithInvariantCulture("HH:mm").Parse(shift["start"]!.GetValue<string>()).Value;
        return date.At(time).InZoneLeniently(DateTimeZoneProviders.Tzdb["America/Toronto"]).ToInstant();
    }

    /// <summary>Every table, in every module's schema, with a row whose text contains any of <paramref name="values"/>.</summary>
    private static async Task<List<string>> TablesHoldingAsync(TestApp app, params string[] values)
    {
        await using var connection = await app.Factory.Services.GetRequiredService<NpgsqlDataSource>().OpenConnectionAsync(Cancellation);
        var tables = new List<string>();
        await using (var list = new NpgsqlCommand(
            "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema IN ('identity', 'workplaces', 'scheduling', 'marketplace', 'notifications', 'jobs') ORDER BY 1",
            connection))
        await using (var reader = await list.ExecuteReaderAsync(Cancellation))
        {
            while (await reader.ReadAsync(Cancellation))
            {
                tables.Add(reader.GetString(0));
            }
        }
        var found = new List<string>();
        foreach (var table in tables)
        {
            // Table names come from the catalogue above, never from input.
#pragma warning disable CA2100
            await using var command = new NpgsqlCommand($"SELECT EXISTS (SELECT 1 FROM {table} t WHERE lower(row_to_json(t)::text) LIKE ANY ($1))", connection);
#pragma warning restore CA2100
            command.Parameters.AddWithValue(values.Select(x => "%" + x.ToLowerInvariant() + "%").ToArray());
            if ((bool)(await command.ExecuteScalarAsync(Cancellation))!)
            {
                found.Add(table);
            }
        }
        return found;
    }
}
