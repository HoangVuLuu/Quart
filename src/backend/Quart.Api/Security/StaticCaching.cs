using Microsoft.AspNetCore.StaticFiles;

namespace Quart.Api.Security;

/// <summary>
/// How long a browser may keep the web app's own files (M8-05, decision 0014). The built scripts, styles and
/// fonts under /assets carry a hash in their name, so they never change and are kept for a year. Everything
/// else, the service worker and index.html first, is checked with the server on every load: a new version
/// must reach the phone the next time the app opens, never a week later.
/// </summary>
public static class StaticCaching
{
    public const string Forever = "public, max-age=31536000, immutable";

    public const string AlwaysCheck = "no-cache";

    public static string For(PathString path) => path.StartsWithSegments("/assets") ? Forever : AlwaysCheck;

    public static StaticFileOptions Options { get; } = new()
    {
        OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = For(context.Context.Request.Path),
    };
}
