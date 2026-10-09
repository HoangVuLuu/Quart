using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using NodaTime;
using Npgsql;
using Quart.Api.Migrations;
using Quart.Modules.Jobs;
using Quart.SharedKernel.Jobs;

namespace Quart.Api.Tests;

/// <summary>
/// The tick (AD-029) against a real Postgres, through the same public surface modules use:
/// <see cref="IJobScheduler"/> to add work, <see cref="IJobHandler"/> to run it, and the tick itself.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class JobRunnerTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly FakeClock clock = FakeClock.At(2026, 10, 8, 12, 0);
    private readonly CountingHandler counting = new();
    private string connectionString = null!;
    private QuartApiFactory factory = null!;

    private IServiceProvider Services => factory.Services;

    private IJobScheduler Scheduler => Services.GetRequiredService<IJobScheduler>();

    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        connectionString = await postgres.CreateDatabaseAsync();
        factory = new QuartApiFactory(connectionString, services: services =>
        {
            services.AddSingleton<IClock>(clock);
            services.AddSingleton<IJobHandler>(counting);
            services.AddSingleton<IJobHandler>(new FailingHandler());
            services.AddSingleton<IJobHandler>(new RecurringHandler(clock));
        });
        await Services.MigrateAllModulesAsync(Cancellation);
    }

    public async ValueTask DisposeAsync() => await factory.DisposeAsync();

    [Fact]
    public async Task Ticks_racing_on_the_same_due_jobs_run_each_job_exactly_once()
    {
        for (var i = 0; i < 20; i++)
        {
            await Scheduler.ScheduleAsync(new JobRequest(CountingHandler.JobType, clock.GetCurrentInstant()), Cancellation);
        }

        // Four ticks at once, each on its own connection. The handler is slow enough that they overlap.
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => Task.Run(() => Services.RunTickAsync(Cancellation), Cancellation)));

        Assert.Equal(20, counting.Runs.Count);
        Assert.All(counting.Runs.Values, runs => Assert.Equal(1, runs));
        Assert.All(results, result => Assert.Equal(0, result.Retried + result.Failed));
        Assert.Equal(20, await CountAsync($"type = '{CountingHandler.JobType}' AND status = 'Succeeded'"));
    }

    [Fact]
    public async Task A_failing_job_is_retried_with_backoff_and_does_not_block_the_others()
    {
        var now = clock.GetCurrentInstant();
        // Due first, so it is claimed before the job that works.
        await Scheduler.ScheduleAsync(new JobRequest(FailingHandler.JobType, now - Duration.FromMinutes(1)), Cancellation);
        await Scheduler.ScheduleAsync(new JobRequest(CountingHandler.JobType, now), Cancellation);

        var first = await Services.RunTickAsync(Cancellation);

        Assert.Equal(new TickResult(Succeeded: 2, Retried: 1, Failed: 0), first);
        Assert.Single(counting.Runs);
        Assert.Equal(("Pending", 1, now + Duration.FromMinutes(5)), await StateOfAsync(FailingHandler.JobType));

        clock.Advance(Duration.FromMinutes(4));
        Assert.Equal(0, (await Services.RunTickAsync(Cancellation)).Retried); // not due yet

        clock.Advance(Duration.FromMinutes(1));
        Assert.Equal(1, (await Services.RunTickAsync(Cancellation)).Retried);
        Assert.Equal(("Pending", 2, clock.GetCurrentInstant() + Duration.FromMinutes(10)), await StateOfAsync(FailingHandler.JobType));
    }

    [Fact]
    public async Task A_job_that_keeps_failing_gives_up_after_ten_attempts()
    {
        await Scheduler.ScheduleAsync(new JobRequest(FailingHandler.JobType, clock.GetCurrentInstant()), Cancellation);
        await ExecuteAsync($"UPDATE jobs.scheduled_job SET attempts = 9 WHERE type = '{FailingHandler.JobType}'");

        var result = await Services.RunTickAsync(Cancellation);

        Assert.Equal(1, result.Failed);
        Assert.Equal("Failed", (await StateOfAsync(FailingHandler.JobType)).Status);
        clock.Advance(Duration.FromDays(2));
        Assert.Equal(0, (await Services.RunTickAsync(Cancellation)).Failed); // never picked up again
    }

    [Fact]
    public async Task A_job_left_running_by_a_crashed_tick_is_taken_over_once_its_lock_runs_out()
    {
        var now = clock.GetCurrentInstant();
        await Scheduler.ScheduleAsync(new JobRequest(CountingHandler.JobType, now), Cancellation);
        // What a tick that died halfway through leaves behind.
        await ExecuteAsync(
            $"UPDATE jobs.scheduled_job SET status = 'Running', attempts = 1, locked_until = '{now + Duration.FromMinutes(10)}' WHERE type = '{CountingHandler.JobType}'");

        await Services.RunTickAsync(Cancellation);
        Assert.Empty(counting.Runs); // still locked by the dead tick

        clock.Advance(Duration.FromMinutes(10));
        await Services.RunTickAsync(Cancellation);

        Assert.Single(counting.Runs);
        Assert.Equal(("Succeeded", 2, now), await StateOfAsync(CountingHandler.JobType));
    }

    [Fact]
    public async Task A_job_that_asks_to_run_again_now_waits_for_the_next_tick()
    {
        await Scheduler.ScheduleAsync(new JobRequest(RecurringHandler.JobType, clock.GetCurrentInstant()), Cancellation);

        var first = await Services.RunTickAsync(Cancellation);
        var second = await Services.RunTickAsync(Cancellation);

        Assert.Equal(2, first.Succeeded); // the recurring job once and the heartbeat, not an endless loop
        Assert.Equal(2, second.Succeeded);
        Assert.Equal(("Pending", 0, clock.GetCurrentInstant()), await StateOfAsync(RecurringHandler.JobType));
    }

    [Fact]
    public async Task An_unknown_job_type_is_retried_instead_of_stopping_the_tick()
    {
        await Scheduler.ScheduleAsync(new JobRequest("test.nobody_handles_this", clock.GetCurrentInstant()), Cancellation);
        await Scheduler.ScheduleAsync(new JobRequest(CountingHandler.JobType, clock.GetCurrentInstant()), Cancellation);

        var result = await Services.RunTickAsync(Cancellation);

        Assert.Equal(1, result.Retried);
        Assert.Single(counting.Runs);
    }

    [Fact]
    public async Task The_handler_receives_the_payload_and_workplace_it_was_scheduled_with()
    {
        var workplace = Guid.NewGuid();
        var shift = Guid.NewGuid();
        await Scheduler.ScheduleAsync(
            new JobRequest(CountingHandler.JobType, clock.GetCurrentInstant()) { Payload = new ShiftPayload(shift), WorkplaceId = workplace },
            Cancellation);

        await Services.RunTickAsync(Cancellation);

        var job = Assert.Single(counting.Contexts);
        Assert.Equal(workplace, job.WorkplaceId);
        Assert.Equal(shift, job.ReadPayload<ShiftPayload>().ShiftId);
        Assert.Equal(1, job.Attempt);
    }

    [Fact]
    public async Task Scheduling_twice_with_the_same_dedupe_key_adds_one_job()
    {
        var request = new JobRequest(CountingHandler.JobType, clock.GetCurrentInstant()) { DedupeKey = "reminder:shift-42" };

        Assert.True(await Scheduler.ScheduleAsync(request, Cancellation));
        Assert.False(await Scheduler.ScheduleAsync(request, Cancellation));

        Assert.Equal(1, await CountAsync("dedupe_key = 'reminder:shift-42'"));
    }

    [Fact]
    public async Task The_heartbeat_records_each_tick_and_meta_reports_it()
    {
        using var client = factory.CreateClient();
        Assert.Equal(JsonValueKind.Null, (await GetMetaAsync(client)).GetProperty("lastTickAt").ValueKind);

        await Services.RunTickAsync(Cancellation);
        Assert.Equal(clock.GetCurrentInstant().ToDateTimeOffset(), (await GetMetaAsync(client)).GetProperty("lastTickAt").GetDateTimeOffset());

        clock.Advance(Duration.FromMinutes(5));
        await Services.RunTickAsync(Cancellation);
        Assert.Equal(clock.GetCurrentInstant().ToDateTimeOffset(), (await GetMetaAsync(client)).GetProperty("lastTickAt").GetDateTimeOffset());

        Assert.Equal(1, await CountAsync("type = 'jobs.heartbeat'")); // one row, reused by every tick
    }

    [Fact]
    public async Task Post_internal_tick_runs_a_tick_in_development()
    {
        using var client = factory.CreateClient();

        using var response = await client.PostAsync("/internal/tick", null, Cancellation);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(Cancellation);
        Assert.Equal(1, result.GetProperty("succeeded").GetInt32());
        Assert.NotEqual(JsonValueKind.Null, (await GetMetaAsync(client)).GetProperty("lastTickAt").ValueKind);
    }

    [Fact]
    public async Task Post_internal_tick_does_not_exist_outside_development()
    {
        await using var staging = new QuartApiFactory(connectionString, environment: "Staging");
        using var client = staging.CreateClient();

        using var response = await client.PostAsync("/internal/tick", null, Cancellation);

        // 405 rather than 404: the web app's fallback route matches the path, for GET only.
        Assert.Contains(response.StatusCode, new[] { HttpStatusCode.NotFound, HttpStatusCode.MethodNotAllowed });
        Assert.Equal(0, await CountAsync("type = 'jobs.heartbeat'"));
    }

    private static async Task<JsonElement> GetMetaAsync(HttpClient client) =>
        await client.GetFromJsonAsync<JsonElement>("/api/meta", Cancellation);

    private async Task<(string Status, int Attempts, Instant RunAt)> StateOfAsync(string type)
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand("SELECT status, attempts, run_at FROM jobs.scheduled_job WHERE type = @type", connection);
        command.Parameters.AddWithValue("type", type);
        await using var reader = await command.ExecuteReaderAsync(Cancellation);
        Assert.True(await reader.ReadAsync(Cancellation), $"No job of type {type}");
        return (reader.GetString(0), reader.GetInt32(1), Instant.FromDateTimeUtc(reader.GetDateTime(2)));
    }

    private async Task<long> CountAsync(string where)
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand($"SELECT count(*) FROM jobs.scheduled_job WHERE {where}", connection);
        return (long)(await command.ExecuteScalarAsync(Cancellation))!;
    }

    private async Task ExecuteAsync(string sql)
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(Cancellation);
    }

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(Cancellation);
        return connection;
    }

    private sealed record ShiftPayload(Guid ShiftId);

    /// <summary>Counts how many times each job ran. Slow on purpose, so racing ticks overlap.</summary>
    private sealed class CountingHandler : IJobHandler
    {
        public const string JobType = "test.count";

        public ConcurrentDictionary<Guid, int> Runs { get; } = new();

        public ConcurrentQueue<JobContext> Contexts { get; } = new();

        public string Type => JobType;

        public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
        {
            Runs.AddOrUpdate(job.JobId, 1, (_, runs) => runs + 1);
            Contexts.Enqueue(job);
            await Task.Delay(50, cancellationToken);
            return JobOutcome.Done;
        }
    }

    private sealed class FailingHandler : IJobHandler
    {
        public const string JobType = "test.fail";

        public string Type => JobType;

        public Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken) =>
            throw new InvalidOperationException($"Job {job.JobId} fails on purpose.");
    }

    /// <summary>Asks to run again at this very moment, which must still wait for the next tick.</summary>
    private sealed class RecurringHandler(IClock clock) : IJobHandler
    {
        public const string JobType = "test.recurring";

        public string Type => JobType;

        public Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken) =>
            Task.FromResult(JobOutcome.RunAgain(clock.GetCurrentInstant()));
    }
}
