using System.Text.Json.Nodes;
using NodaTime;
using Quart.Modules.Jobs;

namespace Quart.Api.Tests;

/// <summary>
/// The Trade board's timed alerts (M7-05, M7-08): a shift given away and still untaken 36 hours before it starts,
/// and a trade nobody answered in time. Both come from the tick, even if nobody opens the Trade tab.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class MarketplaceAlertTests(PostgresFixture postgres)
{
    private static CancellationToken Cancellation => TestContext.Current.CancellationToken;

    private static int Count(List<string> types, string type) => types.Count(x => x == type);

    [Fact]
    public async Task A_shift_still_untaken_36_hours_before_tells_the_managers_and_the_giver_once_and_a_taken_one_tells_nobody()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var (lea, nora, paul) = (team.Staff[0], team.Staff[2], team.Staff[4]);
        var untaken = Team.ShiftsOf(schedule, lea)[0];
        var taken = Team.ShiftsOf(schedule, nora).First(x => !Team.Holds(x, paul) && Team.Id(x) != Team.Id(untaken));
        await lea.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = Team.Id(untaken) });
        await nora.PostAsync($"{team.Base}/marketplace/give-aways", new { shiftId = Team.Id(taken) });
        var offer = (await paul.GetAsync($"{team.Base}/marketplace"))["offers"]!.AsArray().Single(x => x!["shift"]!["id"]!.GetValue<string>() == Team.Id(taken))!;
        await paul.PostAsync($"{team.Base}/marketplace/claims", new { shiftId = Team.Id(taken), giveAwayId = Team.Id(offer) });

        // 30 hours before Léa's shift: its 36-hour check is due, and the shift has not started.
        var startsAt = Instant.FromDateTimeOffset(DateTimeOffset.Parse(untaken["startsAt"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture));
        app.Clock.Advance(startsAt - Duration.FromHours(30) - app.Clock.GetCurrentInstant());
        await app.Factory.Services.RunTickAsync(Cancellation);
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Equal(1, Count(await team.NotificationTypesAsync(lea), "shift.unclaimed_mine"));
        Assert.Equal(1, Count(await team.NotificationTypesAsync(team.Owner), "shift.unclaimed"));
        Assert.Equal(0, Count(await team.NotificationTypesAsync(nora), "shift.unclaimed_mine"));
        // Only managers hear about other people's shifts.
        Assert.Equal(0, Count(await team.NotificationTypesAsync(paul), "shift.unclaimed"));
    }

    [Fact]
    public async Task A_trade_nobody_answered_ends_on_time_and_both_people_are_told()
    {
        // Three weeks before the period, so 14 days pass before any shift starts.
        await using var app = await TestApp.StartAsync(postgres, now: Instant.FromUtc(2026, 10, 19, 13, 0));
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var (nora, omar) = (team.Staff[2], team.Staff[3]);
        JsonNode Of(TestUser holder, TestUser other) => Team.ShiftsOf(schedule, holder).First(x => !Team.Holds(x, other));
        await nora.PostAsync($"{team.Base}/marketplace/trades", new { myShiftId = Team.Id(Of(nora, omar)), theirShiftId = Team.Id(Of(omar, nora)), theirMembershipId = omar.MembershipId });

        app.Clock.Advance(Duration.FromDays(14) + Duration.FromMinutes(1));
        await app.Factory.Services.RunTickAsync(Cancellation);
        await app.Factory.Services.RunTickAsync(Cancellation);

        Assert.Equal(1, Count(await team.NotificationTypesAsync(nora), "trade.expired"));
        Assert.Equal(1, Count(await team.NotificationTypesAsync(omar), "trade.expired"));
        Assert.Empty((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
    }
    [Fact]
    public async Task Changing_the_hours_of_a_shift_cancels_its_pending_trade_and_tells_both_people()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var (nora, omar) = (team.Staff[2], team.Staff[3]);
        JsonNode Of(TestUser holder, TestUser other) => Team.ShiftsOf(schedule, holder).First(x => !Team.Holds(x, other));
        var hers = Of(nora, omar);
        await nora.PostAsync($"{team.Base}/marketplace/trades", new { myShiftId = Team.Id(hers), theirShiftId = Team.Id(Of(omar, nora)), theirMembershipId = omar.MembershipId });

        // The manager moves Nora's shift one hour later (FR-191).
        var shifts = (await team.Owner.GetAsync($"{team.Period}/shifts"))["shifts"]!.AsArray().Select(x => new JsonObject
        {
            ["id"] = x!["id"]!.GetValue<string>(), ["date"] = x["date"]!.GetValue<string>(),
            ["start"] = x["start"]!.GetValue<string>(), ["end"] = x["end"]!.GetValue<string>(),
            ["headcount"] = x["headcount"]!.GetValue<int>(), ["requirements"] = x["requirements"]!.DeepClone(),
        }).ToList();
        var moved = shifts.Single(x => x["id"]!.GetValue<string>() == Team.Id(hers));
        moved["start"] = moved["start"]!.GetValue<string>() == "10:00" ? "11:00" : "17:00";
        await team.Owner.SendAsync(HttpMethod.Put, $"{team.Period}/shifts", new { shifts });

        Assert.Equal(1, Count(await team.NotificationTypesAsync(nora), "trade.cancelled"));
        Assert.Equal(1, Count(await team.NotificationTypesAsync(omar), "trade.cancelled"));
        Assert.Empty((await omar.GetAsync($"{team.Base}/marketplace"))["trades"]!.AsArray());
    }
}
