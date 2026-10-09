using System.Reflection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Quart.Modules.Jobs;

namespace Quart.Api.Endpoints;

/// <summary>
/// GET /api/meta: what the web app shows on its home page to prove the whole chain works,
/// from browser to API to Postgres, and that background jobs run.
/// </summary>
public static class MetaEndpoints
{
    public static IEndpointRouteBuilder MapMetaEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/meta", async (IHostEnvironment environment, HealthCheckService health, ITickStatus ticks, ILoggerFactory loggers, CancellationToken cancellationToken) =>
            {
                var database = await health.CheckHealthAsync(check => check.Name == DatabaseHealthCheck.Name, cancellationToken);
                var databaseOk = database.Status == HealthStatus.Healthy;
                return new MetaResponse(
                    Name: "Quart",
                    Version: Version,
                    Environment: environment.EnvironmentName,
                    ServerTimeUtc: DateTimeOffset.UtcNow,
                    Database: databaseOk ? "ok" : "unavailable",
                    LastTickAt: databaseOk ? await LastTickAtAsync(ticks, loggers, cancellationToken) : null);
            })
            .WithName("GetMeta");
        return endpoints;
    }

    // Like the database status, a failure here is a null, never an error page: the home page must still render.
    private static async Task<DateTimeOffset?> LastTickAtAsync(ITickStatus ticks, ILoggerFactory loggers, CancellationToken cancellationToken)
    {
        try
        {
            return (await ticks.GetLastTickAtAsync(cancellationToken))?.ToDateTimeOffset();
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            loggers.CreateLogger(typeof(MetaEndpoints)).LogWarning(exception, "Could not read the last tick time");
            return null;
        }
    }

    private static string Version { get; } =
        typeof(MetaEndpoints).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? "dev";
}

/// <param name="Database">"ok" or "unavailable". Never an error message: those stay in the server log.</param>
/// <param name="LastTickAt">When background jobs last ran (the heartbeat job), or null if they never have or it is unknown.</param>
public sealed record MetaResponse(string Name, string Version, string Environment, DateTimeOffset ServerTimeUtc, string Database, DateTimeOffset? LastTickAt);
