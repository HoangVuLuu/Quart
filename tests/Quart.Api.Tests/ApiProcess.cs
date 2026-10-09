using System.Diagnostics;

namespace Quart.Api.Tests;

/// <summary>Runs the built API as its own process with one command, exactly as a Container Apps job runs it.</summary>
public static class ApiProcess
{
    public static async Task<(int ExitCode, string Output)> RunAsync(string command, string connectionString)
    {
        var start = new ProcessStartInfo("dotnet", [Path.Combine(AppContext.BaseDirectory, "Quart.Api.dll"), command])
        {
            WorkingDirectory = AppContext.BaseDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            Environment =
            {
                ["ASPNETCORE_ENVIRONMENT"] = "Staging",
                ["ConnectionStrings__Quart"] = connectionString,
            },
        };
        using var process = Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync(TestContext.Current.CancellationToken);
        var errors = process.StandardError.ReadToEndAsync(TestContext.Current.CancellationToken);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(60)); // A web server that started by mistake would never exit.
        await process.WaitForExitAsync(timeout.Token);
        return (process.ExitCode, await output + await errors);
    }
}
