using System.Diagnostics;
using System.Security.Claims;
using Microsoft.AspNetCore.Diagnostics;
using Serilog;
using Serilog.AspNetCore;
using Serilog.Core;
using Serilog.Events;
using Serilog.Formatting;
using Serilog.Formatting.Compact;

namespace Quart.Api.Logging;

/// <summary>
/// Structured logging that stays cheap and never logs personal data (spec 11.5, 12.2, decision 0012).
/// Compact JSON on stdout, which Container Apps collects. Production keeps only warnings plus one
/// summary line per request, and that line names the route template, never the path or query string.
/// </summary>
public static class QuartLogging
{
    /// <summary>The one format every log line is written in. Tests format captured events with it too.</summary>
    public static ITextFormatter Formatter { get; } = new CompactJsonFormatter();

    private const string RequestSummarySource = "Serilog.AspNetCore.RequestLoggingMiddleware";

    public static WebApplicationBuilder AddQuartLogging(this WebApplicationBuilder builder)
    {
        builder.Services.AddSerilog(
            (services, logger) => logger
                // Levels come from the "Serilog" section so staging can be turned up with an environment
                // variable (Serilog__MinimumLevel__Default=Information) without a deploy.
                .ReadFrom.Configuration(builder.Configuration)
                // Whatever the configuration says: the request summary line always gets through, and
                // ASP.NET Core's own request logs, which contain full URLs and query strings, never do.
                .MinimumLevel.Override(RequestSummarySource, LogEventLevel.Information)
                .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
                .Enrich.With<DropRequestPath>()
                // Extra sinks registered in DI (integration tests capture output this way).
                .ReadFrom.Services(services)
                .WriteTo.Console(Formatter),
            // Every WebApplicationFactory in a test run gets its own logger instead of sharing Log.Logger.
            preserveStaticLogger: true);

        // A failed request is logged once: the exception travels on its summary line.
        builder.Services.AddExceptionHandler<AttachExceptionToRequestSummary>();
        builder.Services.Configure<ExceptionHandlerOptions>(options => options.SuppressDiagnosticsCallback = _ => true);
        return builder;
    }

    /// <summary>One line per request: method, route template, status and duration. Goes first in the pipeline.</summary>
    public static IApplicationBuilder UseQuartRequestLogging(this WebApplication app) =>
        app.UseSerilogRequestLogging(options =>
        {
            options.Logger = app.Services.GetRequiredService<Serilog.ILogger>();
            options.MessageTemplate = "HTTP {RequestMethod} {RouteTemplate} responded {StatusCode} in {Elapsed:0} ms";
            options.GetMessageTemplateProperties = (context, _, elapsed, status) =>
            [
                new LogEventProperty("RequestMethod", new ScalarValue(context.Request.Method)),
                new LogEventProperty("RouteTemplate", new ScalarValue(RouteTemplateOf(context))),
                new LogEventProperty("StatusCode", new ScalarValue(status)),
                new LogEventProperty("Elapsed", new ScalarValue(elapsed)),
            ];
            options.GetLevel = (context, _, exception) =>
                exception is not null || context.Response.StatusCode >= 500 ? LogEventLevel.Error
                // Health probes run every few seconds; a healthy answer is not worth paying to store.
                : context.Request.Path.StartsWithSegments("/health") ? LogEventLevel.Verbose
                : LogEventLevel.Information;
            options.EnrichDiagnosticContext = (diagnostics, context) =>
            {
                // IDs only, never names or emails (12.2). Membership IDs join here once AD-026 lands.
                if (context.User.FindFirstValue(ClaimTypes.NameIdentifier) is { } userId)
                {
                    diagnostics.Set("UserId", userId);
                }
            };
        });

    /// <summary>The ID a person quotes from an error message, and the one on every log line of that request.</summary>
    public static string TraceIdOf(HttpContext context) =>
        Activity.Current?.TraceId.ToHexString() ?? context.TraceIdentifier;

    // The template ("/api/workplaces/{id}"), not the path: paths can carry tokens and email addresses.
    // The exception handler clears the endpoint before writing its response, but keeps the original.
    private static string RouteTemplateOf(HttpContext context) =>
        (context.GetEndpoint() ?? context.Features.Get<IExceptionHandlerFeature>()?.Endpoint) switch
        {
            RouteEndpoint route => route.RoutePattern.RawText ?? "(unnamed route)",
            _ => "(no endpoint)",
        };

    /// <summary>
    /// ASP.NET Core puts the raw request path on every event logged during a request. Drop it, so a
    /// warning from anywhere in the app cannot carry an email address or token that was in the URL.
    /// </summary>
    private sealed class DropRequestPath : ILogEventEnricher
    {
        public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
        {
            logEvent.RemovePropertyIfPresent("RequestPath");
            logEvent.RemovePropertyIfPresent("QueryString");
        }
    }

    /// <summary>
    /// Hands an unhandled exception to the request summary line instead of letting the exception handler
    /// log it separately, so a trace ID finds exactly one log entry. Returns false: the exception handler
    /// still writes the problem-details response.
    /// </summary>
    private sealed class AttachExceptionToRequestSummary(IDiagnosticContext diagnostics) : IExceptionHandler
    {
        public ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
        {
            diagnostics.SetException(exception);
            return ValueTask.FromResult(false);
        }
    }
}
