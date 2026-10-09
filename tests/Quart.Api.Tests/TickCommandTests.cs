using Npgsql;

namespace Quart.Api.Tests;

/// <summary>
/// `dotnet Quart.Api.dll tick`, run as its own process exactly as the Container Apps job runs it every
/// 5 minutes (AD-029): it runs what is due, records the heartbeat, and exits.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class TickCommandTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Tick_runs_the_due_jobs_records_the_heartbeat_then_exits()
    {
        var connectionString = await postgres.CreateDatabaseAsync();
        await ApiProcess.RunAsync("migrate", connectionString);

        var run = await ApiProcess.RunAsync("tick", connectionString);

        Assert.True(run.ExitCode == 0, run.Output);
        Assert.Contains("Tick finished", run.Output, StringComparison.Ordinal);
        Assert.NotNull(await LastTickAtAsync(connectionString));
        // With a real clock, not a test one: the job's lock is matched exactly when the job is released,
        // and Postgres keeps microseconds where .NET keeps a tenth of one.
        Assert.Equal("Pending, unlocked", await HeartbeatJobStateAsync(connectionString));
    }

    [Fact]
    public async Task A_tick_that_cannot_reach_the_database_exits_non_zero()
    {
        var run = await ApiProcess.RunAsync("tick", "Host=127.0.0.1;Port=1;Database=quart;Username=quart;Password=none;Timeout=2");

        Assert.Equal(1, run.ExitCode);
        Assert.Contains("Tick failed", run.Output, StringComparison.Ordinal);
    }

    private static async Task<string?> HeartbeatJobStateAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT status || CASE WHEN locked_until IS NULL THEN ', unlocked' ELSE ', locked' END FROM jobs.scheduled_job WHERE type = 'jobs.heartbeat'",
            connection);
        return await command.ExecuteScalarAsync(TestContext.Current.CancellationToken) as string;
    }

    private static async Task<DateTime?> LastTickAtAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand("SELECT last_tick_at FROM jobs.heartbeat", connection);
        return await command.ExecuteScalarAsync(TestContext.Current.CancellationToken) as DateTime?;
    }
}
