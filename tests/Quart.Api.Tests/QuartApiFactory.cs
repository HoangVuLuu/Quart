using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Serilog.Core;

namespace Quart.Api.Tests;

/// <summary>The real app, hosted in memory, pointed at the database a test names.</summary>
/// <param name="services">Extra or replacement services, registered after the app's own (a fake clock, a test job handler).</param>
public sealed class QuartApiFactory(
    string connectionString,
    string? environment = null,
    string? webRoot = null,
    Action<IServiceCollection>? services = null)
    : WebApplicationFactory<Program>
{
    /// <summary>Every log line the app wrote, in its production format.</summary>
    public LogCapture Logs { get; } = new();

    /// <summary>A database that refuses connections at once (nothing listens on port 1).</summary>
    public static QuartApiFactory WithDatabaseDown(string? environment = null, string? webRoot = null) =>
        new("Host=127.0.0.1;Port=1;Database=quart;Username=quart;Password=none;Timeout=2", environment, webRoot);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Quart", connectionString);
        if (environment is not null)
        {
            builder.UseEnvironment(environment);
        }
        if (webRoot is not null)
        {
            builder.UseWebRoot(webRoot);
        }
        builder.ConfigureTestServices(testServices =>
        {
            testServices.AddSingleton<ILogEventSink>(Logs);
            services?.Invoke(testServices);
        });
    }
}
