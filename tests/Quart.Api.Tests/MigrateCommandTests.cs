using Npgsql;

namespace Quart.Api.Tests;

/// <summary>
/// `dotnet Quart.Api.dll migrate`, run as its own process exactly as the Container Apps job runs it
/// (spec 11.3): migrations apply once, a second run is a no-op, a failure is a non-zero exit code.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class MigrateCommandTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Migrate_creates_the_module_schemas_then_exits()
    {
        var connectionString = await postgres.CreateDatabaseAsync();

        var run = await RunMigrateAsync(connectionString);

        Assert.True(run.ExitCode == 0, run.Output);
        Assert.Contains("jobs", await ListSchemasAsync(connectionString));
        Assert.Contains("up to date", run.Output, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Running_it_again_is_a_no_op()
    {
        var connectionString = await postgres.CreateDatabaseAsync();
        await RunMigrateAsync(connectionString);
        var applied = await CountAppliedMigrationsAsync(connectionString);

        var again = await RunMigrateAsync(connectionString);

        Assert.True(again.ExitCode == 0, again.Output);
        Assert.Equal(applied, await CountAppliedMigrationsAsync(connectionString));
    }

    [Fact]
    public async Task A_failure_exits_non_zero_so_the_deploy_stops()
    {
        var run = await RunMigrateAsync("Host=127.0.0.1;Port=1;Database=quart;Username=quart;Password=none;Timeout=2");

        Assert.Equal(1, run.ExitCode);
        Assert.Contains("Migration failed", run.Output, StringComparison.Ordinal);
    }

    private static Task<(int ExitCode, string Output)> RunMigrateAsync(string connectionString) =>
        ApiProcess.RunAsync("migrate", connectionString);

    private static async Task<List<string>> ListSchemasAsync(string connectionString) =>
        await QueryAsync(connectionString, "SELECT schema_name FROM information_schema.schemata", reader => reader.GetString(0));

    private static async Task<long> CountAppliedMigrationsAsync(string connectionString) =>
        (await QueryAsync(connectionString, "SELECT count(*) FROM jobs.__ef_migrations", reader => reader.GetInt64(0)))[0];

    private static async Task<List<T>> QueryAsync<T>(string connectionString, string sql, Func<NpgsqlDataReader, T> read)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        var rows = new List<T>();
        while (await reader.ReadAsync(TestContext.Current.CancellationToken))
        {
            rows.Add(read(reader));
        }
        return rows;
    }
}
