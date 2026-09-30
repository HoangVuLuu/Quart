using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Quart.Api.Tests;

/// <summary>
/// What reaches the logs (spec 11.5, 12.2): one summary line per request, never personal data, and the
/// same trace ID the person sees in the error message. No Docker needed: the database is down on purpose.
/// </summary>
public sealed class LoggingTests
{
    private const string Email = "philippe.tremblay@example.com";

    [Fact]
    public async Task A_failed_sign_in_never_writes_the_email_address_to_the_log()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown();
        using var client = factory.CreateClient();

        // Shaped like the sign-in that M2 adds: the address in the body, the query string and the path.
        using var response = await client.PostAsJsonAsync(
            $"/api/identity/sign-in?email={Uri.EscapeDataString(Email)}&returnUrl=%2Fschedule",
            new { email = Email, password = "correct horse battery staple" },
            TestContext.Current.CancellationToken);
        using var byPath = await client.GetAsync($"/api/identity/users/{Email}", TestContext.Current.CancellationToken);

        Assert.False(response.IsSuccessStatusCode);
        await factory.Logs.WaitForAsync(line => line.Contains("responded", StringComparison.Ordinal), count: 2);
        Assert.DoesNotContain("philippe", factory.Logs.All, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("example.com", factory.Logs.All, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("horse", factory.Logs.All, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Production_writes_one_summary_line_per_request_with_the_route_template()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Production");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/does-not-exist?token=secret", TestContext.Current.CancellationToken);

        var line = Assert.Single(await factory.Logs.WaitForAsync(l => l.Contains("responded", StringComparison.Ordinal)));
        var summary = JsonDocument.Parse(line).RootElement;
        Assert.Equal("GET", summary.GetProperty("RequestMethod").GetString());
        Assert.Equal("/api/{**path}", summary.GetProperty("RouteTemplate").GetString());
        Assert.Equal(404, summary.GetProperty("StatusCode").GetInt32());
        Assert.True(summary.TryGetProperty("Elapsed", out _));
        Assert.False(summary.TryGetProperty("RequestPath", out _));
        Assert.DoesNotContain("secret", factory.Logs.All, StringComparison.Ordinal);
        Assert.DoesNotContain("does-not-exist", factory.Logs.All, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_problem_carries_the_trace_id_of_its_log_line()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Production");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/does-not-exist", TestContext.Current.CancellationToken);

        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        var traceId = problem.GetProperty("traceId").GetString();
        Assert.Matches("^[0-9a-f]{32}$", traceId);
        var line = Assert.Single(await factory.Logs.WaitForAsync(l => l.Contains("responded", StringComparison.Ordinal)));
        Assert.Equal(traceId, JsonDocument.Parse(line).RootElement.GetProperty("@tr").GetString());
    }

    [Fact]
    public async Task A_forced_exception_is_a_500_problem_whose_trace_id_finds_exactly_one_log_entry()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Staging");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/diagnostics/exception", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.DoesNotContain("Forced exception", body, StringComparison.Ordinal);
        var problem = JsonDocument.Parse(body).RootElement;
        Assert.Equal("common.unexpected", problem.GetProperty("code").GetString());
        var traceId = problem.GetProperty("traceId").GetString()!;

        var entry = Assert.Single(await factory.Logs.WaitForAsync(l => l.Contains(traceId, StringComparison.Ordinal)));
        var logged = JsonDocument.Parse(entry).RootElement;
        Assert.Equal("Error", logged.GetProperty("@l").GetString());
        Assert.Equal("/api/diagnostics/exception", logged.GetProperty("RouteTemplate").GetString());
        Assert.Contains("Forced exception", logged.GetProperty("@x").GetString(), StringComparison.Ordinal);
        await Task.Delay(200, TestContext.Current.CancellationToken);
        Assert.Single(factory.Logs.Lines, l => l.Contains(traceId, StringComparison.Ordinal));
    }

    [Fact]
    public async Task The_forced_exception_does_not_exist_in_production()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Production");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/diagnostics/exception", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
