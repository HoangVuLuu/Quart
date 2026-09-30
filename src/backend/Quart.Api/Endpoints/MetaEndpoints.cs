using System.Reflection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Quart.Api.Endpoints;

/// <summary>
/// GET /api/meta: what the web app shows on its home page to prove the whole chain works,
/// from browser to API to Postgres.
/// </summary>
public static class MetaEndpoints
{
    public static IEndpointRouteBuilder MapMetaEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/meta", async (IHostEnvironment environment, HealthCheckService health, CancellationToken cancellationToken) =>
            {
                var database = await health.CheckHealthAsync(check => check.Name == DatabaseHealthCheck.Name, cancellationToken);
                return new MetaResponse(
                    Name: "Quart",
                    Version: Version,
                    Environment: environment.EnvironmentName,
                    ServerTimeUtc: DateTimeOffset.UtcNow,
                    Database: database.Status == HealthStatus.Healthy ? "ok" : "unavailable");
            })
            .WithName("GetMeta");
        return endpoints;
    }

    private static string Version { get; } =
        typeof(MetaEndpoints).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? "dev";
}

/// <param name="Database">"ok" or "unavailable". Never an error message: those stay in the server log.</param>
public sealed record MetaResponse(string Name, string Version, string Environment, DateTimeOffset ServerTimeUtc, string Database);
