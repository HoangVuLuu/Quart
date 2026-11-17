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

    public const long MaxRequestBodyBytes = 256 * 1024;

    public static WebApplicationBuilder AddQuartSecurity(this WebApplicationBuilder builder)
    {
        // Container Apps terminates HTTPS at its ingress and forwards plain HTTP. Trust its X-Forwarded-Proto
        // so the app knows the request was HTTPS (HSTS, secure cookies). The ingress's address is not
        // fixed, so the known-proxy lists are cleared; the app is not reachable except through it.
        // X-Forwarded-For matters as much: without it every visitor has the ingress's address, so the
        // per-address limits on sign-in and join codes (FR-007) would put the whole shop in one bucket, and
        // one person guessing passwords would lock everyone out. Only the last address is taken (the
        // default limit of 1): that is the one the ingress itself appended, which a client cannot forge.
        // A year, subdomains included: a browser that has seen the site once never tries plain HTTP again.
        builder.Services.AddHsts(options =>
        {
            options.MaxAge = TimeSpan.FromDays(365);
            options.IncludeSubDomains = true;
        });
        // No request to this API is large: the biggest is a generator setup of a few kilobytes. A small
        // limit means nobody can tie the server up by posting megabytes. File uploads (M8-02) will raise it
        // on their own routes only.
        builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = MaxRequestBodyBytes);
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor;
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

        // Refused before a byte of the body is read. Kestrel enforces the same limit on bodies sent without a length.
        app.Use(async (context, next) =>
        {
            if (context.Request.ContentLength > MaxRequestBodyBytes)
            {
                context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
                return;
            }
            await next(context);
        });
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
                // Older browsers that do not read frame-ancestors, and no other site keeps a handle on our window.
                headers.XFrameOptions = "DENY";
                headers["Cross-Origin-Opener-Policy"] = "same-origin";
                // API answers hold names, emails and schedules: never kept by a browser or a proxy, so the
                // Back button after signing out on a shared phone shows nothing.
                if (context.Request.Path.StartsWithSegments("/api"))
                {
                    headers.CacheControl = "no-store";
                }
                return Task.CompletedTask;
            });
            await next(context);
        });
        return app;
    }
}
