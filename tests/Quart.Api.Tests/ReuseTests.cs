using System.Text.Json.Nodes;
using NodaTime;

namespace Quart.Api.Tests;

/// <summary>"Reuse a past schedule" (FR-124, M5-08): last period's people as this period's starting point.</summary>
[Collection(PostgresCollection.Name)]
public sealed class ReuseTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Reusing_copies_who_worked_each_shift_by_weekday_and_flags_who_is_no_longer_available()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var before = await team.PublishAsync();
        static string Key(JsonNode shift) => $"{(int)LocalDate.FromDateOnly(DateOnly.Parse(shift["date"]!.GetValue<string>())).DayOfWeek}|{shift["start"]!.GetValue<string>()}";
        static string Roster(JsonNode shift, string field) =>
            string.Join(",", shift["people"]!.AsArray().Select(x => x![field]!.GetValue<string>()).Order());
        var worked = before["shifts"]!.AsArray().ToDictionary(x => Key(x!), x => Roster(x!, "membershipId"));

        await team.OpenPeriodAsync(monday: new LocalDate(2026, 11, 16));
        var lea = team.Staff[0];
        foreach (var person in team.Everyone)
        {
            // Léa cannot work anything this time.
            await team.SendAvailabilityAsync(person, canWork: _ => person != lea);
        }
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        var sources = (await team.Owner.GetAsync($"{team.Period}/draft/reuse")).AsArray();
        var source = Assert.Single(sources)!;
        Assert.Equal("2026-11-09", source["startDate"]!.GetValue<string>());

        Assert.Equal("schedule.reuse_unknown", (await team.Owner.TryAsync(HttpMethod.Post, $"{team.Period}/draft/reuse", new { sourcePeriodId = team.PeriodId })).Code);
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/reuse", new { sourcePeriodId = source["id"]!.GetValue<string>() });

        Assert.All(draft["shifts"]!.AsArray(), shift => Assert.Equal(worked[Key(shift!)], Roster(shift!, "membershipId")));
        Assert.Contains(draft["issues"]!.AsArray(), x => x!["code"]!.GetValue<string>() == "issue.unavailable"
            && x["memberIds"]!.AsArray().Any(id => id!.GetValue<string>() == lea.MembershipId.ToString()));
    }
}
