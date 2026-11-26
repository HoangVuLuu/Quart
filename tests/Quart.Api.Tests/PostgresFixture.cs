using Npgsql;
using Testcontainers.PostgreSql;

namespace Quart.Api.Tests;

/// <summary>
/// One real Postgres container for the whole test run, shared by every database test (AD-050).
/// Tests that change data call <see cref="CreateDatabaseAsync"/> to get a private, empty database on it.
/// Needs Docker running, unless <c>QUART_TEST_POSTGRES</c> holds the connection string of a Postgres
/// server that is already running (a superuser on a throwaway server: the tests create databases on it).
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    // Same major version as docker-compose.yml and the Supabase projects.
    private readonly string? external = Environment.GetEnvironmentVariable("QUART_TEST_POSTGRES") is { Length: > 0 } value ? value : null;
    private PostgreSqlContainer? container;

    // Every database made on a server that outlives the run, so the run can drop them at the end. One full run
    // makes about 250 of them (10 MB each): left behind, they filled a disk (2026-11-26).
    private readonly System.Collections.Concurrent.ConcurrentBag<string> created = [];

    private string ServerConnectionString => external ?? container!.GetConnectionString();

    public async ValueTask InitializeAsync()
    {
        if (external is null)
        {
            container = new PostgreSqlBuilder("postgres:17-alpine").Build();
            await container.StartAsync();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (container is not null)
        {
            // The container goes, and its databases with it.
            await container.DisposeAsync();
            return;
        }
        // A server that stays: drop what this run made. FORCE closes connections a test left open.
        NpgsqlConnection.ClearAllPools();
        await using var connection = new NpgsqlConnection(ServerConnectionString);
        await connection.OpenAsync();
        foreach (var name in created)
        {
            await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS {name} WITH (FORCE)", connection);
            await command.ExecuteNonQueryAsync();
        }
    }

    /// <summary>Creates an empty database with a unique name and returns its connection string.</summary>
    public async Task<string> CreateDatabaseAsync()
    {
        var name = $"test_{Guid.NewGuid():N}";
        await using var connection = new NpgsqlConnection(ServerConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE {name}", connection);
        await command.ExecuteNonQueryAsync();
        created.Add(name);
        return new NpgsqlConnectionStringBuilder(ServerConnectionString) { Database = name }.ConnectionString;
    }
}

[CollectionDefinition(Name)]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "Postgres";
}
