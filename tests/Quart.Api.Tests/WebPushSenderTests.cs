using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Quart.Modules.Notifications;
using Quart.Modules.Notifications.Push;

namespace Quart.Api.Tests;

/// <summary>The real sender against a stand-in push service (M8-06, decision 0015): what goes out, and what each answer means.</summary>
public sealed class WebPushSenderTests
{
    private const string Endpoint = "https://fcm.example/send/abc123";
    private const string Payload = """{"type":"schedule.published","parameters":{"periodStart":"2026-11-09"}}""";

    [Fact]
    public async Task Sends_an_encrypted_signed_message_to_the_endpoint_as_given()
    {
        var service = new PushService(HttpStatusCode.Created);

        Assert.Equal(PushResult.Delivered, await SendAsync(service));

        var request = Assert.Single(service.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal(Endpoint, request.Uri);
        Assert.StartsWith("vapid t=", request.Authorization, StringComparison.Ordinal);
        Assert.Contains("k=" + CapturedPushes.Vapid.PublicKey, request.Authorization, StringComparison.Ordinal);
        Assert.Equal("86400", request.Ttl);
        Assert.Equal("aes128gcm", request.ContentEncoding);
        // Encrypted end to end: the push service cannot read the alert.
        Assert.DoesNotContain("schedule.published", System.Text.Encoding.UTF8.GetString(request.Body), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, PushResult.Gone)]
    [InlineData(HttpStatusCode.Gone, PushResult.Gone)]
    [InlineData(HttpStatusCode.BadRequest, PushResult.Refused)]
    [InlineData(HttpStatusCode.RequestEntityTooLarge, PushResult.Refused)]
    [InlineData(HttpStatusCode.TooManyRequests, PushResult.Failed)]
    [InlineData(HttpStatusCode.ServiceUnavailable, PushResult.Failed)]
    [InlineData(HttpStatusCode.MovedPermanently, PushResult.Failed)]
    public async Task Reads_the_push_service_s_answer(HttpStatusCode status, PushResult expected)
    {
        var service = new PushService(status);

        Assert.Equal(expected, await SendAsync(service));
        // Never sent anywhere else, even when told to go elsewhere.
        Assert.All(service.Requests, request => Assert.Equal(Endpoint, request.Uri));
    }

    private static Task<PushResult> SendAsync(PushService service)
    {
        var options = Options.Create(new PushOptions { PublicKey = CapturedPushes.Vapid.PublicKey, PrivateKey = CapturedPushes.Vapid.PrivateKey });
        var sender = new WebPushSender(service, options, NullLogger<WebPushSender>.Instance);
        var (p256dh, auth) = CapturedPushes.BrowserKeys();
        return sender.SendAsync(new PushTarget(Endpoint, p256dh, auth), Payload, TestContext.Current.CancellationToken);
    }

    private sealed record Seen(HttpMethod Method, string Uri, string? Authorization, string? Ttl, string? ContentEncoding, byte[] Body);

    private sealed class PushService(HttpStatusCode status) : HttpMessageHandler, IHttpClientFactory
    {
        public List<Seen> Requests { get; } = [];

        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(new Seen(
                request.Method,
                request.RequestUri!.ToString(),
                request.Headers.Authorization?.ToString(),
                request.Headers.TryGetValues("TTL", out var ttl) ? ttl.Single() : null,
                request.Content?.Headers.ContentEncoding.SingleOrDefault(),
                request.Content is null ? [] : await request.Content.ReadAsByteArrayAsync(cancellationToken)));
            var response = new HttpResponseMessage(status);
            if (status == HttpStatusCode.MovedPermanently)
            {
                response.Headers.Location = new Uri("https://evil.example/collect");
            }
            return response;
        }
    }
}
