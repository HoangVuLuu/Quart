using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Quart.Api.Tests;

/// <summary>End-to-end checks through the real HTTP pipeline, hosted in memory, against a real Postgres.</summary>
[Collection(PostgresCollection.Name)]
public sealed class ApiSmokeTests(PostgresFixture postgres) : IAsyncLifetime
{
    private QuartApiFactory factory = null!;

    public async ValueTask InitializeAsync() => factory = new QuartApiFactory(await postgres.CreateDatabaseAsync());

    public async ValueTask DisposeAsync() => await factory.DisposeAsync();

    [Fact]
    public async Task Health_endpoint_reports_healthy()
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Healthy_probes_are_not_logged()
    {
        using var client = factory.CreateClient();

        using var health = await client.GetAsync("/health", TestContext.Current.CancellationToken);
        using var meta = await client.GetAsync("/api/meta", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        await factory.Logs.WaitForAsync(line => line.Contains("/api/meta", StringComparison.Ordinal));
        Assert.DoesNotContain(factory.Logs.Lines, line => line.Contains("/health", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Meta_endpoint_describes_the_app_and_reports_the_database()
    {
        using var client = factory.CreateClient();

        var meta = await client.GetFromJsonAsync<JsonElement>("/api/meta", TestContext.Current.CancellationToken);

        Assert.Equal("Quart", meta.GetProperty("name").GetString());
        Assert.False(string.IsNullOrWhiteSpace(meta.GetProperty("version").GetString()));
        Assert.Equal("ok", meta.GetProperty("database").GetString());
    }

    [Fact]
    public async Task Unknown_api_route_is_a_404_problem_with_a_code()
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/does-not-exist", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal("common.not_found", problem.GetProperty("code").GetString());
    }
}
