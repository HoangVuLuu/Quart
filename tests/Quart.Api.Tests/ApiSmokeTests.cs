using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Quart.Api.Tests;

/// <summary>
/// End-to-end checks through the real HTTP pipeline, hosted in memory.
/// Database-backed integration tests (Testcontainers, M0) join this project later.
/// </summary>
public sealed class ApiSmokeTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Health_endpoint_reports_healthy()
    {
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Meta_endpoint_describes_the_app()
    {
        using var client = factory.CreateClient();

        var meta = await client.GetFromJsonAsync<JsonElement>("/api/meta", TestContext.Current.CancellationToken);

        Assert.Equal("Quart", meta.GetProperty("name").GetString());
        Assert.False(string.IsNullOrWhiteSpace(meta.GetProperty("version").GetString()));
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
