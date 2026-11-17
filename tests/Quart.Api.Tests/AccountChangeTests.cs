using System.Net;
using System.Net.Http.Json;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>Changing the password and the email while signed in (M2-07, FR-008, section 1.6).</summary>
[Collection(PostgresCollection.Name)]
public sealed class AccountChangeTests(PostgresFixture postgres)
{
    private const string NewPassword = "a brand new passphrase";

    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    private static async Task<HttpStatusCode> SignInStatusAsync(TestApp app, string email, string password)
    {
        using var client = app.Browser();
        using var response = await client.PostAsJsonAsync("/api/auth/sign-in", new { email, password }, Cancellation);
        return response.StatusCode;
    }

    [Fact]
    public async Task A_new_password_needs_the_current_one_and_the_sign_up_rules()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Lima");

        Assert.Equal((HttpStatusCode.BadRequest, "auth.current_password_wrong"), await ana.TryAsync(HttpMethod.Post, "/api/me/password", new { currentPassword = "not it at all", newPassword = NewPassword }));
        Assert.Equal((HttpStatusCode.BadRequest, "auth.password_too_short"), await ana.TryAsync(HttpMethod.Post, "/api/me/password", new { currentPassword = TestApp.Password, newPassword = "short" }));
        Assert.Equal((HttpStatusCode.BadRequest, "auth.password_breached"), await ana.TryAsync(HttpMethod.Post, "/api/me/password", new { currentPassword = TestApp.Password, newPassword = TestApp.BreachedPassword }));
        Assert.Equal(HttpStatusCode.OK, await SignInStatusAsync(app, ana.Email, TestApp.Password));
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.Browser().PostAsJsonAsync("/api/me/password", new { currentPassword = TestApp.Password, newPassword = NewPassword }, Cancellation)).StatusCode);
    }

    [Fact]
    public async Task Changing_the_password_tells_the_owner_and_signs_out_every_other_device()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Lima");
        using var laptop = app.Browser();
        await TestApp.SignInAsync(laptop, ana.Email);

        await ana.SendAsync(HttpMethod.Post, "/api/me/password", new { currentPassword = TestApp.Password, newPassword = NewPassword });

        Assert.Equal(ana.Email, (await ana.GetAsync("/api/me"))["email"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Unauthorized, (await laptop.GetAsync("/api/me", Cancellation)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, await SignInStatusAsync(app, ana.Email, TestApp.Password));
        Assert.Equal(HttpStatusCode.OK, await SignInStatusAsync(app, ana.Email, NewPassword));
        Assert.Single(app.Emails.To(ana.Email), x => x.Subject == "Your Quart password was changed");
    }

    [Fact]
    public async Task Wrong_current_passwords_lock_the_account_like_sign_in()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Lima");

        var answers = new List<(HttpStatusCode, string?)>();
        for (var i = 0; i < 5; i++)
        {
            answers.Add(await ana.TryAsync(HttpMethod.Post, "/api/me/email", new { email = "new@quart.test", currentPassword = "guess " + i }));
        }

        Assert.Equal((HttpStatusCode.Forbidden, "auth.locked_out"), answers[^1]);
        Assert.Equal(HttpStatusCode.Forbidden, await SignInStatusAsync(app, ana.Email, TestApp.Password));
        Assert.Empty(app.Emails.To("new@quart.test"));
    }

    [Fact]
    public async Task A_new_email_applies_only_once_its_link_is_opened_and_the_old_address_is_told()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Lima");
        using var laptop = app.Browser();
        await TestApp.SignInAsync(laptop, ana.Email);

        Assert.Equal((HttpStatusCode.BadRequest, "auth.email_same"), await ana.TryAsync(HttpMethod.Post, "/api/me/email", new { email = ana.Email.ToUpperInvariant(), currentPassword = TestApp.Password }));
        using var asked = await ana.RawAsync(HttpMethod.Post, "/api/me/email", new { email = " Ana.New@Quart.test ", currentPassword = TestApp.Password });
        Assert.Equal(HttpStatusCode.Accepted, asked.StatusCode);
        // Nothing changes until the new mailbox answers.
        Assert.Equal(ana.Email, (await ana.GetAsync("/api/me"))["email"]!.GetValue<string>());
        var token = app.Emails.LastTokenFor("ana.new@quart.test");

        await ana.SendAsync(HttpMethod.Post, "/api/me/email/confirm", new { token });

        Assert.Equal("ana.new@quart.test", (await ana.GetAsync("/api/me"))["email"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Unauthorized, (await laptop.GetAsync("/api/me", Cancellation)).StatusCode);
        Assert.Single(app.Emails.To(ana.Email), x => x.Subject == "Your Quart email was changed");
        Assert.Equal(HttpStatusCode.OK, await SignInStatusAsync(app, "ana.new@quart.test", TestApp.Password));
        Assert.Equal(HttpStatusCode.Unauthorized, await SignInStatusAsync(app, ana.Email, TestApp.Password));
        Assert.Equal((HttpStatusCode.BadRequest, "auth.link_used"), await ana.TryAsync(HttpMethod.Post, "/api/me/email/confirm", new { token }));
    }

    [Fact]
    public async Task An_address_that_already_has_an_account_gets_the_same_answer_and_no_email()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Lima");
        var ben = await app.PersonAsync("Ben Roy");
        var before = app.Emails.To(ben.Email).Count;

        using var asked = await ana.RawAsync(HttpMethod.Post, "/api/me/email", new { email = ben.Email, currentPassword = TestApp.Password });

        Assert.Equal(HttpStatusCode.Accepted, asked.StatusCode);
        Assert.Equal(before, app.Emails.To(ben.Email).Count);
        Assert.Equal(ana.Email, (await ana.GetAsync("/api/me"))["email"]!.GetValue<string>());
    }

    [Fact]
    public async Task Asking_again_retires_the_earlier_link()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var ana = await app.PersonAsync("Ana Lima");
        await ana.SendAsync(HttpMethod.Post, "/api/me/email", new { email = "first@quart.test", currentPassword = TestApp.Password });
        var first = app.Emails.LastTokenFor("first@quart.test");
        // Within a minute, a second request sends nothing (no flooding a mailbox).
        await ana.SendAsync(HttpMethod.Post, "/api/me/email", new { email = "second@quart.test", currentPassword = TestApp.Password });
        Assert.Empty(app.Emails.To("second@quart.test"));

        app.Clock.Advance(Duration.FromMinutes(2));
        await ana.SendAsync(HttpMethod.Post, "/api/me/email", new { email = "second@quart.test", currentPassword = TestApp.Password });
        var second = app.Emails.LastTokenFor("second@quart.test");

        Assert.Equal((HttpStatusCode.BadRequest, "auth.link_used"), await ana.TryAsync(HttpMethod.Post, "/api/me/email/confirm", new { token = first }));
        await ana.SendAsync(HttpMethod.Post, "/api/me/email/confirm", new { token = second });
        Assert.Equal("second@quart.test", (await ana.GetAsync("/api/me"))["email"]!.GetValue<string>());
    }
}
