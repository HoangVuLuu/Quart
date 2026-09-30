using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Quart.Api.Tests;

/// <summary>The real app, hosted in memory, pointed at the database a test names.</summary>
public sealed class QuartApiFactory(string connectionString) : WebApplicationFactory<Program>
{
    /// <summary>A database that refuses connections at once (nothing listens on port 1).</summary>
    public static QuartApiFactory WithDatabaseDown() =>
        new("Host=127.0.0.1;Port=1;Database=quart;Username=quart;Password=none;Timeout=2");

    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.UseSetting("ConnectionStrings:Quart", connectionString);
}
