using System.Text.Json.Serialization;
using Npgsql;
using Quart.Api.Endpoints;
using Quart.Api.Logging;
using Quart.Api.OpenApi;
using Quart.Api.Security;
using Quart.Modules.Announcements;
using Quart.Modules.Files;
using Quart.Modules.Identity;
using Quart.Modules.Jobs;
using Quart.Modules.Marketplace;
using Quart.Modules.Notifications;
using Quart.Modules.Scheduling;
using Quart.Modules.Workplaces;
using Quart.SharedKernel;

var builder = WebApplication.CreateBuilder(args);

builder.AddQuartLogging();
builder.AddQuartSecurity();

// Every error leaves the server as problem details carrying a machine-readable "code" (AD-023),
// and the trace ID of its log line, so a screenshot of the error is enough to find what happened.
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions.TryAdd("code", ErrorCodes.ForStatus(context.ProblemDetails.Status));
        context.ProblemDetails.Extensions["traceId"] = QuartLogging.TraceIdOf(context.HttpContext);
    };
});

// One data source for the whole app; every module's DbContext draws connections from it (AD-015).
// The build runs the app without configuration to write the OpenAPI document; it never connects.
var connectionString = builder.Configuration.GetConnectionString("Quart")
    ?? (QuartOpenApi.IsGeneratingDocument ? "Host=localhost" : null)
    ?? throw new InvalidOperationException("Connection string 'Quart' is missing. Set ConnectionStrings__Quart.");
builder.Services.AddSingleton(new NpgsqlDataSourceBuilder(connectionString).UseNodaTime().Build());
// Numbers are numbers: no quoted "42" accepted, and the OpenAPI types say plain "integer".
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
builder.Services.AddQuartOpenApi();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>(DatabaseHealthCheck.Name);

builder.Services
    .AddIdentityModule()
    .AddWorkplacesModule()
    .AddSchedulingModule()
    .AddMarketplaceModule()
    .AddAnnouncementsModule()
    .AddFilesModule()
    .AddNotificationsModule()
    .AddJobsModule();

var app = builder.Build();

// Development only. Every other environment migrates through the explicit step from M0-08.
if (app.Environment.IsDevelopment())
{
    try
    {
        await app.Services.MigrateJobsModuleAsync();
    }
    catch (Exception exception)
    {
        // The app must still start and say "Database: unavailable" when Postgres is not running.
        app.Logger.LogWarning(exception, "Could not apply database migrations. Is `docker compose up -d` running?");
    }
}

app.UseQuartSecurity();
app.UseQuartRequestLogging();
app.UseExceptionHandler();
app.UseStatusCodePages();

// Production only: the React build is copied into wwwroot by the Dockerfile.
// During development the Vite dev server serves the web app and proxies /api here.
app.UseDefaultFiles();
app.UseStaticFiles();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // /openapi/v1.json
}
app.MapHealthChecks("/health");
app.MapMetaEndpoints();
if (!app.Environment.IsProduction())
{
    app.MapDiagnosticsEndpoints();
}

app.MapIdentityModule();
app.MapWorkplacesModule();
app.MapSchedulingModule();
app.MapMarketplaceModule();
app.MapAnnouncementsModule();
app.MapFilesModule();
app.MapNotificationsModule();
app.MapJobsModule();

// An unknown /api route is a 404 with a code, never the web app's index.html.
app.MapFallback("/api/{**path}", () => Results.Problem(
    statusCode: StatusCodes.Status404NotFound,
    extensions: new Dictionary<string, object?> { ["code"] = ErrorCodes.NotFound }));
// Every other unknown route belongs to the web app's client-side router.
app.MapFallbackToFile("index.html");

app.Run();

/// <summary>Exposed so integration tests can host the app with WebApplicationFactory.</summary>
public partial class Program
{
}
