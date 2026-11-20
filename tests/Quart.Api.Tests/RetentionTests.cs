using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;
using NodaTime;
using Npgsql;
using Quart.Modules.Jobs;
using Quart.SharedKernel;

namespace Quart.Api.Tests;

/// <summary>Nightly deletion on the schedule spec section 13 promises (M6-05, AD-029).</summary>
[Collection(PostgresCollection.Name)]
public sealed partial class RetentionTests(PostgresFixture postgres)
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    private static readonly string[] NightlyTypes =
        ["identity.retention", "jobs.retention", "marketplace.retention", "notifications.retention", "scheduling.retention"];

    [Fact]
    public void The_retention_table_in_code_is_the_one_in_the_spec()
    {
        var spec = File.ReadAllLines(Path.Combine(RepoRoot(), "docs", "quart-project-spec.txt"));
        var start = Array.FindIndex(spec, line => line.StartsWith("13. DATA RETENTION", StringComparison.Ordinal));
        var end = Array.FindIndex(spec, start, line => line.StartsWith("Supporting rules:", StringComparison.Ordinal));
        var rows = spec[(start + 1)..end]
            .Where(line => line.StartsWith("  ", StringComparison.Ordinal) && line.Trim().Length > 0)
            .Select(line => Columns().Split(line.Trim(), 2))
            .Select(parts => (parts[0], parts[1]))
            .ToList();

        Assert.Equal(Retention.Table, rows);
    }

    [Fact]
    public async Task Each_kind_of_data_goes_one_day_after_its_time_and_not_before()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.PublishAsync(); // Monday 9 to Sunday 15 November 2026; alerts sent on 2 November
        var paul = team.Staff[4];
        await paul.PostAsync($"{team.Period}/availability/me/notes", new { body = "Exams on Thursday" });
        Assert.NotEmpty(await team.NotificationTypesAsync(team.Owner));

        // Alerts: 60 days. Sessions last 30 days, so the owner signs in again after each long night.
        await NightAsync(app, new LocalDate(2026, 12, 31));
        Assert.NotEmpty(await team.NotificationTypesAsync(await SignInAgainAsync(app, team.Owner)));
        await NightAsync(app, new LocalDate(2027, 1, 2));
        Assert.Empty(await team.NotificationTypesAsync(await SignInAgainAsync(app, team.Owner)));

        // Availability and its notes: 60 days after the last day, 15 November.
        await NightAsync(app, new LocalDate(2027, 1, 14));
        var owner = await SignInAgainAsync(app, team.Owner);
        var kept = await owner.GetAsync($"{team.Period}/availability/{paul.MembershipId}");
        Assert.Equal("sent", kept["status"]!.GetValue<string>());
        Assert.NotEmpty(kept["notes"]!.AsArray());
        await NightAsync(app, new LocalDate(2027, 1, 15));
        var gone = await owner.GetAsync($"{team.Period}/availability/{paul.MembershipId}");
        Assert.Equal("not_sent", gone["status"]!.GetValue<string>());
        Assert.Empty(gone["notes"]!.AsArray());

        // The schedule: 2 months after the last day.
        Assert.NotEmpty(Team.ShiftsOf(await team.ScheduleAsync(owner), paul));
        await NightAsync(app, new LocalDate(2027, 1, 16));
        Assert.Equal(System.Net.HttpStatusCode.NotFound, (await owner.TryAsync(HttpMethod.Get, $"{team.Period}/schedule")).Status);
        Assert.Equal(0, await CountAsync(app, "SELECT count(*) FROM scheduling.schedule_version"));
        Assert.Equal(0, await CountAsync(app, "SELECT count(*) FROM scheduling.generation_run"));
        Assert.Equal(0, await CountAsync(app, "SELECT count(*) FROM scheduling.assignment"));

        // Housekeeping.
        Assert.Equal(0, await CountAsync(app, "SELECT count(*) FROM notifications.outbox_message"));
        Assert.Equal(0, await CountAsync(app, "SELECT count(*) FROM identity.account_link"));
        Assert.Equal(0, await CountAsync(app, "SELECT count(*) FROM identity.session WHERE expires_at < '2027-01-15T00:00:00Z'"));
        Assert.Equal(0, await CountAsync(app, "SELECT count(*) FROM jobs.scheduled_job WHERE status IN ('Succeeded', 'Failed') AND run_at < '2026-12-01'"));
    }

    [Fact]
    public async Task Every_module_s_cleanup_waits_for_the_night_then_comes_back_the_next_one()
    {
        await using var app = await TestApp.StartAsync(postgres, Instant.FromUtc(2026, 11, 20, 17, 0)); // noon in Montreal
        await app.Factory.Services.RunTickAsync(Cancellation);
        var tonight = Instant.FromUtc(2026, 11, 21, 8, 0); // 03:00 in Montreal
        Assert.Equal(NightlyTypes.Select(type => (type, "Pending", tonight)), await NightlyJobsAsync(app));

        app.Clock.Advance(tonight - app.Clock.GetCurrentInstant() + Duration.FromMinutes(1));
        var result = await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Equal(0, result.Retried + result.Failed);
        Assert.Equal(NightlyTypes.Select(type => (type, "Pending", tonight + Duration.FromDays(1))), await NightlyJobsAsync(app));
    }

    [Fact]
    public async Task An_account_whose_email_was_never_confirmed_goes_7_days_after_sign_up()
    {
        await using var app = await TestApp.StartAsync(postgres); // Monday 2 November, 09:00 in Montreal
        using var browser = app.Browser();
        using var signUp = await browser.PostAsJsonAsync(
            "/api/auth/sign-up", new { fullName = "Una Never", email = "una@quart.test", password = TestApp.Password, language = "en" }, Cancellation);
        Assert.Equal(System.Net.HttpStatusCode.Accepted, signUp.StatusCode);
        var confirmed = await app.PersonAsync("Carl Sure", "carl@quart.test");
        const string Accounts = "SELECT count(*) FROM identity.\"user\" WHERE email = '{0}'";

        await NightAsync(app, new LocalDate(2026, 11, 9)); // 6 days and 18 hours
        Assert.Equal(1, await CountAsync(app, string.Format(System.Globalization.CultureInfo.InvariantCulture, Accounts, "una@quart.test")));
        await NightAsync(app, new LocalDate(2026, 11, 10)); // 7 days and 18 hours

        Assert.Equal(0, await CountAsync(app, string.Format(System.Globalization.CultureInfo.InvariantCulture, Accounts, "una@quart.test")));
        Assert.Equal(1, await CountAsync(app, string.Format(System.Globalization.CultureInfo.InvariantCulture, Accounts, "carl@quart.test")));
        Assert.Equal(0, await CountAsync(app, "SELECT count(*) FROM identity.account_link"));
        // The address is simply free.
        await app.PersonAsync("Una Never", "una@quart.test");
    }

    /// <summary>The ticks of one night in Montreal: one just before 03:00 creates the jobs if needed, one just after runs them.</summary>
    private static async Task NightAsync(TestApp app, LocalDate date)
    {
        var zone = DateTimeZoneProviders.Tzdb["America/Toronto"];
        foreach (var time in new[] { new LocalTime(2, 59), new LocalTime(3, 1) })
        {
            var at = date.At(time).InZoneLeniently(zone).ToInstant();
            app.Clock.Advance(at - app.Clock.GetCurrentInstant());
            var result = await app.Factory.Services.RunTickAsync(Cancellation);
            Assert.Equal(0, result.Failed);
        }
    }

    private static async Task<TestUser> SignInAgainAsync(TestApp app, TestUser person)
    {
        var client = app.Browser();
        await TestApp.SignInAsync(client, person.Email);
        return new TestUser(client, person.UserId, person.Email, person.FullName) { MembershipId = person.MembershipId };
    }

    private static async Task<List<(string Type, string Status, Instant RunAt)>> NightlyJobsAsync(TestApp app)
    {
        await using var connection = await app.Factory.Services.GetRequiredService<NpgsqlDataSource>().OpenConnectionAsync(Cancellation);
        await using var command = new NpgsqlCommand("SELECT type, status, run_at FROM jobs.scheduled_job WHERE type LIKE '%.retention' ORDER BY type", connection);
        await using var reader = await command.ExecuteReaderAsync(Cancellation);
        var jobs = new List<(string, string, Instant)>();
        while (await reader.ReadAsync(Cancellation))
        {
            jobs.Add((reader.GetString(0), reader.GetString(1), reader.GetFieldValue<Instant>(2)));
        }
        return jobs;
    }

    private static async Task<long> CountAsync(TestApp app, string sql)
    {
        await using var connection = await app.Factory.Services.GetRequiredService<NpgsqlDataSource>().OpenConnectionAsync(Cancellation);
#pragma warning disable CA2100 // fixed SQL written in this file
        await using var command = new NpgsqlCommand(sql, connection);
#pragma warning restore CA2100
        return (long)(await command.ExecuteScalarAsync(Cancellation))!;
    }

    private static string RepoRoot()
    {
        var folder = new DirectoryInfo(AppContext.BaseDirectory);
        while (folder is not null && !File.Exists(Path.Combine(folder.FullName, "Quart.slnx")))
        {
            folder = folder.Parent;
        }
        return folder?.FullName ?? throw new InvalidOperationException("Could not find Quart.slnx above the test output folder.");
    }

    [GeneratedRegex(@"\s{2,}")]
    private static partial Regex Columns();
}
