using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Notifications;

namespace Quart.Api.Tests;

/// <summary>
/// Workplaces and who may do what in them (M2-09 to M2-12, M2-14, M2-15), including the permission suite
/// AD-027 asks for: every workplace route is guarded, and the guard answers 401, 404 or 403 as it should.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class WorkplaceTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Only_the_platform_admin_creates_a_workplace_and_never_becomes_a_member()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var admin = await app.PersonAsync("Platform Admin");

        var (refused, _) = await owner.TryAsync(HttpMethod.Post, "/api/workplaces", new { name = "Mine" });
        await Quart.Modules.Identity.IdentityModule.GrantPlatformAdminAsync(app.Factory.Services, admin.Email, TestContext.Current.CancellationToken);
        var created = await admin.PostAsync("/api/workplaces", new { name = "Presotea Montmorency", address = "Laval" });
        var workplaceId = created["workplaceId"]!.GetValue<string>();
        var token = created["invitationToken"]!.GetValue<string>();
        await owner.PostAsync("/api/workplaces/owner-invitations/accept", new { token });
        var (twice, twiceCode) = await admin.TryAsync(HttpMethod.Post, "/api/workplaces/owner-invitations/accept", new { token });
        var (asAdmin, _) = await admin.TryAsync(HttpMethod.Get, $"/api/workplaces/{workplaceId}");
        var view = await owner.GetAsync($"/api/workplaces/{workplaceId}");

        Assert.Equal(HttpStatusCode.Forbidden, refused);
        Assert.Equal(HttpStatusCode.BadRequest, twice);
        Assert.Equal("workplace.invitation_invalid", twiceCode);
        // FR-042: the platform admin has no membership, so the workplace does not exist for them.
        Assert.Equal(HttpStatusCode.NotFound, asAdmin);
        Assert.Equal("owner", view["me"]!["role"]!.GetValue<string>());
        Assert.Equal("America/Toronto", view["timeZone"]!.GetValue<string>());
        Assert.Empty((await admin.GetAsync("/api/workplaces")).AsArray());
    }

    [Fact]
    public async Task An_owner_invitation_expires_after_seven_days()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var admin = await app.PersonAsync("Platform Admin");
        await Quart.Modules.Identity.IdentityModule.GrantPlatformAdminAsync(app.Factory.Services, admin.Email, TestContext.Current.CancellationToken);
        var created = await admin.PostAsync("/api/workplaces", new { name = "Presotea" });

        app.Clock.Advance(NodaTime.Duration.FromDays(7) + NodaTime.Duration.FromMinutes(1));
        var (status, code) = await owner.TryAsync(HttpMethod.Post, "/api/workplaces/owner-invitations/accept", new { token = created["invitationToken"]!.GetValue<string>() });

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("workplace.invitation_invalid", code);
    }

    [Fact]
    public async Task Staff_join_with_the_code_in_any_case_and_the_owner_is_told()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var code = (await owner.GetAsync($"/api/workplaces/{workplaceId}"))["joinCode"]!.GetValue<string>();
        var sophie = await app.PersonAsync("Sophie Tran");

        var (wrong, wrongCode) = await sophie.TryAsync(HttpMethod.Post, "/api/workplaces/join", new { code = "NOTACODE22" });
        await sophie.PostAsync("/api/workplaces/join", new { code = code.ToLowerInvariant() });
        var (again, againCode) = await sophie.TryAsync(HttpMethod.Post, "/api/workplaces/join", new { code });
        var view = await sophie.GetAsync($"/api/workplaces/{workplaceId}");
        var inbox = await owner.GetAsync($"/api/workplaces/{workplaceId}/notifications");

        Assert.Matches("^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$", code);
        Assert.Equal((HttpStatusCode.BadRequest, "workplace.join_code_unknown"), (wrong, wrongCode));
        Assert.Equal((HttpStatusCode.Conflict, "workplace.already_member"), (again, againCode));
        Assert.Equal("employee", view["me"]!["role"]!.GetValue<string>());
        // Only the people who manage the workplace see the code that lets anyone in.
        Assert.Null(view["joinCode"]);
        Assert.Equal(1, inbox["unread"]!.GetValue<int>());
        Assert.Equal(NotificationTypes.MemberJoined, inbox["items"]![0]!["type"]!.GetValue<string>());
        Assert.Equal("Sophie T.", inbox["items"]![0]!["parameters"]!["name"]!.GetValue<string>());
    }

    [Fact]
    public async Task Regenerating_the_join_code_stops_the_old_one_at_once()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var old = (await owner.GetAsync($"/api/workplaces/{workplaceId}"))["joinCode"]!.GetValue<string>();
        var sophie = await app.PersonAsync("Sophie Tran");

        var fresh = (await owner.PostAsync($"/api/workplaces/{workplaceId}/join-code/regenerate"))["joinCode"]!.GetValue<string>();
        var (status, code) = await sophie.TryAsync(HttpMethod.Post, "/api/workplaces/join", new { code = old });
        await sophie.PostAsync("/api/workplaces/join", new { code = fresh });

        Assert.NotEqual(old, fresh);
        Assert.Equal((HttpStatusCode.BadRequest, "workplace.join_code_unknown"), (status, code));
    }

    [Fact]
    public async Task Guessing_join_codes_is_rate_limited()
    {
        await using var app = await TestApp.StartAsync(postgres, settings: new Dictionary<string, string?> { ["Workplaces:JoinsPerMinute"] = "2" });
        var sophie = await app.PersonAsync("Sophie Tran");

        var first = await sophie.TryAsync(HttpMethod.Post, "/api/workplaces/join", new { code = "AAAAAAAAAA" });
        var second = await sophie.TryAsync(HttpMethod.Post, "/api/workplaces/join", new { code = "BBBBBBBBBB" });
        var third = await sophie.TryAsync(HttpMethod.Post, "/api/workplaces/join", new { code = "CCCCCCCCCC" });

        Assert.Equal(HttpStatusCode.BadRequest, first.Status);
        Assert.Equal(HttpStatusCode.BadRequest, second.Status);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.Status);
    }

    [Fact]
    public async Task Levels_and_hours_are_set_by_admins_only_and_coworkers_see_nothing_more_than_name_role_level_and_email()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var sophie = await app.JoinAsync(owner, workplaceId, "Sophie Tran", level: 2, desiredHours: 13);
        var kevin = await app.JoinAsync(owner, workplaceId, "Kevin Tremblay");

        // 5.4: an employee can never change a level, including their own.
        var (own, _) = await sophie.TryAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/members/{sophie.MembershipId}", new { level = 3 });
        var (invalid, invalidCode) = await owner.TryAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/members/{sophie.MembershipId}", new { level = 4 });
        var asKevin = (await kevin.GetAsync($"/api/workplaces/{workplaceId}/members")).AsArray();
        var asOwner = (await owner.GetAsync($"/api/workplaces/{workplaceId}/members")).AsArray();
        var sophieForKevin = asKevin.Single(x => x!["displayName"]!.GetValue<string>() == "Sophie T.")!;
        var sophieForOwner = asOwner.Single(x => x!["displayName"]!.GetValue<string>() == "Sophie T.")!;
        var kevinForKevin = asKevin.Single(x => x!["isMe"]!.GetValue<bool>())!;

        Assert.Equal(HttpStatusCode.Forbidden, own);
        Assert.Equal((HttpStatusCode.BadRequest, "workplace.level_invalid"), (invalid, invalidCode));
        Assert.Equal(2, sophieForKevin["level"]!.GetValue<int>());
        Assert.Equal(sophie.Email, sophieForKevin["email"]!.GetValue<string>());
        Assert.Null(sophieForKevin["desiredWeeklyHours"]);
        Assert.Null(sophieForKevin["worksShifts"]);
        Assert.Equal(13m, sophieForOwner["desiredWeeklyHours"]!.GetValue<decimal>());
        Assert.Equal(20m, kevinForKevin["desiredWeeklyHours"]!.GetValue<decimal>());
    }

    [Fact]
    public async Task Staff_set_their_own_wanted_hours_but_never_above_the_maximum_or_for_someone_else()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var sophie = await app.JoinAsync(owner, workplaceId, "Sophie Tran", desiredHours: 13);
        var kevin = await app.JoinAsync(owner, workplaceId, "Kevin Tremblay");
        await owner.SendAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/members/{sophie.MembershipId}", new { maxWeeklyHours = 24 });

        // FR-037: the wish is the person's own; the maximum and everyone else's hours are not.
        var (saved, _) = await sophie.TryAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/me", new { desiredWeeklyHours = 18 });
        var (aboveMax, aboveMaxCode) = await sophie.TryAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/me", new { desiredWeeklyHours = 30 });
        var (negative, _) = await sophie.TryAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/me", new { desiredWeeklyHours = -1 });
        var (someoneElse, _) = await sophie.TryAsync(HttpMethod.Patch, $"/api/workplaces/{workplaceId}/members/{kevin.MembershipId}", new { desiredWeeklyHours = 5 });
        var members = (await owner.GetAsync($"/api/workplaces/{workplaceId}/members")).AsArray();
        decimal HoursOf(string name) => members.Single(x => x!["displayName"]!.GetValue<string>() == name)!["desiredWeeklyHours"]!.GetValue<decimal>();

        Assert.Equal(HttpStatusCode.NoContent, saved);
        Assert.Equal((HttpStatusCode.BadRequest, "workplace.hours_invalid"), (aboveMax, aboveMaxCode));
        Assert.Equal(HttpStatusCode.BadRequest, negative);
        Assert.Equal(HttpStatusCode.Forbidden, someoneElse);
        Assert.Equal(18m, HoursOf("Sophie T."));
        Assert.Equal(20m, HoursOf("Kevin T."));
    }

    [Fact]
    public async Task A_removed_member_loses_access_on_the_next_request_and_the_owner_cannot_leave()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var sophie = await app.JoinAsync(owner, workplaceId, "Sophie Tran");
        var kevin = await app.JoinAsync(owner, workplaceId, "Kevin Tremblay");

        var (byEmployee, _) = await kevin.TryAsync(HttpMethod.Delete, $"/api/workplaces/{workplaceId}/members/{sophie.MembershipId}");
        await owner.SendAsync(HttpMethod.Delete, $"/api/workplaces/{workplaceId}/members/{sophie.MembershipId}");
        var (after, _) = await sophie.TryAsync(HttpMethod.Get, $"/api/workplaces/{workplaceId}/members");
        await kevin.PostAsync($"/api/workplaces/{workplaceId}/leave");
        var (ownerLeaves, ownerCode) = await owner.TryAsync(HttpMethod.Post, $"/api/workplaces/{workplaceId}/leave");

        Assert.Equal(HttpStatusCode.Forbidden, byEmployee);
        Assert.Equal(HttpStatusCode.NotFound, after);
        Assert.Empty((await sophie.GetAsync("/api/workplaces")).AsArray());
        Assert.Empty((await kevin.GetAsync("/api/workplaces")).AsArray());
        Assert.Equal((HttpStatusCode.Conflict, "workplace.owner_cannot_leave"), (ownerLeaves, ownerCode));
        Assert.Single((await owner.GetAsync($"/api/workplaces/{workplaceId}/members")).AsArray());
    }

    [Fact]
    public async Task A_member_only_sees_their_own_notifications_and_can_mark_them_read()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);
        var sophie = await app.JoinAsync(owner, workplaceId, "Sophie Tran");

        var forSophie = await sophie.GetAsync($"/api/workplaces/{workplaceId}/notifications");
        await owner.PostAsync($"/api/workplaces/{workplaceId}/notifications/read-all");
        var forOwner = await owner.GetAsync($"/api/workplaces/{workplaceId}/notifications");

        Assert.Empty(forSophie["items"]!.AsArray());
        Assert.Equal(0, forOwner["unread"]!.GetValue<int>());
        Assert.All(forOwner["items"]!.AsArray(), item => Assert.True(item!["read"]!.GetValue<bool>()));
    }

    [Fact]
    public void No_notification_type_may_carry_sensitive_content()
    {
        // FR-216: notifications show on lock screens. No comment, note, message body, amount or file, ever.
        string[] forbidden = ["comment", "note", "body", "text", "message", "amount", "file", "email"];

        Assert.All(NotificationTypes.AllowedParameters, type =>
            Assert.DoesNotContain(type.Value, name => forbidden.Any(word => name.Contains(word, StringComparison.OrdinalIgnoreCase))));
    }

    [Fact]
    public async Task Every_workplace_route_is_guarded_and_refuses_strangers_and_employees()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner);
        var employee = await app.JoinAsync(owner, workplaceId, "Sophie Tran");
        var removed = await app.JoinAsync(owner, workplaceId, "Kevin Tremblay");
        await owner.SendAsync(HttpMethod.Delete, $"/api/workplaces/{workplaceId}/members/{removed.MembershipId}");
        var stranger = await app.PersonAsync("Member Of Nothing");
        using var signedOut = app.Browser();

        var routes = app.Factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(x => x.RoutePattern.RawText!.StartsWith("/api/workplaces/{workplaceId", StringComparison.Ordinal))
            .ToList();
        Assert.True(routes.Count >= 30, $"Only {routes.Count} workplace routes were found.");

        foreach (var route in routes)
        {
            var method = new HttpMethod(route.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods[0]);
            var path = System.Text.RegularExpressions.Regex.Replace(route.RoutePattern.RawText!, @"\{(\w+)(:\w+)?\}", match =>
                match.Groups[1].Value == "workplaceId" ? workplaceId.ToString() : Guid.NewGuid().ToString());
            var guard = route.Metadata.GetMetadata<WorkplaceGuardMetadata>();

            // M2-10: a new endpoint without RequirePermission or AllowAnyMember fails here.
            Assert.True(guard is not null, $"{method} {route.RoutePattern.RawText} has no workplace guard.");

            using var anonymous = await signedOut.SendAsync(new HttpRequestMessage(method, path) { Content = System.Net.Http.Json.JsonContent.Create(new { }) }, TestContext.Current.CancellationToken);
            Assert.True(anonymous.StatusCode == HttpStatusCode.Unauthorized, $"{method} {path} answered {anonymous.StatusCode} to nobody.");
            foreach (var outsider in new[] { stranger, removed })
            {
                // Never confirm that a workplace exists to someone who is not in it.
                var (status, _) = await outsider.TryAsync(method, path, new { });
                Assert.True(status == HttpStatusCode.NotFound, $"{method} {path} answered {status} to a non-member.");
            }
            if (guard!.Permission is not null)
            {
                var (status, _) = await employee.TryAsync(method, path, new { });
                Assert.True(status == HttpStatusCode.Forbidden, $"{method} {path} needs {guard.Permission} but answered {status} to an employee.");
            }
        }
    }

    [Fact]
    public async Task One_person_can_belong_to_two_workplaces_with_different_roles()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var philippe = await app.PersonAsync("Philippe Roy");
        var other = await app.PersonAsync("Other Owner");
        var presotea = await app.WorkplaceAsync(philippe, withTemplate: false);
        var second = await app.WorkplaceAsync(other, withTemplate: false);
        var code = (await other.GetAsync($"/api/workplaces/{second}"))["joinCode"]!.GetValue<string>();

        await philippe.PostAsync("/api/workplaces/join", new { code });
        var mine = (await philippe.GetAsync("/api/workplaces")).AsArray();

        // AD-001: roles belong to memberships, not accounts.
        Assert.Equal(["employee", "owner"], mine.Select(x => x!["role"]!.GetValue<string>()).Order());
        Assert.Contains(mine, x => x!["workplaceId"]!.GetValue<string>() == presotea.ToString());
    }
}
