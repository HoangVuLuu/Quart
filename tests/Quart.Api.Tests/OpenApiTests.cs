using System.Net;
using System.Text.Json;

namespace Quart.Api.Tests;

/// <summary>The OpenAPI description the TypeScript client is generated from (AD-021, AD-022). No Docker needed.</summary>
public sealed class OpenApiTests
{
    [Fact]
    public async Task Development_serves_the_document_with_the_shared_problem_shape()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Development");
        using var client = factory.CreateClient();

        var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json", TestContext.Current.CancellationToken)).RootElement;

        var problem = document.GetProperty("components").GetProperty("schemas").GetProperty("ApiProblem");
        Assert.Equal(["code", "traceId", "status"], problem.GetProperty("required").EnumerateArray().Select(e => e.GetString()));
        var metaErrors = document.GetProperty("paths").GetProperty("/api/meta").GetProperty("get").GetProperty("responses").GetProperty("default");
        Assert.Equal(
            "#/components/schemas/ApiProblem",
            metaErrors.GetProperty("content").GetProperty("application/problem+json").GetProperty("schema").GetProperty("$ref").GetString());
    }

    [Fact]
    public async Task Other_environments_do_not_serve_it()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Production");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/openapi/v1.json", TestContext.Current.CancellationToken);

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
    }
}
