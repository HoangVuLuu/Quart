using System.Net;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>Step-up: the password again before a sensitive action (AD-044, M2-06).</summary>
[Collection(PostgresCollection.Name)]
public sealed class StepUpTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Signing_in_counts_as_confirming_for_ten_minutes()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var regenerate = $"/api/workplaces/{workplaceId}/join-code/regenerate";

        app.Clock.Advance(Duration.FromMinutes(9));
        var nine = await owner.TryAsync(HttpMethod.Post, regenerate);
        app.Clock.Advance(Duration.FromMinutes(2));
        var eleven = await owner.TryAsync(HttpMethod.Post, regenerate);

        Assert.Equal(HttpStatusCode.OK, nine.Status);
        Assert.Equal((HttpStatusCode.Forbidden, "auth.step_up_required"), eleven);
    }

    [Fact]
    public async Task Confirming_the_password_opens_the_action_again_for_ten_minutes()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var regenerate = $"/api/workplaces/{workplaceId}/join-code/regenerate";
        app.Clock.Advance(Duration.FromHours(2));

        var wrong = await owner.TryAsync(HttpMethod.Post, "/api/auth/confirm-password", new { password = "not my password" });
        await owner.ConfirmPasswordAsync();
        var right = await owner.TryAsync(HttpMethod.Post, regenerate);
        app.Clock.Advance(Duration.FromMinutes(11));
        var later = await owner.TryAsync(HttpMethod.Post, regenerate);

        Assert.Equal((HttpStatusCode.BadRequest, "auth.current_password_wrong"), wrong);
        Assert.Equal(HttpStatusCode.OK, right.Status);
        Assert.Equal((HttpStatusCode.Forbidden, "auth.step_up_required"), later);
    }

    [Fact]
    public async Task The_confirmation_belongs_to_one_browser_not_to_the_person()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var laptop = new TestUser(app.Browser(), owner.UserId, owner.Email, owner.FullName);
        await TestApp.SignInAsync(laptop.Client, owner.Email);
        app.Clock.Advance(Duration.FromHours(2));

        await owner.ConfirmPasswordAsync();

        Assert.Equal((HttpStatusCode.Forbidden, "auth.step_up_required"), await laptop.TryAsync(HttpMethod.Post, $"/api/workplaces/{workplaceId}/join-code/regenerate"));
    }

    [Fact]
    public async Task Deleting_an_account_asks_for_the_password_when_the_last_one_is_old()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var sophie = await app.PersonAsync("Sophie Tran");
        app.Clock.Advance(Duration.FromHours(2));

        var refused = await sophie.TryAsync(HttpMethod.Post, "/api/me/delete", new { email = sophie.Email });
        await sophie.ConfirmPasswordAsync();
        await sophie.PostAsync("/api/me/delete", new { email = sophie.Email });

        Assert.Equal((HttpStatusCode.Forbidden, "auth.step_up_required"), refused);
        Assert.Equal(HttpStatusCode.Unauthorized, (await sophie.TryAsync(HttpMethod.Get, "/api/me")).Status);
    }

    [Fact]
    public async Task A_stranger_learns_nothing_and_cannot_confirm()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var other = await app.PersonAsync("Marc Dubé");
        var nobody = new TestUser(app.Browser(), Guid.Empty, "nobody@quart.test", "Nobody");

        Assert.Equal(HttpStatusCode.NotFound, (await other.TryAsync(HttpMethod.Post, $"/api/workplaces/{workplaceId}/join-code/regenerate")).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await nobody.TryAsync(HttpMethod.Post, "/api/auth/confirm-password", new { password = TestApp.Password })).Status);
    }
}
