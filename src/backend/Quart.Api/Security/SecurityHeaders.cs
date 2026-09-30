using Microsoft.AspNetCore.HttpOverrides;

namespace Quart.Api.Security;

/// <summary>
/// Browser protections on every response, before there is any data worth stealing (AD-046, 12.3).
/// The web app is built so the strict policy holds: no inline scripts, no inline style attributes,
/// fonts and images served from our own origin.
/// </summary>
public static class SecurityHeaders
{
    public const string ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

    // Development only: the Vite dev server injects styles and talks to the page over a websocket.
    private const string DevelopmentContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
        "connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

    public const string PermissionsPolicy = "camera=(), microphone=(), geolocation=()";

    public static WebApplicationBuilder AddQuartSecurity(this WebApplicationBuilder builder)
    {
        // Container Apps terminates HTTPS at its ingress and forwards plain HTTP. Trust its X-Forwarded-Proto
        // so the app knows the request was HTTPS (HSTS, secure cookies). The ingress's address is not
        // fixed, so the known-proxy lists are cleared; the app is not reachable except through it.
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedProto;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });
        return builder;
    }

    /// <summary>Goes first in the pipeline, so every response gets the headers, errors and static files included.</summary>
    public static WebApplication UseQuartSecurity(this WebApplication app)
    {
        app.UseForwardedHeaders();
        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
        }

        var contentSecurityPolicy = app.Environment.IsDevelopment() ? DevelopmentContentSecurityPolicy : ContentSecurityPolicy;
        app.Use(async (context, next) =>
        {
            // Set when the response starts, not now: the exception handler clears headers before writing its error.
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                headers.ContentSecurityPolicy = contentSecurityPolicy;
                headers.XContentTypeOptions = "nosniff";
                headers["Referrer-Policy"] = "no-referrer";
                headers["Permissions-Policy"] = PermissionsPolicy;
                return Task.CompletedTask;
            });
            await next(context);
        });
        return app;
    }
}
