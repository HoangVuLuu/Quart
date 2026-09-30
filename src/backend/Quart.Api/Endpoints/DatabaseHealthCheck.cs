using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace Quart.Api.Endpoints;

/// <summary>Opens a real connection and runs a trivial query. Slower than a ping, but it proves credentials and network too.</summary>
public sealed class DatabaseHealthCheck(NpgsqlDataSource dataSource) : IHealthCheck
{
    public const string Name = "database";

    // Npgsql's own connect timeout is 15 seconds; a page that waits that long to say "unavailable" is broken.
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(3);

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(Timeout);
        try
        {
            await using var command = dataSource.CreateCommand("SELECT 1");
            await command.ExecuteScalarAsync(timeout.Token);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            // The exception stays in the server log; responses only ever say "unavailable".
            return HealthCheckResult.Unhealthy("The database did not answer.", exception);
        }
    }
}
