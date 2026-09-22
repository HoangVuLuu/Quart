using System.Reflection;

namespace Quart.Api.Endpoints;

/// <summary>
/// GET /api/meta: what the web app shows on its home page to prove the whole chain works,
/// from browser to API (and, once the database issue lands, to Postgres).
/// </summary>
public static class MetaEndpoints
{
    public static IEndpointRouteBuilder MapMetaEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/meta", (IHostEnvironment environment) => new MetaResponse(
                Name: "Quart",
                Version: Version,
                Environment: environment.EnvironmentName,
                ServerTimeUtc: DateTimeOffset.UtcNow))
            .WithName("GetMeta");
        return endpoints;
    }

    private static string Version { get; } =
        typeof(MetaEndpoints).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? "dev";
}

public sealed record MetaResponse(string Name, string Version, string Environment, DateTimeOffset ServerTimeUtc);
