using Quart.Api.Endpoints;
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

// Every error leaves the server as problem details carrying a machine-readable "code" (AD-023).
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions.TryAdd("code", ErrorCodes.ForStatus(context.ProblemDetails.Status));
    };
});
builder.Services.AddHealthChecks();

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

app.UseExceptionHandler();
app.UseStatusCodePages();

// Production only: the React build is copied into wwwroot by the Dockerfile.
// During development the Vite dev server serves the web app and proxies /api here.
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHealthChecks("/health");
app.MapMetaEndpoints();

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
