using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Quart.Api.Tests;

/// <summary>A database outage must never take the app down with it. These tests need no Docker.</summary>
public sealed class DatabaseUnavailableTests
{
    [Fact]
    public async Task Meta_says_unavailable_and_leaks_no_error_details()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/meta", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Equal("unavailable", JsonDocument.Parse(body).RootElement.GetProperty("database").GetString());
        Assert.DoesNotContain("Npgsql", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("127.0.0.1", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Health_is_unhealthy()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task Other_endpoints_keep_working()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/does-not-exist", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal("common.not_found", problem.GetProperty("code").GetString());
    }
}
