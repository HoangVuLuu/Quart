using System.Net;
using System.Text.Json.Nodes;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>
/// Give away, claim and trade (M7): shifts change hands on the published schedule, with approvals when
/// the workplace wants them, and everything re-checked at the moment it is applied.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class MarketplaceTests(PostgresFixture postgres)
{
    private static readonly HttpMethod Post = HttpMethod.Post;

    private static async Task<(Team Team, JsonNode Schedule)> PublishedAsync(TestApp app, bool claimsNeedApproval = false, bool tradesNeedApproval = false)
    {
        var team = await Team.CreateAsync(app);
        await team.Owner.SendAsync(HttpMethod.Patch, $"{team.Base}/settings", new { claimsNeedApproval, tradesNeedApproval });
        return (team, await team.PublishAsync());
    }

    /// <summary>A shift <paramref name="holder"/> works and <paramref name="other"/> does not.</summary>
    private static JsonNode ShiftOf(JsonNode schedule, TestUser holder, params TestUser[] others) =>
        Team.ShiftsOf(schedule, holder).First(shift => others.All(other => !Team.Holds(shift, other)));

    private static async Task<JsonNode> ShiftAsync(Team team, string shiftId) =>
        (await team.ScheduleAsync())["shifts"]!.AsArray().Single(x => Team.Id(x!) == shiftId)!;

    [Fact]
    public async Task Requests_the_schedule_has_moved_past_leave_the_board()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var (nora, omar, paul) = (team.Staff[2], team.Staff[3], team.Staff[4]);
        var offered = Team.Id(ShiftOf(schedule, nora, omar, paul));
        var hers = Team.Id(Team.ShiftsOf(schedule, nora).First(x => Team.Id(x) != offered && !Team.Holds(x, omar)));
        var his = Team.Id(ShiftOf(schedule, omar, nora));
        await team.Owner.SendAsync(HttpMethod.Patch, $"{team.Base}/settings", new { claimsNeedApproval = true });
        await nora.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = offered });
        var offer = (await omar.GetAsync($"{team.Base}/marketplace"))["offers"]!.AsArray().Single()!;
        await omar.PostAsync($"{team.Base}/marketplace/claims", new { shiftId = offered, giveAwayId = Team.Id(offer) });
        await nora.PostAsync($"{team.Base}/marketplace/trades", new { myShiftId = hers, theirShiftId = his, theirMembershipId = omar.MembershipId });
        Assert.Single((await team.Owner.GetAsync($"{team.Base}/marketplace"))["claims"]!.AsArray());
        Assert.Single((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());

        // The manager takes Nora off both shifts and updates the schedule: her offer and her trade are moot.
        await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Period}/draft/assignments/{offered}/{nora.MembershipId}");
        await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Period}/draft/assignments/{hers}/{nora.MembershipId}");
        await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });

        var board = await team.Owner.GetAsync($"{team.Base}/marketplace");
        Assert.Empty(board["offers"]!.AsArray());
        Assert.Empty(board["claims"]!.AsArray());
        Assert.Empty((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
        // The place she left is now simply open.
        Assert.Contains((await paul.GetAsync($"{team.Base}/marketplace"))["openShifts"]!.AsArray(), x => Team.Id(x!["shift"]!) == offered);
    }

    [Fact]
    public async Task Giving_a_shift_away_keeps_its_holder_until_someone_claims_it()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var (nora, omar, paul) = (team.Staff[2], team.Staff[3], team.Staff[4]);
        var shift = Team.Id(ShiftOf(schedule, nora, omar, paul));

        Assert.Equal("marketplace.not_your_shift", (await omar.TryAsync(Post, $"{team.Base}/marketplace/give-aways", new { shiftId = shift })).Code);
        await nora.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = shift });
        Assert.Equal("marketplace.already_offered", (await nora.TryAsync(Post, $"{team.Base}/marketplace/give-aways", new { shiftId = shift })).Code);

        // FR-181: offering does not remove her.
        Assert.True(Team.Holds(await ShiftAsync(team, shift), nora));
        var offer = (await omar.GetAsync($"{team.Base}/marketplace"))["offers"]!.AsArray().Single()!;
        Assert.Equal("Nora S.", offer["fromName"]!.GetValue<string>());
        Assert.False(offer["mine"]!.GetValue<bool>());
        Assert.True((await nora.GetAsync($"{team.Base}/marketplace"))["offers"]![0]!["mine"]!.GetValue<bool>());
        // 2.5 (2026-11-18): a give-away belongs to the Trade tab, which counts it until opened; not to Alerts.
        Assert.DoesNotContain("shift.offered", await team.NotificationTypesAsync(omar));
        Assert.Equal(1, (await omar.GetAsync($"{team.Base}/marketplace"))["unseen"]!.GetValue<int>());
        Assert.Equal("marketplace.own_shift", (await nora.TryAsync(Post, $"{team.Base}/marketplace/claims", new { shiftId = shift, giveAwayId = Team.Id(offer) })).Code);

        // With approval off the first claim wins at once (FR-187); the second person is told it is gone.
        var claimed = await omar.PostAsync($"{team.Base}/marketplace/claims", new { shiftId = shift, giveAwayId = Team.Id(offer) });
        var late = await paul.TryAsync(Post, $"{team.Base}/marketplace/claims", new { shiftId = shift, giveAwayId = Team.Id(offer) });

        Assert.True(claimed["applied"]!.GetValue<bool>());
        Assert.Equal((HttpStatusCode.Conflict, "marketplace.shift_taken"), late);
        var after = await ShiftAsync(team, shift);
        Assert.True(Team.Holds(after, omar));
        Assert.False(Team.Holds(after, nora));
        Assert.Empty((await paul.GetAsync($"{team.Base}/marketplace"))["offers"]!.AsArray());
        Assert.Contains("shift.claimed", await team.NotificationTypesAsync(nora));
        Assert.Contains("shift.claimed", await team.NotificationTypesAsync(team.Owner));
        // The admin's draft follows, so a later Update cannot undo the claim (FR-162).
        var draft = await team.Owner.GetAsync($"{team.Period}/draft");
        Assert.False(draft["hasUnpublishedChanges"]!.GetValue<bool>());
        Assert.True(Team.Holds(draft["shifts"]!.AsArray().Single(x => Team.Id(x!) == shift)!, omar));
    }

    [Fact]
    public async Task An_offer_can_be_cancelled_until_it_is_taken()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var (nora, omar) = (team.Staff[2], team.Staff[3]);
        var shift = Team.Id(ShiftOf(schedule, nora, omar));
        await nora.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = shift });
        var offer = Team.Id((await nora.GetAsync($"{team.Base}/marketplace"))["offers"]![0]!);

        Assert.Equal(HttpStatusCode.NotFound, (await omar.TryAsync(HttpMethod.Delete, $"{team.Base}/marketplace/give-aways/{offer}")).Status);
        await nora.SendAsync(HttpMethod.Delete, $"{team.Base}/marketplace/give-aways/{offer}");

        Assert.Empty((await omar.GetAsync($"{team.Base}/marketplace"))["offers"]!.AsArray());
        Assert.Equal("marketplace.shift_taken", (await omar.TryAsync(Post, $"{team.Base}/marketplace/claims", new { shiftId = shift, giveAwayId = offer })).Code);
    }

    [Fact]
    public async Task Two_people_claiming_the_last_open_slot_at_the_same_instant_one_wins()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var (nora, omar, paul) = (team.Staff[2], team.Staff[3], team.Staff[4]);
        // Open one slot: Nora leaves a shift neither Omar nor Paul works, through an update.
        var shift = Team.Id(ShiftOf(schedule, nora, omar, paul));
        await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Period}/draft/assignments/{shift}/{nora.MembershipId}");
        await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });
        Assert.Equal(1, (await omar.GetAsync($"{team.Base}/marketplace"))["openShifts"]!.AsArray().Single()!["openSlots"]!.GetValue<int>());

        var results = await Task.WhenAll(
            omar.TryAsync(Post, $"{team.Base}/marketplace/claims", new { shiftId = shift }),
            paul.TryAsync(Post, $"{team.Base}/marketplace/claims", new { shiftId = shift }));

        // AD-013: exactly one succeeds, and the shift is never overfilled.
        Assert.Single(results, x => x.Status == HttpStatusCode.OK);
        Assert.Single(results, x => x == (HttpStatusCode.Conflict, "marketplace.shift_taken") || x == (HttpStatusCode.Conflict, "marketplace.nothing_to_claim"));
        Assert.Equal(2, (await ShiftAsync(team, shift))["people"]!.AsArray().Count);
    }

    [Fact]
    public async Task A_shift_you_already_work_cannot_be_claimed_again()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var nora = team.Staff[2];
        var together = Team.ShiftsOf(schedule, nora).First(shift => shift["people"]!.AsArray().Count == 2);
        var partner = team.Everyone.Single(x => x != nora && Team.Holds(together, x));
        await partner.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = Team.Id(together) });
        var offer = (await nora.GetAsync($"{team.Base}/marketplace"))["offers"]![0]!;

        var result = await nora.TryAsync(Post, $"{team.Base}/marketplace/claims", new { shiftId = Team.Id(together), giveAwayId = Team.Id(offer) });

        // FR-185: the one hard block.
        Assert.True(offer["onShift"]!.GetValue<bool>());
        Assert.Equal((HttpStatusCode.Conflict, "marketplace.overlap"), result);
    }

    [Fact]
    public async Task With_approval_on_the_admin_picks_one_requester_and_the_others_are_declined()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app, claimsNeedApproval: true);
        var (nora, omar, paul, rita) = (team.Staff[2], team.Staff[3], team.Staff[4], team.Staff[5]);
        var shift = Team.Id(ShiftOf(schedule, nora, omar, paul, rita));
        await nora.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = shift });
        var offer = Team.Id((await omar.GetAsync($"{team.Base}/marketplace"))["offers"]![0]!);

        foreach (var person in new[] { omar, paul, rita })
        {
            var asked = await person.PostAsync($"{team.Base}/marketplace/claims", new { shiftId = shift, giveAwayId = offer });
            Assert.False(asked["applied"]!.GetValue<bool>());
        }
        Assert.Equal("marketplace.already_requested", (await omar.TryAsync(Post, $"{team.Base}/marketplace/claims", new { shiftId = shift, giveAwayId = offer })).Code);
        Assert.True(Team.Holds(await ShiftAsync(team, shift), nora));
        Assert.True((await omar.GetAsync($"{team.Base}/marketplace"))["offers"]![0]!["requested"]!.GetValue<bool>());
        // Requests are the approver's to see, not the staff's.
        Assert.Empty((await omar.GetAsync($"{team.Base}/marketplace"))["claims"]!.AsArray());
        var claims = (await team.Owner.GetAsync($"{team.Base}/marketplace"))["claims"]!.AsArray();
        Assert.Equal(3, claims.Count);
        var pauls = Team.Id(claims.Single(x => x!["name"]!.GetValue<string>() == "Paul C.")!);

        Assert.Equal(HttpStatusCode.Forbidden, (await omar.TryAsync(Post, $"{team.Base}/marketplace/claims/{pauls}/approve")).Status);
        await team.Owner.PostAsync($"{team.Base}/marketplace/claims/{pauls}/approve");

        // FR-187: approving one declines the others for that shift.
        Assert.True(Team.Holds(await ShiftAsync(team, shift), paul));
        Assert.Empty((await team.Owner.GetAsync($"{team.Base}/marketplace"))["claims"]!.AsArray());
        Assert.Contains("claim.approved", await team.NotificationTypesAsync(paul));
        Assert.Contains("claim.declined", await team.NotificationTypesAsync(omar));
        Assert.Contains("claim.declined", await team.NotificationTypesAsync(rita));
        Assert.Equal("marketplace.no_longer_pending", (await team.Owner.TryAsync(Post, $"{team.Base}/marketplace/claims/{pauls}/approve")).Code);
    }

    [Fact]
    public async Task A_trade_is_one_for_one_and_only_the_coworker_asked_can_accept_it()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var (nora, omar, paul) = (team.Staff[2], team.Staff[3], team.Staff[4]);
        var hers = Team.Id(ShiftOf(schedule, nora, omar));
        var his = Team.Id(ShiftOf(schedule, omar, nora));
        var trade = new { myShiftId = hers, theirShiftId = his, theirMembershipId = omar.MembershipId };

        Assert.Equal("marketplace.not_your_shift", (await paul.TryAsync(Post, $"{team.Base}/marketplace/trades", trade)).Code);
        Assert.Equal("marketplace.trade_invalid", (await nora.TryAsync(Post, $"{team.Base}/marketplace/trades", new { myShiftId = hers, theirShiftId = his, theirMembershipId = paul.MembershipId })).Code);
        await nora.PostAsync($"{team.Base}/marketplace/trades", trade);
        Assert.Equal("marketplace.already_requested", (await nora.TryAsync(Post, $"{team.Base}/marketplace/trades", trade)).Code);

        var forOmar = (await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray().Single()!;
        Assert.Equal("coworker", forOmar["role"]!.GetValue<string>());
        Assert.Equal("requester", (await nora.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!["role"]!.GetValue<string>());
        // Nobody else learns the trade exists.
        Assert.Empty((await paul.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
        Assert.Equal(HttpStatusCode.NotFound, (await paul.TryAsync(Post, $"{team.Base}/marketplace/trades/{Team.Id(forOmar)}/accept")).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await nora.TryAsync(Post, $"{team.Base}/marketplace/trades/{Team.Id(forOmar)}/accept")).Status);
        Assert.DoesNotContain("trade.requested", await team.NotificationTypesAsync(omar));
        Assert.False((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!["seen"]!.GetValue<bool>());

        await omar.PostAsync($"{team.Base}/marketplace/trades/{Team.Id(forOmar)}/accept");

        Assert.True(Team.Holds(await ShiftAsync(team, hers), omar));
        Assert.False(Team.Holds(await ShiftAsync(team, hers), nora));
        Assert.True(Team.Holds(await ShiftAsync(team, his), nora));
        Assert.Contains("trade.applied", await team.NotificationTypesAsync(nora));
        Assert.Empty((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
    }

    [Fact]
    public async Task The_requester_can_cancel_and_the_coworker_can_decline()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var (nora, omar) = (team.Staff[2], team.Staff[3]);
        var trade = new { myShiftId = Team.Id(ShiftOf(schedule, nora, omar)), theirShiftId = Team.Id(ShiftOf(schedule, omar, nora)), theirMembershipId = omar.MembershipId };

        await nora.PostAsync($"{team.Base}/marketplace/trades", trade);
        var first = Team.Id((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!);
        Assert.Equal("marketplace.no_longer_pending", (await omar.TryAsync(Post, $"{team.Base}/marketplace/trades/{first}/cancel")).Code);
        await nora.PostAsync($"{team.Base}/marketplace/trades/{first}/cancel");
        Assert.Equal("marketplace.no_longer_pending", (await omar.TryAsync(Post, $"{team.Base}/marketplace/trades/{first}/accept")).Code);

        await nora.PostAsync($"{team.Base}/marketplace/trades", trade);
        var second = Team.Id((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!);
        await omar.PostAsync($"{team.Base}/marketplace/trades/{second}/decline");

        Assert.Empty((await nora.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
        Assert.Contains("trade.declined", await team.NotificationTypesAsync(nora));
        Assert.True(Team.Holds(await ShiftAsync(team, trade.myShiftId), nora));
    }

    [Fact]
    public async Task With_approval_on_a_trade_waits_for_the_admin_and_is_checked_again_when_approved()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app, tradesNeedApproval: true);
        var (lea, nora, omar) = (team.Staff[0], team.Staff[2], team.Staff[3]);

        // 1. Two level 2s swap: nothing to object to.
        var hers = Team.Id(ShiftOf(schedule, nora, omar));
        var his = Team.Id(ShiftOf(schedule, omar, nora));
        await nora.PostAsync($"{team.Base}/marketplace/trades", new { myShiftId = hers, theirShiftId = his, theirMembershipId = omar.MembershipId });
        var fine = Team.Id((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!);
        Assert.Empty((await team.Owner.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
        await omar.PostAsync($"{team.Base}/marketplace/trades/{fine}/accept");
        Assert.False(Team.Holds(await ShiftAsync(team, hers), omar));
        var waiting = (await team.Owner.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray().Single()!;
        Assert.Equal(("awaiting_approval", "approver"), (waiting["status"]!.GetValue<string>(), waiting["role"]!.GetValue<string>()));
        Assert.Contains("trade.awaiting_approval", await team.NotificationTypesAsync(team.Owner));
        Assert.Equal(HttpStatusCode.Forbidden, (await omar.TryAsync(Post, $"{team.Base}/marketplace/trades/{fine}/approve")).Status);
        await team.Owner.PostAsync($"{team.Base}/marketplace/trades/{fine}/approve");
        Assert.True(Team.Holds(await ShiftAsync(team, hers), omar));

        // 2. A level 3 swaps with a level 1 on a shift where she is the only level 3. The approver sees the
        // warning and may approve anyway (3.3, 2026-11-18); the two people never see levels (3.1).
        schedule = await team.ScheduleAsync();
        var level3 = new[] { team.Owner, team.Staff[0], team.Staff[1] };
        var leas = Team.ShiftsOf(schedule, lea).FirstOrDefault(shift => level3.Count(x => Team.Holds(shift, x)) == 1);
        var juniors = new[] { team.Staff[4], team.Staff[5] };
        var junior = leas is null ? null : juniors.FirstOrDefault(x => !Team.Holds(leas, x) && Team.ShiftsOf(schedule, x).Any(shift => !Team.Holds(shift, lea)));
        Assert.True(leas is not null && junior is not null, "The generated schedule has no shift where Lea is the only level 3.");
        var theirs = Team.Id(Team.ShiftsOf(schedule, junior!).First(shift => !Team.Holds(shift, lea)));
        await lea.PostAsync($"{team.Base}/marketplace/trades", new { myShiftId = Team.Id(leas!), theirShiftId = theirs, theirMembershipId = junior!.MembershipId });
        var risky = Team.Id((await junior.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!);
        await junior.PostAsync($"{team.Base}/marketplace/trades/{risky}/accept");
        Assert.True((await team.Owner.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!["wouldMissLevel"]!.GetValue<bool>());
        Assert.False((await lea.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!["wouldMissLevel"]!.GetValue<bool>());

        await team.Owner.PostAsync($"{team.Base}/marketplace/trades/{risky}/approve");

        Assert.True(Team.Holds(await ShiftAsync(team, Team.Id(leas!)), junior));
        Assert.True(Team.Holds(await ShiftAsync(team, theirs), lea));
        Assert.Contains("trade.applied", await team.NotificationTypesAsync(lea));
    }

    [Fact]
    public async Task A_trade_that_went_stale_is_rejected_instead_of_applied()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var (nora, omar, paul) = (team.Staff[2], team.Staff[3], team.Staff[4]);
        var hers = Team.Id(ShiftOf(schedule, nora, omar, paul));
        var his = Team.Id(ShiftOf(schedule, omar, nora));
        await nora.PostAsync($"{team.Base}/marketplace/trades", new { myShiftId = hers, theirShiftId = his, theirMembershipId = omar.MembershipId });
        var trade = Team.Id((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!);
        // Meanwhile Nora gives the same shift away and Paul takes it.
        await nora.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = hers });
        var offer = Team.Id((await paul.GetAsync($"{team.Base}/marketplace"))["offers"]![0]!);
        await paul.PostAsync($"{team.Base}/marketplace/claims", new { shiftId = hers, giveAwayId = offer });

        var result = await omar.TryAsync(Post, $"{team.Base}/marketplace/trades/{trade}/accept");

        // The trade was closed the moment the shift changed hands, and both were told.
        Assert.Equal((HttpStatusCode.Conflict, "marketplace.no_longer_pending"), result);
        Assert.Contains("trade.rejected", await team.NotificationTypesAsync(nora));
        Assert.Contains("trade.rejected", await team.NotificationTypesAsync(omar));
        Assert.True(Team.Holds(await ShiftAsync(team, his), omar));
        Assert.True(Team.Holds(await ShiftAsync(team, hers), paul));
        Assert.Empty((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
    }

    [Fact]
    public async Task A_pending_trade_expires_after_14_days_or_when_a_shift_starts()
    {
        // Three weeks before the period, so 14 days pass before any shift starts.
        await using var app = await TestApp.StartAsync(postgres, now: Instant.FromUtc(2026, 10, 19, 13, 0));
        var (team, schedule) = await PublishedAsync(app);
        var (nora, omar) = (team.Staff[2], team.Staff[3]);
        await nora.PostAsync($"{team.Base}/marketplace/trades", new { myShiftId = Team.Id(ShiftOf(schedule, nora, omar)), theirShiftId = Team.Id(ShiftOf(schedule, omar, nora)), theirMembershipId = omar.MembershipId });
        var trade = Team.Id((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]![0]!);

        app.Clock.Advance(Duration.FromDays(13));
        Assert.Single((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
        app.Clock.Advance(Duration.FromDays(1) + Duration.FromMinutes(1));

        // FR-191.
        Assert.Empty((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
        Assert.Equal("marketplace.no_longer_pending", (await omar.TryAsync(Post, $"{team.Base}/marketplace/trades/{trade}/accept")).Code);
    }

    [Fact]
    public async Task Nothing_can_be_offered_or_claimed_once_the_shift_has_started()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var (team, schedule) = await PublishedAsync(app);
        var nora = team.Staff[2];
        var first = Team.ShiftsOf(schedule, nora)[0];

        app.Clock.Advance(Duration.FromDays(14));
        var result = await nora.TryAsync(Post, $"{team.Base}/marketplace/give-aways", new { shiftId = Team.Id(first) });

        Assert.Equal((HttpStatusCode.Conflict, "marketplace.shift_started"), result);
        Assert.Empty((await nora.GetAsync($"{team.Base}/marketplace"))["openShifts"]!.AsArray());
    }
}
