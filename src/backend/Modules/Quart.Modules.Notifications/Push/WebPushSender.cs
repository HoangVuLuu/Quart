using System.Net;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Quart.Modules.Notifications.Push;

/// <summary>
/// Sends through Lib.Net.Http.WebPush (MIT, decision 0015): VAPID signing and aes128gcm encryption, so the push
/// service carries the message without being able to read it. The HTTP client never follows redirects: the
/// message goes to the endpoint the browser gave, or nowhere (M8-06 security).
/// </summary>
public sealed class WebPushSender(IHttpClientFactory clients, IOptions<PushOptions> options, ILogger<WebPushSender> logger) : IPushSender
{
    public const string HttpClientName = "push";

    public async Task<PushResult> SendAsync(PushTarget target, string payload, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (!settings.IsConfigured)
        {
            return PushResult.Refused;
        }

        var subscription = new Lib.Net.Http.WebPush.PushSubscription { Endpoint = target.Endpoint };
        subscription.SetKey(PushEncryptionKeyName.P256DH, target.P256dh);
        subscription.SetKey(PushEncryptionKeyName.Auth, target.Auth);
        using var vapid = new VapidAuthentication(settings.PublicKey!, settings.PrivateKey!) { Subject = settings.Subject };
        // No waiting inside the library on a 429: the job runner tries again later, with its own backoff.
        var client = new PushServiceClient(clients.CreateClient(HttpClientName)) { DefaultAuthentication = vapid, AutoRetryAfter = false };
        var message = new PushMessage(payload)
        {
            // A day: an alert about a shift is no use a week later, and a phone off for a day still gets it.
            TimeToLive = (int)TimeSpan.FromDays(1).TotalSeconds,
            Urgency = PushMessageUrgency.Normal,
        };

        try
        {
            await client.RequestPushMessageDeliveryAsync(subscription, message, cancellationToken);
            return PushResult.Delivered;
        }
        catch (PushServiceClientException error)
        {
            // The status only: the endpoint is a capability URL and stays out of the logs.
            logger.LogWarning("Push refused with HTTP {Status}", (int)error.StatusCode);
            return error.StatusCode switch
            {
                HttpStatusCode.NotFound or HttpStatusCode.Gone => PushResult.Gone,
                HttpStatusCode.BadRequest or HttpStatusCode.Forbidden or HttpStatusCode.RequestEntityTooLarge => PushResult.Refused,
                _ => PushResult.Failed,
            };
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Push could not reach the push service: {Error}", error.GetType().Name);
            return PushResult.Failed;
        }
    }
}
