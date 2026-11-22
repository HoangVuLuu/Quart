namespace Quart.Modules.Notifications;

// What the API host and the tests see of push delivery (M8-06, decision 0015), beside NotificationsModule.

/// <summary>Settings under <c>Push</c>: the VAPID keys, generated once per environment and kept as secrets.</summary>
public sealed class PushOptions
{
    public const string Section = "Push";

    /// <summary>Base64url, uncompressed P-256 point. Given to browsers when they subscribe.</summary>
    public string? PublicKey { get; set; }

    /// <summary>Base64url, the P-256 private key. A secret: never in a file in the repository.</summary>
    public string? PrivateKey { get; set; }

    /// <summary>Who to contact about these pushes, as push services ask: a <c>mailto:</c> or https URL.</summary>
    public string Subject { get; set; } = "mailto:quart@presotea.local";

    /// <summary>Without both keys, push is simply off: the app hides the switch and nothing is sent.</summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(PublicKey) && !string.IsNullOrWhiteSpace(PrivateKey);
}

/// <summary>Hands one encrypted message to a browser's push service.</summary>
public interface IPushSender
{
    Task<PushResult> SendAsync(PushTarget target, string payload, CancellationToken cancellationToken);
}

/// <param name="Endpoint">The push service URL the browser gave, used exactly as given.</param>
/// <param name="P256dh">The browser's public key, base64url.</param>
/// <param name="Auth">The browser's shared secret, base64url.</param>
public sealed record PushTarget(string Endpoint, string P256dh, string Auth);

public enum PushResult
{
    /// <summary>The push service took it.</summary>
    Delivered,

    /// <summary>404 or 410: the browser dropped this subscription; it is deleted.</summary>
    Gone,

    /// <summary>The push service refused this message for good (400, 403, 413): retrying would not help.</summary>
    Refused,

    /// <summary>Anything else (5xx, 429, no answer): tried again later.</summary>
    Failed,
}

/// <summary>Makes a VAPID key pair: run once per environment (<c>dotnet Quart.Api.dll push-keys</c>), keep both as secrets.</summary>
public static class VapidKeys
{
    public static (string PublicKey, string PrivateKey) Create()
    {
        using var key = System.Security.Cryptography.ECDsa.Create(System.Security.Cryptography.ECCurve.NamedCurves.nistP256);
        var parameters = key.ExportParameters(includePrivateParameters: true);
        return (Base64Url([0x04, .. parameters.Q.X!, .. parameters.Q.Y!]), Base64Url(parameters.D!));
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
