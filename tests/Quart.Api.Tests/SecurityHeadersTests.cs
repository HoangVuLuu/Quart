using System.Net;

namespace Quart.Api.Tests;

/// <summary>Every response carries the browser protections (AD-046, 12.3), errors included. No Docker needed.</summary>
public sealed class SecurityHeadersTests : IDisposable
{
    private const string StrictPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

    // Stands in for the React build the Dockerfile copies into wwwroot.
    private readonly string webRoot = Directory.CreateTempSubdirectory("quart-wwwroot-").FullName;

    public SecurityHeadersTests() =>
        File.WriteAllText(Path.Combine(webRoot, "index.html"), "<!doctype html><title>Quart</title><div id=\"root\"></div>");

    public void Dispose() => Directory.Delete(webRoot, recursive: true);

    [Theory]
    [InlineData("/api/meta", HttpStatusCode.OK)]
    [InlineData("/", HttpStatusCode.OK)]
    [InlineData("/schedule/next-week", HttpStatusCode.OK)]
    [InlineData("/api/does-not-exist", HttpStatusCode.NotFound)]
    [InlineData("/api/diagnostics/exception", HttpStatusCode.InternalServerError)]
    public async Task Every_response_carries_the_security_headers(string path, HttpStatusCode expected)
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Staging", webRoot: webRoot);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(StrictPolicy, Header(response, "Content-Security-Policy"));
        Assert.Equal("nosniff", Header(response, "X-Content-Type-Options"));
        Assert.Equal("no-referrer", Header(response, "Referrer-Policy"));
        Assert.Equal("camera=(), microphone=(), geolocation=()", Header(response, "Permissions-Policy"));
    }

    [Fact]
    public async Task The_web_app_is_served_from_index_html()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Staging", webRoot: webRoot);
        using var client = factory.CreateClient();

        var html = await client.GetStringAsync("/", TestContext.Current.CancellationToken);

        Assert.Contains("<div id=\"root\">", html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Https_behind_the_ingress_gets_hsts_outside_development()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Staging", webRoot: webRoot);
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("http://quart.example") });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/meta");
        // Container Apps ends HTTPS at its ingress and says so in this header.
        request.Headers.Add("X-Forwarded-Proto", "https");

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.StartsWith("max-age=", Header(response, "Strict-Transport-Security"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Development_relaxes_styles_for_the_vite_dev_server()
    {
        await using var factory = QuartApiFactory.WithDatabaseDown(environment: "Development");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/meta", TestContext.Current.CancellationToken);

        Assert.Contains("style-src 'self' 'unsafe-inline'", Header(response, "Content-Security-Policy"), StringComparison.Ordinal);
    }

    private static string Header(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues(name, out var values) ? string.Join(", ", values)
        : response.Content.Headers.TryGetValues(name, out var contentValues) ? string.Join(", ", contentValues)
        : throw new Xunit.Sdk.XunitException($"Missing header {name}.");
}
