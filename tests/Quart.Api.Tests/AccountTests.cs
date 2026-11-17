using System.Net;
using System.Net.Http.Json;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>Accounts (M2-02 to M2-05, M2-07): sign up, verify, sign in and out, reset, and the rules that keep them safe.</summary>
[Collection(PostgresCollection.Name)]
public sealed class AccountTests(PostgresFixture postgres)
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("Marc-Olivier Côté", "Marc-Olivier C.")]
    [InlineData("Siobhán O'Connor", "Siobhán O.")]
    [InlineData("Philippe", "Philippe")]
    public async Task Sign_up_verify_and_sign_in_accepts_real_names_and_derives_the_short_name(string fullName, string displayName)
    {
        await using var app = await TestApp.StartAsync(postgres);

        var person = await app.PersonAsync(fullName);
        var me = await person.GetAsync("/api/me");

        Assert.Equal(fullName, me["fullName"]!.GetValue<string>());
        Assert.Equal(displayName, me["displayName"]!.GetValue<string>());
        Assert.False(me["isPlatformAdmin"]!.GetValue<bool>());
    }

    [Fact]
    public async Task An_account_cannot_be_used_before_its_email_is_verified()
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var client = app.Browser();
        await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ana Lima", email = "ana@quart.test", password = TestApp.Password }, Cancellation);

        using var signIn = await client.PostAsJsonAsync("/api/auth/sign-in", new { email = "ana@quart.test", password = TestApp.Password }, Cancellation);
        using var me = await client.GetAsync("/api/me", Cancellation);

        Assert.Equal(HttpStatusCode.Forbidden, signIn.StatusCode);
        Assert.Equal("auth.email_not_verified", await TestUser.CodeOfAsync(signIn));
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task Signing_up_with_a_known_address_answers_the_same_and_emails_the_owner_instead()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var first = await app.PersonAsync("Ana Lima", "ana@quart.test");
        using var client = app.Browser();

        using var again = await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Someone Else", email = "ANA@quart.test", password = "another password" }, Cancellation);

        // No enumeration: the same answer as a new address, and the real owner's password still works.
        Assert.Equal(HttpStatusCode.Accepted, again.StatusCode);
        Assert.Equal(2, app.Emails.To("ana@quart.test").Count);
        Assert.DoesNotContain("token=", app.Emails.To("ana@quart.test")[^1].TextBody);
        Assert.Equal("Ana Lima", (await first.GetAsync("/api/me"))["fullName"]!.GetValue<string>());
    }

    [Fact]
    public async Task Whoever_opens_their_own_link_gets_their_own_password_not_the_one_a_stranger_set_first()
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var stranger = app.Browser();
        using var ana = app.Browser();
        const string strangersPassword = "the stranger chose this";
        const string anasPassword = "ana chose this herself";

        // A stranger signs up with Ana's address and never sees the email. Later Ana signs up herself.
        await stranger.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Not Ana", email = "ana@quart.test", password = strangersPassword }, Cancellation);
        app.Clock.Advance(Duration.FromMinutes(5));
        await ana.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ana Lima", email = "ana@quart.test", password = anasPassword }, Cancellation);
        var firstToken = TestApp.TokenPattern().Match(app.Emails.To("ana@quart.test")[0].TextBody).Groups[1].Value;
        using var verify = await ana.PostAsJsonAsync("/api/auth/verify-email", new { token = app.Emails.LastTokenFor("ana@quart.test") }, Cancellation);
        using var asStranger = await stranger.PostAsJsonAsync("/api/auth/sign-in", new { email = "ana@quart.test", password = strangersPassword }, Cancellation);
        var me = await TestApp.SignInAsync(ana, "ana@quart.test", anasPassword);
        // The stranger's link died when hers was used.
        using var late = await stranger.PostAsJsonAsync("/api/auth/verify-email", new { token = firstToken }, Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, verify.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, asStranger.StatusCode);
        Assert.Equal("Ana Lima", me["fullName"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.BadRequest, late.StatusCode);
    }

    [Fact]
    public async Task Asking_for_links_again_and_again_sends_one_email_a_minute_and_one_reset_ends_the_others()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Lima", "ana@quart.test");
        var before = app.Emails.To(ana.Email).Count;
        using var client = app.Browser();

        for (var i = 0; i < 5; i++)
        {
            await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = ana.Email }, Cancellation);
        }
        Assert.Equal(before + 1, app.Emails.To(ana.Email).Count);
        var first = app.Emails.LastTokenFor(ana.Email);

        app.Clock.Advance(Duration.FromMinutes(2));
        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = ana.Email }, Cancellation);
        Assert.Equal(before + 2, app.Emails.To(ana.Email).Count);
        using var reset = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = app.Emails.LastTokenFor(ana.Email), password = "a brand new password" }, Cancellation);
        using var replay = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = first, password = "yet another password" }, Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
    }

    [Fact]
    public async Task The_database_holds_no_working_session_key_and_no_working_link_once_an_email_is_sent()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Lima", "ana@quart.test");
        using var client = app.Browser();
        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = ana.Email }, Cancellation);
        var token = app.Emails.LastTokenFor(ana.Email);

        await using var connection = await Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.GetRequiredService<Npgsql.NpgsqlDataSource>(app.Factory.Services).OpenConnectionAsync(Cancellation);
        async Task<List<string>> ColumnAsync(string sql)
        {
            await using var command = new Npgsql.NpgsqlCommand(sql, connection);
            await using var reader = await command.ExecuteReaderAsync(Cancellation);
            var values = new List<string>();
            while (await reader.ReadAsync(Cancellation))
            {
                values.Add(reader.GetString(0));
            }
            return values;
        }

        var sessions = await ColumnAsync("SELECT id FROM identity.session");
        var sent = await ColumnAsync("SELECT parameters::text FROM notifications.outbox_message WHERE sent_at IS NOT NULL");

        Assert.NotEmpty(sessions);
        // A key from a cookie is 43 characters of base64url; what is stored is a SHA-256 in hex.
        Assert.All(sessions, id => Assert.Matches("^[0-9A-F]{64}$", id));
        Assert.NotEmpty(sent);
        Assert.All(sent, parameters => Assert.DoesNotContain(token, parameters, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Answers_carry_the_browser_protections_and_big_bodies_are_refused()
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var client = app.Browser();

        using var meta = await client.GetAsync("/api/meta", Cancellation);
        using var body = new StringContent($$"""{"email":"a@quart.test","password":"{{new string('x', 300_000)}}"}""", System.Text.Encoding.UTF8, "application/json");
        using var big = await client.PostAsync("/api/auth/sign-in", body, Cancellation);

        Assert.Equal("no-store", meta.Headers.CacheControl?.ToString());
        Assert.Equal("DENY", meta.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("same-origin", meta.Headers.GetValues("Cross-Origin-Opener-Policy").Single());
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, big.StatusCode);
    }

    [Theory]
    [InlineData("", "ana@quart.test", TestApp.Password, "auth.name_invalid")]
    [InlineData("Ana <b>", "ana@quart.test", TestApp.Password, "auth.name_invalid")]
    [InlineData("Ana Lima", "not-an-email", TestApp.Password, "auth.email_invalid")]
    [InlineData("Ana Lima", "ana@quart.test", "short", "auth.password_too_short")]
    [InlineData("Ana Lima", "ana@quart.test", TestApp.BreachedPassword, "auth.password_breached")]
    public async Task Sign_up_refuses_bad_input_with_a_code_per_field(string fullName, string email, string password, string code)
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var client = app.Browser();

        using var response = await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName, email, password }, Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(code, await TestUser.CodeOfAsync(response));
        Assert.Empty(app.Emails.Sent);
    }

    [Fact]
    public async Task The_breach_check_sends_only_the_first_five_characters_of_the_hash()
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var client = app.Browser();

        await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ana Lima", email = "ana@quart.test", password = "a rather unusual passphrase" }, Cancellation);

        string[] asked;
        lock (PwnedPasswordsStub.Requests)
        {
            asked = [.. PwnedPasswordsStub.Requests];
        }
        Assert.NotEmpty(asked);
        Assert.All(asked, path => Assert.Matches("^/range/[0-9A-F]{5}$", path));
    }

    [Fact]
    public async Task An_unsafe_request_without_the_antiforgery_header_is_refused()
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var foreign = app.Factory.CreateForeignClient();

        using var response = await foreign.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ana Lima", email = "ana@quart.test", password = TestApp.Password }, Cancellation);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("auth.antiforgery", await TestUser.CodeOfAsync(response));
        Assert.Empty(app.Emails.Sent);
    }

    [Fact]
    public async Task A_verification_link_works_once_and_expires_after_24_hours()
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var client = app.Browser();
        await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ana Lima", email = "ana@quart.test", password = TestApp.Password }, Cancellation);
        await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ben Roy", email = "ben@quart.test", password = TestApp.Password }, Cancellation);
        var ana = app.Emails.LastTokenFor("ana@quart.test");
        var ben = app.Emails.LastTokenFor("ben@quart.test");

        using var first = await client.PostAsJsonAsync("/api/auth/verify-email", new { token = ana }, Cancellation);
        using var reused = await client.PostAsJsonAsync("/api/auth/verify-email", new { token = ana }, Cancellation);
        app.Clock.Advance(Duration.FromHours(24) + Duration.FromMinutes(1));
        using var expired = await client.PostAsJsonAsync("/api/auth/verify-email", new { token = ben }, Cancellation);
        using var unknown = await client.PostAsJsonAsync("/api/auth/verify-email", new { token = "nonsense" }, Cancellation);

        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Equal("auth.link_used", await TestUser.CodeOfAsync(reused));
        Assert.Equal("auth.link_expired", await TestUser.CodeOfAsync(expired));
        Assert.Equal("auth.link_invalid", await TestUser.CodeOfAsync(unknown));
    }

    [Fact]
    public async Task Five_wrong_passwords_lock_the_account_even_for_the_right_one()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var person = await app.PersonAsync("Ana Lima", "ana@quart.test");
        using var client = app.Browser();

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            using var wrong = await client.PostAsJsonAsync("/api/auth/sign-in", new { email = person.Email, password = "wrong password" }, Cancellation);
            Assert.Equal("auth.invalid_credentials", await TestUser.CodeOfAsync(wrong));
        }
        using var fifth = await client.PostAsJsonAsync("/api/auth/sign-in", new { email = person.Email, password = "wrong password" }, Cancellation);
        using var right = await client.PostAsJsonAsync("/api/auth/sign-in", new { email = person.Email, password = TestApp.Password }, Cancellation);

        Assert.Equal("auth.locked_out", await TestUser.CodeOfAsync(fifth));
        Assert.Equal("auth.locked_out", await TestUser.CodeOfAsync(right));
    }

    [Fact]
    public async Task Sign_in_is_rate_limited_per_address()
    {
        await using var app = await TestApp.StartAsync(postgres, settings: new Dictionary<string, string?> { ["Auth:RequestsPerMinute"] = "3" });
        using var client = app.Browser();

        var statuses = new List<HttpStatusCode>();
        for (var attempt = 0; attempt < 4; attempt++)
        {
            using var response = await client.PostAsJsonAsync("/api/auth/sign-in", new { email = "nobody@quart.test", password = "whatever it is" }, Cancellation);
            statuses.Add(response.StatusCode);
        }

        Assert.Equal([HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests], statuses);
    }

    [Fact]
    public async Task Behind_the_ingress_each_visitor_has_their_own_rate_limit()
    {
        await using var app = await TestApp.StartAsync(postgres, settings: new Dictionary<string, string?> { ["Auth:RequestsPerMinute"] = "2" });
        using var client = app.Browser();
        async Task<HttpStatusCode> SignInFromAsync(string address)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/sign-in") { Content = JsonContent.Create(new { email = "nobody@quart.test", password = "whatever it is" }) };
            // What Container Apps adds: the visitor's address, after anything the visitor sent themselves.
            request.Headers.Add("X-Forwarded-For", $"203.0.113.250, {address}");
            using var response = await client.SendAsync(request, Cancellation);
            return response.StatusCode;
        }

        var first = new[] { await SignInFromAsync("198.51.100.1"), await SignInFromAsync("198.51.100.1"), await SignInFromAsync("198.51.100.1") };
        var other = await SignInFromAsync("198.51.100.2");

        // One person out of attempts does not lock the rest of the shop out (FR-007).
        Assert.Equal([HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests], first);
        Assert.Equal(HttpStatusCode.Unauthorized, other);
    }

    [Fact]
    public async Task Signing_out_everywhere_ends_the_other_browser_on_its_next_request()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var phone = await app.PersonAsync("Ana Lima", "ana@quart.test");
        using var laptop = app.Browser();
        await TestApp.SignInAsync(laptop, phone.Email);

        await phone.PostAsync("/api/auth/sign-out-everywhere");
        using var onLaptop = await laptop.GetAsync("/api/me", Cancellation);
        using var onPhone = await phone.Client.GetAsync("/api/me", Cancellation);

        Assert.Equal(HttpStatusCode.Unauthorized, onLaptop.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, onPhone.StatusCode);
    }

    [Fact]
    public async Task Signing_out_ends_only_this_browser()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var phone = await app.PersonAsync("Ana Lima", "ana@quart.test");
        using var laptop = app.Browser();
        await TestApp.SignInAsync(laptop, phone.Email);

        await phone.PostAsync("/api/auth/sign-out");
        using var onLaptop = await laptop.GetAsync("/api/me", Cancellation);
        using var onPhone = await phone.Client.GetAsync("/api/me", Cancellation);

        Assert.Equal(HttpStatusCode.OK, onLaptop.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, onPhone.StatusCode);
    }

    [Fact]
    public async Task A_password_reset_works_once_ends_every_session_and_answers_the_same_for_unknown_addresses()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var person = await app.PersonAsync("Ana Lima", "ana@quart.test");
        using var client = app.Browser();

        using var known = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = person.Email }, Cancellation);
        using var unknown = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "nobody@quart.test" }, Cancellation);
        var token = app.Emails.LastTokenFor(person.Email);
        using var reset = await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "a brand new passphrase" }, Cancellation);
        using var reused = await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "yet another passphrase" }, Cancellation);
        using var oldSession = await person.Client.GetAsync("/api/me", Cancellation);
        using var oldPassword = await client.PostAsJsonAsync("/api/auth/sign-in", new { email = person.Email, password = TestApp.Password }, Cancellation);

        Assert.Equal(HttpStatusCode.Accepted, known.StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, unknown.StatusCode);
        Assert.Empty(app.Emails.To("nobody@quart.test"));
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal("auth.link_used", await TestUser.CodeOfAsync(reused));
        Assert.Equal(HttpStatusCode.Unauthorized, oldSession.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, oldPassword.StatusCode);
        await TestApp.SignInAsync(client, person.Email, "a brand new passphrase");
    }

    [Fact]
    public async Task A_reset_link_expires_after_45_minutes()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var person = await app.PersonAsync("Ana Lima", "ana@quart.test");
        using var client = app.Browser();
        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = person.Email }, Cancellation);

        app.Clock.Advance(Duration.FromMinutes(46));
        using var reset = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = app.Emails.LastTokenFor(person.Email), password = "a brand new passphrase" }, Cancellation);

        Assert.Equal("auth.link_expired", await TestUser.CodeOfAsync(reset));
    }

    [Fact]
    public async Task An_email_outage_still_creates_the_account_and_the_tick_delivers_the_email_later()
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var client = app.Browser();
        app.Emails.Down = true;

        using var signUp = await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ana Lima", email = "ana@quart.test", password = TestApp.Password }, Cancellation);
        Assert.Equal(HttpStatusCode.Accepted, signUp.StatusCode);
        Assert.Empty(app.Emails.Sent);

        app.Emails.Down = false;
        app.Clock.Advance(Duration.FromMinutes(2));
        using var tick = await client.PostAsync("/internal/tick", null, Cancellation);

        Assert.Equal(HttpStatusCode.OK, tick.StatusCode);
        Assert.Single(app.Emails.To("ana@quart.test"));
    }

    [Fact]
    public async Task The_email_is_written_in_the_language_chosen_at_sign_up()
    {
        await using var app = await TestApp.StartAsync(postgres);
        using var client = app.Browser();

        await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ana Lima", email = "fr@quart.test", password = TestApp.Password, language = "fr" }, Cancellation);
        await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ben Roy", email = "en@quart.test", password = TestApp.Password, language = "en" }, Cancellation);

        Assert.Contains("https://quart.test/verify-email?token=", app.Emails.To("fr@quart.test")[0].TextBody);
        Assert.NotEqual(app.Emails.To("fr@quart.test")[0].Subject, app.Emails.To("en@quart.test")[0].Subject);
    }

    [Fact]
    public async Task The_profile_updates_the_short_name_and_the_language()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var person = await app.PersonAsync("Jasmine Kaur");

        var updated = await person.SendAsync(HttpMethod.Patch, "/api/me", new { displayName = "Jas", language = "fr" });
        var (status, code) = await person.TryAsync(HttpMethod.Patch, "/api/me", new { language = "de" });

        Assert.Equal("Jas", updated["displayName"]!.GetValue<string>());
        Assert.Equal("fr", (await person.GetAsync("/api/me"))["language"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("auth.language_invalid", code);
    }

    [Fact]
    public async Task Sessions_survive_a_restart_because_the_keys_are_in_the_database()
    {
        var connectionString = await postgres.CreateDatabaseAsync();
        string cookie;
        await using (var first = new QuartApiFactory(connectionString, environment: "Development",
            services: services => Microsoft.Extensions.DependencyInjection.ServiceCollectionServiceExtensions.AddSingleton<Quart.Modules.Notifications.IEmailTransport>(services, new CapturedEmails())))
        {
            await Quart.Api.Migrations.DatabaseMigrations.MigrateAllModulesAsync(first.Services, Cancellation);
            var emails = (CapturedEmails)Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.GetRequiredService<Quart.Modules.Notifications.IEmailTransport>(first.Services);
            using var client = first.CreateClient();
            await client.PostAsJsonAsync("/api/auth/sign-up", new { fullName = "Ana Lima", email = "ana@quart.test", password = "a rather unusual passphrase" }, Cancellation);
            await client.PostAsJsonAsync("/api/auth/verify-email", new { token = emails.LastTokenFor("ana@quart.test") }, Cancellation);
            using var signIn = await client.PostAsJsonAsync("/api/auth/sign-in", new { email = "ana@quart.test", password = "a rather unusual passphrase" }, Cancellation);
            cookie = signIn.Headers.GetValues("Set-Cookie").Single(x => x.StartsWith("quart_session=", StringComparison.Ordinal)).Split(';')[0];
        }

        // A second process on the same database: a cold start after scaling to zero (AD-045).
        await using var second = new QuartApiFactory(connectionString, environment: "Development");
        using var restarted = second.CreateForeignClient();
        restarted.DefaultRequestHeaders.Add("Cookie", cookie);
        using var me = await restarted.GetAsync("/api/me", Cancellation);

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }
}
