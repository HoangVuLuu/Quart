namespace Quart.Api.Endpoints;

/// <summary>
/// GET /api/diagnostics/exception: fails on purpose, to check on staging that an error reaches the
/// person as a translated message with a trace ID, and that the ID finds its log line.
/// Never mapped in Production.
/// </summary>
public static class DiagnosticsEndpoints
{
    public static IEndpointRouteBuilder MapDiagnosticsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/diagnostics/exception", IResult () =>
                throw new InvalidOperationException("Forced exception from /api/diagnostics/exception."))
            .ExcludeFromDescription();
        return endpoints;
    }
}
