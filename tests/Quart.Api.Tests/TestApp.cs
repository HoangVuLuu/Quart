using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using NodaTime;
using Quart.Api.Migrations;
using Quart.Modules.Identity;
using Quart.Modules.Notifications;

namespace Quart.Api.Tests;

/// <summary>
/// The real app on a private, migrated database, with the outside world replaced: emails are captured
/// instead of sent, the clock stands still until a test moves it, and the breached-password service is a
/// local stub. Tests act through HTTP only, as the web app does.
/// </summary>
public sealed partial class TestApp : IAsyncDisposable
{
    /// <summary>The one password the stubbed breach service knows.</summary>
    public const string BreachedPassword = "password123";
    public const string Password = "correct horse battery";

    private int people;

    private TestApp(QuartApiFactory factory, FakeClock clock, CapturedEmails emails)
    {
        Factory = factory;
        Clock = clock;
        Emails = emails;
    }

    public QuartApiFactory Factory { get; }

    public FakeClock Clock { get; }

    public CapturedEmails Emails { get; }

    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    /// <param name="now">Defaults to Monday 2 November 2026, 09:00 in Montreal.</param>
    public static async Task<TestApp> StartAsync(PostgresFixture postgres, Instant? now = null, IReadOnlyDictionary<string, string?>? settings = null)
    {
        var clock = new FakeClock(now ?? Instant.FromUtc(2026, 11, 2, 14, 0));
        var emails = new CapturedEmails();
        var all = new Dictionary<string, string?>
        {
            // Tests create many accounts from one address; the limits have their own tests.
            ["Auth:RequestsPerMinute"] = "100000",
            ["Workplaces:JoinsPerMinute"] = "100000",
            ["Email:PublicUrl"] = "https://quart.test",
        };
        foreach (var (key, value) in settings ?? new Dictionary<string, string?>())
        {
            all[key] = value;
        }
        var factory = new QuartApiFactory(
            await postgres.CreateDatabaseAsync(),
            environment: "Development",
            services: services =>
            {
                services.AddSingleton<IClock>(clock);
                services.AddSingleton<IEmailTransport>(emails);
                services.ConfigureAll<HttpClientFactoryOptions>(options =>
                    options.HttpMessageHandlerBuilderActions.Add(builder => builder.PrimaryHandler = new PwnedPasswordsStub()));
            },
            settings: all);
        await factory.Services.MigrateAllModulesAsync(Cancellation);
        return new TestApp(factory, clock, emails);
    }

    public ValueTask DisposeAsync() => Factory.DisposeAsync();

    /// <summary>A browser: its own cookies, and the anti-forgery header on every request (AD-025).</summary>
    public HttpClient Browser() => Factory.CreateClient();

    /// <summary>Signs up, opens the verification email and signs in.</summary>
    public async Task<TestUser> PersonAsync(string fullName, string? email = null)
    {
        email ??= $"person{Interlocked.Increment(ref people)}@quart.test";
        var client = Browser();
        using var signUp = await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName, email, password = Password, language = "en" }, Cancellation);
        Assert.Equal(HttpStatusCode.Accepted, signUp.StatusCode);
        using var verify = await client.PostAsJsonAsync("/api/auth/verify-email", new { token = Emails.LastTokenFor(email) }, Cancellation);
        Assert.Equal(HttpStatusCode.NoContent, verify.StatusCode);
        var me = await SignInAsync(client, email);
        return new TestUser(client, Guid.Parse(me["id"]!.GetValue<string>()), email, fullName);
    }

    public static async Task<JsonNode> SignInAsync(HttpClient client, string email, string password = Password)
    {
        using var response = await client.PostAsJsonAsync("/api/auth/sign-in", new { email, password }, Cancellation);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonNode>(Cancellation))!;
    }

    /// <summary>
    /// A workplace as Presotea starts: the platform admin creates it, <paramref name="owner"/> accepts the
    /// invitation, and the two shifts a day are saved (2 people each, at least one level 3).
    /// </summary>
    public async Task<Guid> WorkplaceAsync(TestUser owner, bool withTemplate = true)
    {
        var admin = await PersonAsync("Platform Admin");
        Assert.True(await Factory.Services.GrantPlatformAdminAsync(admin.Email, Cancellation));
        var created = await admin.PostAsync("/api/workplaces", new { name = "Presotea Montmorency", address = "Laval" });
        var workplaceId = Guid.Parse(created["workplaceId"]!.GetValue<string>());
        await owner.PostAsync("/api/workplaces/owner-invitations/accept", new { token = created["invitationToken"]!.GetValue<string>() });
        if (withTemplate)
        {
            await owner.SendAsync(HttpMethod.Put, $"/api/workplaces/{workplaceId}/generator", PresoteaSetup());
        }
        return workplaceId;
    }

    public static object PresoteaSetup(int? maxConsecutiveShifts = null) => new
    {
        periodWeeks = 2,
        maxConsecutiveShifts,
        openingFairness = true,
        closingFairness = true,
        blocks = new[]
        {
            new { days = new[] { 1, 2, 3, 4, 5, 6, 7 }, start = "10:00", end = "16:00", headcount = 2, requirements = new[] { new { level = 3, minCount = 1 } } },
            new { days = new[] { 1, 2, 3, 4, 5, 6, 7 }, start = "16:00", end = "23:00", headcount = 2, requirements = new[] { new { level = 3, minCount = 1 } } },
        },
    };

    /// <summary>A new account that joins with the code, then gets its level from the owner.</summary>
    public async Task<TestUser> JoinAsync(TestUser owner, Guid workplaceId, string fullName, int level = 1, decimal desiredHours = 20)
    {
        var person = await PersonAsync(fullName);
        var code = (await owner.GetAsync($"/api/workplaces/{workplaceId}"))["joinCode"]!.GetValue<string>();
        await person.PostAsync("/api/workplaces/join", new { code });
        person.MembershipId = await MembershipIdAsync(person, workplaceId);
        await owner.SendAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/members/{person.MembershipId}", new { level, desiredWeeklyHours = desiredHours });
        return person;
    }

    public static async Task<Guid> MembershipIdAsync(TestUser person, Guid workplaceId) =>
        Guid.Parse((await person.GetAsync($"/api/workplaces/{workplaceId}"))["me"]!["membershipId"]!.GetValue<string>());

    [GeneratedRegex(@"token=([A-Za-z0-9_\-]+)")]
    internal static partial Regex TokenPattern();
}

