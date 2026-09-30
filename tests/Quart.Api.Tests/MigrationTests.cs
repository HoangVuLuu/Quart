using Npgsql;
using Quart.Modules.Jobs;

namespace Quart.Api.Tests;

/// <summary>The persistence convention (docs/decisions/0011): one schema per module, nothing in public.</summary>
[Collection(PostgresCollection.Name)]
public sealed class MigrationTests(PostgresFixture postgres)
{
    /// <summary>Every module that owns tables. Add the new schema here when a module gets its first migration.</summary>
    private static readonly string[] ModuleSchemas = ["jobs"];

    [Fact]
    public async Task Migrations_apply_to_an_empty_database_and_every_table_lands_in_a_module_schema()
    {
        var connectionString = await postgres.CreateDatabaseAsync();
        await using var factory = new QuartApiFactory(connectionString);

        await factory.Services.MigrateJobsModuleAsync(TestContext.Current.CancellationToken);

        var tables = await ListTablesAsync(connectionString);
        Assert.Contains("jobs.scheduled_job", tables);
        Assert.Contains("jobs.__ef_migrations", tables);
        Assert.All(tables, table => Assert.Contains(table.Split('.')[0], ModuleSchemas));
    }

    [Fact]
    public async Task Applying_migrations_twice_changes_nothing()
    {
        var connectionString = await postgres.CreateDatabaseAsync();
        await using var factory = new QuartApiFactory(connectionString);

        await factory.Services.MigrateJobsModuleAsync(TestContext.Current.CancellationToken);
        var once = await ListTablesAsync(connectionString);
        await factory.Services.MigrateJobsModuleAsync(TestContext.Current.CancellationToken);

        Assert.Equal(once, await ListTablesAsync(connectionString));
    }

    private static async Task<List<string>> ListTablesAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT table_schema || '.' || table_name
            FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY 1
            """,
            connection);
        var tables = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        while (await reader.ReadAsync(TestContext.Current.CancellationToken))
        {
            tables.Add(reader.GetString(0));
        }

        return tables;
    }
}
