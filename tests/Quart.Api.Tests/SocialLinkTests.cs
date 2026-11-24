using System.Net;
using System.Text.Json.Nodes;

namespace Quart.Api.Tests;

/// <summary>Instagram and Facebook on the team page, only for people who chose to share them (FR-040, M2-18).</summary>
[Collection(PostgresCollection.Name)]
public sealed class SocialLinkTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Links_show_on_the_team_page_only_while_their_owner_shares_them()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var jasmine = team.Staff[0];
        var coworker = team.Staff[1];

        await jasmine.SendAsync(HttpMethod.Patch, "/api/me", new { instagram = "@jasmine.k", facebook = "jasmine.kim" });
        var hidden = Row(await coworker.GetAsync($"{team.Base}/members"), jasmine);
        await jasmine.SendAsync(HttpMethod.Patch, "/api/me", new { shareSocialLinks = true });
        var shown = Row(await coworker.GetAsync($"{team.Base}/members"), jasmine);
        var toOwner = Row(await team.Owner.GetAsync($"{team.Base}/members"), jasmine);
        await jasmine.SendAsync(HttpMethod.Patch, "/api/me", new { shareSocialLinks = false });
        var hiddenAgain = Row(await coworker.GetAsync($"{team.Base}/members"), jasmine);

        Assert.Null(hidden["instagram"]);
        Assert.Null(hidden["facebook"]);
        Assert.Equal("jasmine.k", shown["instagram"]!.GetValue<string>());
        Assert.Equal("jasmine.kim", shown["facebook"]!.GetValue<string>());
        Assert.Equal("jasmine.k", toOwner["instagram"]!.GetValue<string>());
        Assert.Null(hiddenAgain["instagram"]);
        var me = await jasmine.GetAsync("/api/me");
        Assert.Equal("jasmine.k", me["instagram"]!.GetValue<string>());
        Assert.False(me["shareSocialLinks"]!.GetValue<bool>());
    }

    [Theory]
    [InlineData("instagram", "https://www.instagram.com/jasmine.k/?hl=fr", "jasmine.k")]
    [InlineData("instagram", "instagram.com/jasmine_k", "jasmine_k")]
    [InlineData("facebook", "https://m.facebook.com/jasmine.kim", "jasmine.kim")]
    [InlineData("facebook", "https://www.facebook.com/profile.php?id=100012345678", "100012345678")]
    [InlineData("facebook", "@jasmine.kim", "jasmine.kim")]
    public async Task A_pasted_link_keeps_only_the_handle(string field, string typed, string kept)
    {
        await using var app = await TestApp.StartAsync(postgres);
        var jasmine = await app.PersonAsync("Jasmine Kim");

        var me = await jasmine.SendAsync(HttpMethod.Patch, "/api/me", new Dictionary<string, string> { [field] = typed });

        Assert.Equal(kept, me[field]!.GetValue<string>());
    }

    [Theory]
    [InlineData("instagram", "javascript:alert(1)")]
    [InlineData("instagram", "https://evil.test/jasmine")]
    [InlineData("instagram", "a name with spaces")]
    [InlineData("facebook", "jasmine_kim<script>")]
    public async Task Anything_but_a_handle_is_refused(string field, string typed)
    {
        await using var app = await TestApp.StartAsync(postgres);
        var jasmine = await app.PersonAsync("Jasmine Kim");

        var refused = await jasmine.TryAsync(HttpMethod.Patch, "/api/me", new Dictionary<string, string> { [field] = typed });

        Assert.Equal((HttpStatusCode.BadRequest, $"auth.{field}_invalid"), refused);
    }

    [Fact]
    public async Task An_empty_text_removes_the_link()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var jasmine = await app.PersonAsync("Jasmine Kim");
        await jasmine.SendAsync(HttpMethod.Patch, "/api/me", new { instagram = "jasmine.k", facebook = "jasmine.kim" });

        var me = await jasmine.SendAsync(HttpMethod.Patch, "/api/me", new { instagram = "" });

        Assert.Null(me["instagram"]);
        Assert.Equal("jasmine.kim", me["facebook"]!.GetValue<string>());
    }

    [Fact]
    public async Task Another_workplace_sees_nothing()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.Staff[0].SendAsync(HttpMethod.Patch, "/api/me", new { instagram = "jasmine.k", shareSocialLinks = true });
        var stranger = await app.PersonAsync("Marc Dubé");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.TryAsync(HttpMethod.Get, $"{team.Base}/members")).Status);
    }

    private static JsonNode Row(JsonNode members, TestUser person) =>
        members.AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == person.MembershipId.ToString())!;
}
