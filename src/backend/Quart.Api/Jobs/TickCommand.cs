using Quart.Modules.Jobs;

namespace Quart.Api.Jobs;

/// <summary>
/// Runs the background jobs that are due, then exits (AD-029, decision 0009): <c>dotnet Quart.Api.dll tick</c>,
/// which the Container Apps job <c>quart-staging-tick</c> runs every 5 minutes. The web app is never woken.
/// In Development, <c>POST /internal/tick</c> runs one tick on demand. See docs/runbooks/background-jobs.md.
/// </summary>
public static class TickCommand
{
    /// <summary>The command-line argument that runs one tick and exits instead of starting the web server.</summary>
    public const string Command = "tick";

    /// <summary>
    /// Runs <see cref="Command"/>. Returns the process exit code: 0 when the tick ran, even if some jobs
    /// failed (they retry on their own), and 1 when it could not run at all, for example without a database.
    /// </summary>
    public static async Task<int> RunCommandAsync(IServiceProvider services)
    {
        try
        {
            await services.RunTickAsync();
            return 0;
        }
        catch (Exception exception)
        {
            services.GetRequiredService<ILoggerFactory>().CreateLogger(JobsModule.LogCategory)
                .LogError(exception, "Tick failed before it could finish");
            return 1;
        }
    }

    /// <summary>Development only: <c>POST /internal/tick</c> runs one tick and answers with what it did.</summary>
    public static IEndpointRouteBuilder MapDevelopmentTickEndpoint(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/internal/tick", (IServiceProvider services, CancellationToken cancellationToken) =>
                services.RunTickAsync(cancellationToken))
            .ExcludeFromDescription();
        return endpoints;
    }
}
