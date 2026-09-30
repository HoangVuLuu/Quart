using Npgsql;
using Testcontainers.PostgreSql;

namespace Quart.Api.Tests;

/// <summary>
/// One real Postgres container for the whole test run, shared by every database test (AD-050).
/// Tests that change data call <see cref="CreateDatabaseAsync"/> to get a private, empty database on it.
/// Needs Docker running.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    // Same major version as docker-compose.yml and the Supabase projects.
    private readonly PostgreSqlContainer container = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public async ValueTask InitializeAsync() => await container.StartAsync();

    public async ValueTask DisposeAsync() => await container.DisposeAsync();

    /// <summary>Creates an empty database with a unique name and returns its connection string.</summary>
    public async Task<string> CreateDatabaseAsync()
    {
        var name = $"test_{Guid.NewGuid():N}";
        await using var connection = new NpgsqlConnection(container.GetConnectionString());
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE {name}", connection);
        await command.ExecuteNonQueryAsync();
        return new NpgsqlConnectionStringBuilder(container.GetConnectionString()) { Database = name }.ConnectionString;
    }
}

[CollectionDefinition(Name)]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "Postgres";
}