/// <summary>One signed-in person and their browser.</summary>
public sealed class TestUser(HttpClient client, Guid userId, string email, string fullName)
{
    public HttpClient Client { get; } = client;

    public Guid UserId { get; } = userId;

    public string Email { get; } = email;

    public string FullName { get; } = fullName;

    /// <summary>Set once the person is a member of the workplace a test uses.</summary>
    public Guid MembershipId { get; set; }

    public async Task<JsonNode> GetAsync(string path)
    {
        using var response = await Client.GetAsync(path, TestContext.Current.CancellationToken);
        return await ReadAsync(response, path);
    }

    public Task<JsonNode> PostAsync(string path, object? body = null) => SendAsync(HttpMethod.Post, path, body);

    /// <summary>Sends and expects success; the answer's body, or an empty object when it has none.</summary>
    public async Task<JsonNode> SendAsync(HttpMethod method, string path, object? body = null)
    {
        using var response = await RawAsync(method, path, body);
        return await ReadAsync(response, path);
    }

    /// <summary>Sends without expecting anything, for tests about refusals.</summary>
    public async Task<HttpResponseMessage> RawAsync(HttpMethod method, string path, object? body = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null || method != HttpMethod.Get)
        {
            request.Content = JsonContent.Create(body ?? new { });
        }
        return await Client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    /// <summary>The status and the problem's machine-readable code (AD-023).</summary>
    public async Task<(HttpStatusCode Status, string? Code)> TryAsync(HttpMethod method, string path, object? body = null)
    {
        using var response = await RawAsync(method, path, body);
        return (response.StatusCode, await CodeOfAsync(response));
    }

    public static async Task<string?> CodeOfAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode || response.Content.Headers.ContentLength == 0)
        {
            return null;
        }
        var problem = await response.Content.ReadFromJsonAsync<JsonNode>(TestContext.Current.CancellationToken);
        // A validation problem names what is wrong in its first error.
        return problem?["errors"]?[0]?["code"]?.GetValue<string>() ?? problem?["code"]?.GetValue<string>();
    }

    private static async Task<JsonNode> ReadAsync(HttpResponseMessage response, string path)
    {
        var text = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.True(response.IsSuccessStatusCode, $"{path} answered {(int)response.StatusCode}: {text}");
        return text.Length == 0 ? new JsonObject() : JsonNode.Parse(text)!;
    }
}

/// <summary>Stands in for the email provider: keeps what was sent, and can be told to fail.</summary>
public sealed class CapturedEmails : IEmailTransport
{
    private readonly List<OutgoingEmail> sent = [];

    public bool Down { get; set; }

    public IReadOnlyList<OutgoingEmail> Sent
    {
        get
        {
            lock (sent)
            {
                return sent.ToList();
            }
        }
    }

    public Task SendAsync(OutgoingEmail email, CancellationToken cancellationToken)
    {
        if (Down)
        {
            throw new InvalidOperationException("The email provider is down.");
        }
        lock (sent)
        {
            sent.Add(email);
        }
        return Task.CompletedTask;
    }

    public IReadOnlyList<OutgoingEmail> To(string address) => Sent.Where(x => x.To == address).ToList();

    /// <summary>The token in the link of the last email sent to that address.</summary>
    public string LastTokenFor(string address)
    {
        var email = To(address).LastOrDefault(x => TestApp.TokenPattern().IsMatch(x.TextBody));
        Assert.True(email is not null, $"No email with a link was sent to {address}.");
        return TestApp.TokenPattern().Match(email!.TextBody).Groups[1].Value;
    }
}

/// <summary>
/// The Have I Been Pwned range API, locally: it knows <see cref="TestApp.BreachedPassword"/> and nothing
/// else, and records what it was asked so a test can check only a hash prefix ever leaves (FR-003).
/// </summary>
public sealed class PwnedPasswordsStub : HttpMessageHandler
{
    public static List<string> Requests { get; } = [];

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri!.AbsolutePath;
        lock (Requests)
        {
            Requests.Add(path);
        }
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(TestApp.BreachedPassword)));
        var body = path.EndsWith(hash[..5], StringComparison.OrdinalIgnoreCase)
            ? $"0000000000000000000000000000000000A:0\r\n{hash[5..]}:42\r\n"
            : "0000000000000000000000000000000000A:0\r\n";
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
    }
}
