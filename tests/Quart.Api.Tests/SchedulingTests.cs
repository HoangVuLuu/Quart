using System.Net;
using System.Text.Json.Nodes;
using NodaTime;
using Npgsql;

namespace Quart.Api.Tests;

/// <summary>
/// The core loop (M3 to M5): the template, a period of dated shifts, availability, generating and fixing a
/// draft, publishing, and updating with only the affected people told.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class SchedulingTests(PostgresFixture postgres)
{
    private static readonly HttpMethod Put = HttpMethod.Put;

    [Theory]
    [InlineData("23:00", "00:30", "template.crosses_midnight")]
    [InlineData("16:00", "10:00", "template.crosses_midnight")]
    [InlineData("10:07", "16:00", "template.off_grid")]
    [InlineData("10h", "16:00", "template.time_invalid")]
    public async Task The_template_refuses_shifts_that_cross_midnight_or_leave_the_15_minute_grid(string start, string end, string code)
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);

        var result = await owner.TryAsync(Put, $"/api/workplaces/{workplaceId}/generator", new
        {
            periodWeeks = 2, openingFairness = true, closingFairness = true,
            blocks = new[] { new { days = new[] { 1 }, start, end, headcount = 2 } },
        });

        Assert.Equal((HttpStatusCode.BadRequest, code), result);
    }

    [Fact]
    public async Task The_template_checks_rules_counts_and_pairs_and_allows_overlapping_blocks()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var lea = team.Staff[0].MembershipId;
        var marc = team.Staff[1].MembershipId;
        object Setup(int weeks, int? max, int headcount, int minLevel3, object[] conflicts, int[]? days = null) => new
        {
            periodWeeks = weeks, maxConsecutiveShifts = max, openingFairness = false, closingFairness = true,
            blocks = new object[]
            {
                new { days = days ?? [1, 2, 3], start = "10:00", end = "16:00", headcount, requirements = new[] { new { level = 3, minCount = minLevel3 } }, conflicts },
                new { days = new[] { 1 }, start = "12:00", end = "18:00", headcount = 1 },
            },
        };
        var url = $"{team.Base}/generator";

        Assert.Equal("settings.period_weeks_invalid", (await team.Owner.TryAsync(Put, url, Setup(0, 3, 2, 1, []))).Code);
        Assert.Equal("settings.max_consecutive_invalid", (await team.Owner.TryAsync(Put, url, Setup(2, 5, 2, 1, []))).Code);
        // FR-065: requirements count inside the headcount, not on top of it.
        Assert.Equal("template.requirement_exceeds_headcount", (await team.Owner.TryAsync(Put, url, Setup(2, 3, 2, 3, []))).Code);
        Assert.Equal("template.no_days", (await team.Owner.TryAsync(Put, url, Setup(2, 3, 2, 1, [], days: []))).Code);
        Assert.Equal("template.conflict_duplicate", (await team.Owner.TryAsync(Put, url, Setup(2, 3, 2, 1,
            [new { membershipA = lea, membershipB = marc }, new { membershipA = marc, membershipB = lea }]))).Code);
        Assert.Equal("template.conflict_invalid", (await team.Owner.TryAsync(Put, url, Setup(2, 3, 2, 1, [new { membershipA = lea, membershipB = Guid.NewGuid() }]))).Code);

        // FR-063: the opener and the mid block overlap, and that saves.
        await team.Owner.SendAsync(Put, url, Setup(3, null, 2, 1, [new { membershipA = marc, membershipB = lea }]));
        var saved = await team.Owner.GetAsync(url);
        Assert.Equal(3, saved["periodWeeks"]!.GetValue<int>());
        Assert.Null(saved["maxConsecutiveShifts"]);
        Assert.False(saved["openingFairness"]!.GetValue<bool>());
        Assert.Equal(2, saved["blocks"]!.AsArray().Count);
        Assert.Single(saved["blocks"]![0]!["conflicts"]!.AsArray());
    }

    [Fact]
    public async Task A_period_starts_on_a_monday_copies_the_template_and_asks_everyone_who_works_shifts()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);

        Assert.Equal("period.start_not_monday", (await team.Owner.TryAsync(HttpMethod.Post, $"{team.Base}/periods", new { startDate = "2026-11-10" })).Code);
        // The length comes from the generator rules (two weeks here); the request has none (FR-090).
        await team.OpenPeriodAsync(weeks: 2);
        Assert.Equal(2, (await team.Owner.GetAsync($"{team.Base}/periods/current"))["next"]!["period"]!["weeks"]!.GetValue<int>());
        Assert.Equal("period.unfinished_exists", (await team.Owner.TryAsync(HttpMethod.Post, $"{team.Base}/periods", new { startDate = "2026-11-23" })).Code);

        var mine = await team.Staff[0].GetAsync($"{team.Period}/availability/me");
        // Two weeks of two shifts a day (spec 2.2).
        Assert.Equal(28, mine["shifts"]!.AsArray().Count);
        Assert.Equal("not_sent", mine["status"]!.GetValue<string>());
        Assert.Contains("availability.requested", await team.NotificationTypesAsync(team.Staff[0]));
        var current = await team.Staff[0].GetAsync($"{team.Base}/periods/current");
        Assert.Null(current["live"]);
        Assert.True(current["next"]!["canEditAvailability"]!.GetValue<bool>());
        // How many have sent is the admin's business only.
        Assert.Null(current["next"]!["sentCount"]);
        Assert.Equal(0, (await team.Owner.GetAsync($"{team.Base}/periods/current"))["next"]!["sentCount"]!.GetValue<int>());
    }

    [Fact]
    public async Task A_period_without_a_template_cannot_be_opened()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var owner = await app.PersonAsync("Philippe Roy");
        var workplaceId = await app.WorkplaceAsync(owner, withTemplate: false);

        var result = await owner.TryAsync(HttpMethod.Post, $"/api/workplaces/{workplaceId}/periods", new { startDate = "2026-11-09" });

        Assert.Equal((HttpStatusCode.Conflict, "period.template_empty"), result);
    }

    [Fact]
    public async Task Editing_the_template_later_leaves_an_open_period_untouched()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();

        await team.Owner.SendAsync(Put, $"{team.Base}/generator", new
        {
            periodWeeks = 1, openingFairness = true, closingFairness = true,
            blocks = new[] { new { days = new[] { 1 }, start = "09:00", end = "12:00", headcount = 5 } },
        });

        // FR-068, AD-010: the period owns its own dated shifts.
        var shifts = (await team.Staff[0].GetAsync($"{team.Period}/availability/me"))["shifts"]!.AsArray();
        Assert.Equal(14, shifts.Count);
        Assert.All(shifts, shift => Assert.Contains(shift!["start"]!.GetValue<string>(), new[] { "10:00", "16:00" }));
    }

    [Fact]
    public async Task A_shift_keeps_its_local_time_across_the_november_clock_change()
    {
        // Sunday 1 November 2026 is the end of daylight saving time in Montreal.
        await using var app = await TestApp.StartAsync(postgres, now: Instant.FromUtc(2026, 10, 19, 13, 0));
        var team = await Team.CreateAsync(app);

        var schedule = await team.PublishAsync(monday: new LocalDate(2026, 10, 26));

        var closings = schedule["shifts"]!.AsArray().Where(x => x!["start"]!.GetValue<string>() == "16:00").ToList();
        var saturday = closings.Single(x => x!["date"]!.GetValue<string>() == "2026-10-31")!;
        var sunday = closings.Single(x => x!["date"]!.GetValue<string>() == "2026-11-01")!;
        // AD-028: 16:00 stays 16:00; only the instant behind it moves by the hour the clocks went back.
        Assert.Equal(new DateTimeOffset(2026, 10, 31, 20, 0, 0, TimeSpan.Zero), saturday["startsAt"]!.GetValue<DateTimeOffset>());
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 21, 0, 0, TimeSpan.Zero), sunday["startsAt"]!.GetValue<DateTimeOffset>());
    }

    [Fact]
    public async Task Availability_is_private_to_its_author_and_the_admins_and_a_draft_is_not_an_answer()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var (lea, marc) = (team.Staff[0], team.Staff[1]);
        var shifts = (await lea.GetAsync($"{team.Period}/availability/me"))["shifts"]!.AsArray().Select(x => Team.Id(x!)).ToList();

        await lea.SendAsync(Put, $"{team.Period}/availability/me", new { shiftIds = shifts.Take(3) });
        Assert.Equal("not_sent", (await lea.GetAsync($"{team.Period}/availability/me"))["status"]!.GetValue<string>());
        Assert.Equal("availability.unknown_shift", (await lea.TryAsync(HttpMethod.Post, $"{team.Period}/availability/me/send", new { desiredWeeklyHours = 20, shiftIds = new[] { Guid.NewGuid() } })).Code);
        await lea.PostAsync($"{team.Period}/availability/me/send", new { desiredWeeklyHours = 20, shiftIds = shifts.Take(2) });
        await lea.PostAsync($"{team.Period}/availability/me/notes", new { body = "Exams on the 12th, evenings only." });
        // FR-098: sending again replaces the answer.
        var resent = await lea.PostAsync($"{team.Period}/availability/me/send", new { desiredWeeklyHours = 20, shiftIds = shifts.Take(4) });

        Assert.Equal(4, resent["shifts"]!.AsArray().Count(x => x!["selected"]!.GetValue<bool>()));
        Assert.Equal(HttpStatusCode.Forbidden, (await marc.TryAsync(HttpMethod.Get, $"{team.Period}/availability")).Status);
        var teamView = await team.Owner.GetAsync($"{team.Period}/availability");
        var leaRow = teamView["people"]!.AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == lea.MembershipId.ToString())!;
        Assert.Equal(1, teamView["sentCount"]!.GetValue<int>());
        Assert.Equal(7, teamView["total"]!.GetValue<int>());
        Assert.Equal("sent", leaRow["status"]!.GetValue<string>());
        Assert.Equal("Exams on the 12th, evenings only.", leaRow["notes"]![0]!["body"]!.GetValue<string>());

        // FR-215, FR-216: the admin is told, and the note's text is not in the notification.
        var inbox = await team.Owner.GetAsync($"{team.Base}/notifications");
        Assert.Contains(inbox["items"]!.AsArray(), x => x!["type"]!.GetValue<string>() == "availability.note_added");
        Assert.DoesNotContain("Exams", inbox.ToJsonString());
    }

    [Fact]
    public async Task Someone_who_does_not_work_shifts_has_no_availability_to_give()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.Owner.SendAsync(HttpMethod.Patch, $"{team.Base}/members/{team.Owner.MembershipId}", new { worksShifts = false });
        await team.OpenPeriodAsync();

        var result = await team.Owner.TryAsync(HttpMethod.Get, $"{team.Period}/availability/me");

        Assert.Equal((HttpStatusCode.Forbidden, "availability.not_shift_worker"), result);
    }

    [Fact]
    public async Task A_note_is_capped_at_500_characters_on_the_server_and_at_ten_notes_per_period()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var lea = team.Staff[0];

        Assert.Equal("availability.note_too_long", (await lea.TryAsync(HttpMethod.Post, $"{team.Period}/availability/me/notes", new { body = new string('a', 501) })).Code);
        Assert.Equal("availability.note_empty", (await lea.TryAsync(HttpMethod.Post, $"{team.Period}/availability/me/notes", new { body = "   " })).Code);
        for (var i = 0; i < 10; i++)
        {
            await lea.PostAsync($"{team.Period}/availability/me/notes", new { body = new string('a', 500) });
        }
        Assert.Equal("availability.too_many_notes", (await lea.TryAsync(HttpMethod.Post, $"{team.Period}/availability/me/notes", new { body = "one more" })).Code);
    }

    [Fact]
    public async Task Building_locks_availability_but_not_notes_until_the_manager_leaves()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var (lea, marc) = (team.Staff[0], team.Staff[1]);
        await team.SendAvailabilityAsync(lea);
        var shifts = (await marc.GetAsync($"{team.Period}/availability/me"))["shifts"]!.AsArray().Select(x => Team.Id(x!)).ToList();

        // FR-100: a build by hand locks exactly as Generate does.
        await team.Owner.PostAsync($"{team.Period}/draft/start");
        Assert.Equal((HttpStatusCode.Conflict, "availability.locked"), await marc.TryAsync(HttpMethod.Post, $"{team.Period}/availability/me/send", new { desiredWeeklyHours = 20, shiftIds = shifts }));
        Assert.Equal((HttpStatusCode.Conflict, "availability.locked"), await lea.TryAsync(Put, $"{team.Period}/availability/me", new { shiftIds = shifts.Take(1) }));
        // FR-103: notes stay possible after the lock.
        await marc.PostAsync($"{team.Period}/availability/me/notes", new { body = "Sorry, I forgot to answer." });

        // Reopening one person is gone (2026-11-21): the manager leaving Building Schedule unlocks everyone.
        Assert.Equal(HttpStatusCode.NotFound, (await team.Owner.TryAsync(HttpMethod.Post, $"{team.Period}/availability/{marc.MembershipId}/reopen")).Status);
        await team.Owner.PostAsync($"{team.Period}/draft/leave");
        await marc.PostAsync($"{team.Period}/availability/me/send", new { desiredWeeklyHours = 20, shiftIds = shifts });
    }

    [Fact]
    public async Task Reminders_reach_only_the_people_who_have_not_sent()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        await team.SendAvailabilityAsync(team.Staff[0]);

        var result = await team.Owner.PostAsync($"{team.Period}/availability/remind", new { });

        Assert.Equal(6, result["reminded"]!.GetValue<int>());
        Assert.DoesNotContain("availability.reminder", await team.NotificationTypesAsync(team.Staff[0]));
        Assert.Contains("availability.reminder", await team.NotificationTypesAsync(team.Staff[1]));
    }

    [Fact]
    public async Task Generate_places_only_people_who_said_they_can_work_and_a_seed_reproduces_the_schedule()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        // Rita never answers; Paul only opens; everyone else can work anything.
        foreach (var person in team.Everyone.Where(x => x != team.Staff[5] && x != team.Staff[4]))
        {
            await team.SendAvailabilityAsync(person);
        }
        await team.SendAvailabilityAsync(team.Staff[4], shift => shift["start"]!.GetValue<string>() == "10:00");

        var first = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 42 });
        var other = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 43 });
        var again = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 42 });

        static string Shape(JsonNode draft) => string.Join("|", draft["shifts"]!.AsArray().Select(shift =>
            string.Join(",", shift!["people"]!.AsArray().Select(x => x!["membershipId"]!.GetValue<string>()).Order())));
        Assert.Equal(Shape(first), Shape(again));
        Assert.Equal(42, again["seed"]!.GetValue<int>());
        Assert.True(first["period"]!["locked"]!.GetValue<bool>());
        Assert.Equal("building", first["period"]!["status"]!.GetValue<string>());
        foreach (var draft in new[] { first, other })
        {
            foreach (var shift in draft["shifts"]!.AsArray())
            {
                var available = shift!["availableIds"]!.AsArray().Select(x => x!.GetValue<string>()).ToHashSet();
                // BR-001, FR-099: only people who sent and said yes to this exact shift.
                Assert.All(shift["people"]!.AsArray(), person => Assert.Contains(person!["membershipId"]!.GetValue<string>(), available));
                Assert.True(shift["people"]!.AsArray().Count <= shift["headcount"]!.GetValue<int>());
            }
            Assert.DoesNotContain(draft["shifts"]!.AsArray(), shift => Team.Holds(shift!, team.Staff[5]));
            Assert.DoesNotContain(draft["shifts"]!.AsArray(), shift => shift!["start"]!.GetValue<string>() == "16:00" && Team.Holds(shift, team.Staff[4]));
        }
        Assert.Equal("not_sent", first["people"]!.AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == team.Staff[5].MembershipId.ToString())!["availability"]!.GetValue<string>());
    }

    [Fact]
    public async Task Kept_assignments_survive_regeneration()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 1 });
        var kept = draft["shifts"]!.AsArray().Take(4)
            .Select(shift => (Shift: Team.Id(shift!), Member: shift!["people"]![0]!["membershipId"]!.GetValue<string>()))
            .ToList();
        foreach (var (shift, member) in kept)
        {
            await team.Owner.SendAsync(Put, $"{team.Period}/draft/assignments/{shift}/{member}/lock", new { locked = true });
        }

        for (var seed = 2; seed <= 6; seed++)
        {
            draft = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed });
            foreach (var (shift, member) in kept)
            {
                // FR-123, BR-004.
                var people = draft["shifts"]!.AsArray().Single(x => Team.Id(x!) == shift)!["people"]!.AsArray();
                Assert.Contains(people, x => x!["membershipId"]!.GetValue<string>() == member && x["locked"]!.GetValue<bool>());
            }
        }
    }

    [Fact]
    public async Task By_hand_the_admin_can_place_someone_unavailable_and_the_evaluator_flags_it()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var (lea, rita) = (team.Staff[0], team.Staff[5]);
        await team.SendAvailabilityAsync(lea, _ => false);
        var assignments = $"{team.Period}/draft/assignments";

        Assert.Equal("schedule.not_building", (await team.Owner.TryAsync(HttpMethod.Post, assignments, new { shiftId = Guid.NewGuid(), membershipId = lea.MembershipId })).Code);
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/start");
        var shift = Team.Id(draft["shifts"]![0]!);
        draft = await team.Owner.PostAsync(assignments, new { shiftId = shift, membershipId = lea.MembershipId });
        draft = await team.Owner.PostAsync(assignments, new { shiftId = shift, membershipId = rita.MembershipId });

        // FR-121: allowed by hand, shown as issues; the generator never does this.
        var issues = draft["issues"]!.AsArray();
        Assert.Contains(issues, x => x!["code"]!.GetValue<string>() == "issue.unavailable" && x["severity"]!.GetValue<string>() == "confirm"
            && x["memberIds"]!.AsArray().Any(id => id!.GetValue<string>() == lea.MembershipId.ToString()));
        Assert.Contains(issues, x => x!["code"]!.GetValue<string>() == "issue.not_submitted"
            && x["memberIds"]!.AsArray().Any(id => id!.GetValue<string>() == rita.MembershipId.ToString()));
        Assert.Equal(6m, draft["people"]!.AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == lea.MembershipId.ToString())!["weeklyHours"]![0]!.GetValue<decimal>());
        Assert.Equal("schedule.already_on_shift", (await team.Owner.TryAsync(HttpMethod.Post, assignments, new { shiftId = shift, membershipId = lea.MembershipId })).Code);

        // FR-142: the manager can go past the headcount for an extra pair of hands. It is shown, never blocked.
        draft = await team.Owner.PostAsync(assignments, new { shiftId = shift, membershipId = team.Staff[1].MembershipId });
        Assert.Equal(3, draft["shifts"]![0]!["people"]!.AsArray().Count);
        Assert.Equal(2, draft["shifts"]![0]!["headcount"]!.GetValue<int>());
        Assert.Contains(draft["issues"]!.AsArray(), x => x!["code"]!.GetValue<string>() == "issue.above_headcount" && x["severity"]!.GetValue<string>() == "show");
        var published = await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });
        Assert.Equal(1, published["version"]!.GetValue<int>());
        Assert.Equal(3, (await team.ScheduleAsync())["shifts"]![0]!["people"]!.AsArray().Count);
        // An overstaffed shift has nothing to claim.
        Assert.DoesNotContain((await team.Staff[2].GetAsync($"{team.Base}/marketplace"))["openShifts"]!.AsArray(), x => Team.Id(x!["shift"]!) == shift);

        draft = await team.Owner.SendAsync(HttpMethod.Delete, $"{assignments}/{shift}/{rita.MembershipId}");
        Assert.Equal(2, draft["shifts"]![0]!["people"]!.AsArray().Count);
        Assert.Equal("schedule.not_on_shift", (await team.Owner.TryAsync(HttpMethod.Delete, $"{assignments}/{shift}/{rita.MembershipId}")).Code);
    }

    [Fact]
    public async Task Publishing_asks_about_a_missing_level_or_an_empty_place_and_then_tells_everyone()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var sophie = team.Staff[3];

        // AD-012: staff never see a draft.
        Assert.Equal(HttpStatusCode.Forbidden, (await sophie.TryAsync(HttpMethod.Get, $"{team.Period}/draft")).Status);
        Assert.Equal("schedule.not_building", (await team.Owner.TryAsync(HttpMethod.Post, $"{team.Period}/draft/publish", new { confirmed = true })).Code);
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 5 });
        Assert.Equal((HttpStatusCode.Conflict, "schedule.not_published"), await sophie.TryAsync(HttpMethod.Get, $"{team.Period}/schedule"));
        Assert.DoesNotContain(draft["issues"]!.AsArray(), x => x!["severity"]!.GetValue<string>() != "show");

        // Take every level 3 off the first shift: "missing required level" asks, it does not block (FR-144).
        var first = draft["shifts"]![0]!;
        var level3 = team.Everyone.Where(x => x == team.Owner || x == team.Staff[0] || x == team.Staff[1]).Select(x => x.MembershipId.ToString()).ToHashSet();
        foreach (var person in first["people"]!.AsArray().Where(x => level3.Contains(x!["membershipId"]!.GetValue<string>())).ToList())
        {
            await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Period}/draft/assignments/{Team.Id(first)}/{person!["membershipId"]!.GetValue<string>()}");
        }
        using (var asked = await team.Owner.RawAsync(HttpMethod.Post, $"{team.Period}/draft/publish", new { confirmed = false }))
        {
            var problem = await System.Net.Http.Json.HttpContentJsonExtensions.ReadFromJsonAsync<JsonNode>(asked.Content, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.Conflict, asked.StatusCode);
            Assert.Equal("schedule.publish_needs_confirmation", problem!["code"]!.GetValue<string>());
            Assert.Contains(problem["issues"]!.AsArray(), x => x!.GetValue<string>() == "issue.missing_level");
        }
        Assert.Contains((await team.Owner.GetAsync($"{team.Period}/draft"))["issues"]!.AsArray(),
            x => x!["code"]!.GetValue<string>() == "issue.missing_level" && x["severity"]!.GetValue<string>() == "confirm");

        // Put a level 3 back, leaving one slot empty: "below headcount" only asks (FR-144, FR-165).
        var remaining = first["people"]!.AsArray().Select(x => x!["membershipId"]!.GetValue<string>()).Where(x => !level3.Contains(x)).ToList();
        foreach (var id in remaining)
        {
            await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Period}/draft/assignments/{Team.Id(first)}/{id}");
        }
        var free = team.Everyone.First(x => level3.Contains(x.MembershipId.ToString()));
        await team.Owner.PostAsync($"{team.Period}/draft/assignments", new { shiftId = Team.Id(first), membershipId = free.MembershipId });
        using (var asking = await team.Owner.RawAsync(HttpMethod.Post, $"{team.Period}/draft/publish", new { confirmed = false }))
        {
            var problem = await System.Net.Http.Json.HttpContentJsonExtensions.ReadFromJsonAsync<JsonNode>(asking.Content, TestContext.Current.CancellationToken);
            if (asking.StatusCode == HttpStatusCode.Conflict)
            {
                Assert.Equal("schedule.publish_needs_confirmation", problem!["code"]!.GetValue<string>());
            }
            else
            {
                Assert.Fail($"Publishing with an empty slot answered {asking.StatusCode} without asking.");
            }
        }
        var published = await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });

        Assert.Equal(1, published["version"]!.GetValue<int>());
        Assert.Equal("published", published["status"]!.GetValue<string>());
        // FR-160: everyone is told.
        Assert.All(await Task.WhenAll(team.Everyone.Select(team.NotificationTypesAsync)), types => Assert.Contains("schedule.published", types));
        var schedule = await team.ScheduleAsync(sophie);
        Assert.Equal(14, schedule["shifts"]!.AsArray().Count);
        Assert.Single(schedule["shifts"]![0]!["people"]!.AsArray());
        Assert.All(Team.ShiftsOf(schedule, sophie), shift => Assert.Contains(shift["people"]!.AsArray(), x => x!["isMe"]!.GetValue<bool>() && x["name"]!.GetValue<string>() == "Omar H."));
        var current = await sophie.GetAsync($"{team.Base}/periods/current");
        Assert.Equal(team.PeriodId.ToString(), current["live"]!["id"]!.GetValue<string>());
        Assert.Null(current["next"]);
    }

    [Fact]
    public async Task A_rule_changed_in_Edit_Generator_after_the_period_was_opened_still_applies_when_building()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var (lea, mia) = (team.Staff[0], team.Staff[1]);

        // The period is already open when the manager says these two cannot work together (BR-036).
        var setup = await team.Owner.GetAsync($"{team.Base}/generator");
        foreach (var block in setup["blocks"]!.AsArray())
        {
            block!["conflicts"] = new JsonArray(new JsonObject { ["membershipA"] = lea.MembershipId, ["membershipB"] = mia.MembershipId });
        }
        await team.Owner.SendAsync(HttpMethod.Put, $"{team.Base}/generator", setup);

        var draft = await team.Owner.PostAsync($"{team.Period}/draft/start");
        var shift = Team.Id(draft["shifts"]![0]!);
        await team.Owner.PostAsync($"{team.Period}/draft/assignments", new { shiftId = shift, membershipId = lea.MembershipId });
        draft = await team.Owner.PostAsync($"{team.Period}/draft/assignments", new { shiftId = shift, membershipId = mia.MembershipId });

        Assert.Contains(draft["issues"]!.AsArray(), x => x!["code"]!.GetValue<string>() == "issue.incompatible_pair");
    }

    [Fact]
    public async Task Generating_again_in_the_middle_of_a_published_period_leaves_the_days_already_worked_alone()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var before = await team.PublishAsync();
        static string Roster(JsonNode shift) => string.Join(",", shift["people"]!.AsArray().Select(x => x!["membershipId"]!.GetValue<string>()).Order());

        // Wednesday noon of the week that was published: Monday and Tuesday are done.
        app.Clock.Advance(Instant.FromUtc(2026, 11, 11, 17, 0) - app.Clock.GetCurrentInstant());
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 99 });

        var worked = before["shifts"]!.AsArray().Where(x => string.CompareOrdinal(x!["date"]!.GetValue<string>(), "2026-11-11") < 0).ToList();
        Assert.Equal(4, worked.Count);
        Assert.All(worked, shift => Assert.Equal(Roster(shift!), Roster(draft["shifts"]!.AsArray().Single(x => Team.Id(x!) == Team.Id(shift!))!)));
    }

    [Fact]
    public async Task A_period_published_ahead_of_time_can_be_read_before_the_current_one_ends()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var thisMonday = app.Clock.GetCurrentInstant().InZone(DateTimeZoneProviders.Tzdb["America/Toronto"]).Date.With(DateAdjusters.PreviousOrSame(IsoDayOfWeek.Monday));
        await team.PublishAsync(monday: thisMonday);
        var first = team.PeriodId;
        await team.PublishAsync(monday: thisMonday.PlusWeeks(1));
        var second = team.PeriodId;
        var sophie = team.Staff[3];

        var current = await sophie.GetAsync($"{team.Base}/periods/current");

        Assert.Equal(first.ToString(), current["live"]!["id"]!.GetValue<string>());
        Assert.Equal(second.ToString(), current["upcoming"]!.AsArray().Single()!["id"]!.GetValue<string>());
        Assert.Null(current["next"]);
        Assert.Equal(14, (await team.ScheduleAsync(sophie))["shifts"]!.AsArray().Count);
    }

    [Fact]
    public async Task An_update_bumps_the_version_and_tells_only_the_people_whose_shifts_changed()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        foreach (var person in team.Everyone)
        {
            await person.PostAsync($"{team.Base}/notifications/read-all");
        }
        var draft = await team.Owner.GetAsync($"{team.Period}/draft");
        Assert.False(draft["hasUnpublishedChanges"]!.GetValue<bool>());
        Assert.Equal("schedule.nothing_to_publish", (await team.Owner.TryAsync(HttpMethod.Post, $"{team.Period}/draft/publish", new { confirmed = true })).Code);

        // Swap one person for another of the same level on one shift.
        var shift = schedule["shifts"]!.AsArray().First(x => Team.Holds(x!, team.Staff[4]) != Team.Holds(x!, team.Staff[5]))!;
        var (leaving, arriving) = Team.Holds(shift, team.Staff[4]) ? (team.Staff[4], team.Staff[5]) : (team.Staff[5], team.Staff[4]);
        await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Period}/draft/assignments/{Team.Id(shift)}/{leaving.MembershipId}");
        draft = await team.Owner.PostAsync($"{team.Period}/draft/assignments", new { shiftId = Team.Id(shift), membershipId = arriving.MembershipId });
        Assert.True(draft["hasUnpublishedChanges"]!.GetValue<bool>());
        // Until Update, staff still see version 1.
        Assert.True(Team.Holds((await team.ScheduleAsync())["shifts"]!.AsArray().Single(x => Team.Id(x!) == Team.Id(shift))!, leaving));

        var updated = await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });

        Assert.Equal(2, updated["version"]!.GetValue<int>());
        Assert.True(Team.Holds((await team.ScheduleAsync())["shifts"]!.AsArray().Single(x => Team.Id(x!) == Team.Id(shift))!, arriving));
        foreach (var person in team.Everyone)
        {
            var unread = (await person.GetAsync($"{team.Base}/notifications"))["items"]!.AsArray().Where(x => !x!["read"]!.GetValue<bool>()).ToList();
            if (person == leaving || person == arriving)
            {
                // FR-163: with a summary of what changed for them.
                var change = Assert.Single(unread)!;
                Assert.Equal("schedule.changed", change["type"]!.GetValue<string>());
                Assert.Equal(person == arriving ? "1" : "0", change["parameters"]!["added"]!.GetValue<string>());
                Assert.Equal(person == leaving ? "1" : "0", change["parameters"]!["removed"]!.GetValue<string>());
            }
            else
            {
                Assert.Empty(unread);
            }
        }
    }

    [Fact]
    public async Task The_database_itself_refuses_two_overlapping_published_shifts_for_one_person()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var shift = Team.ShiftsOf(schedule, team.Owner)[0];
        var source = (NpgsqlDataSource)app.Factory.Services.GetService(typeof(NpgsqlDataSource))!;
        await using var connection = await source.OpenConnectionAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO scheduling.assignment (id, period_id, shift_id, membership_id, user_id, is_draft, is_locked, source, starts_at, ends_at)
            SELECT gen_random_uuid(), period_id, shift_id, gen_random_uuid(), user_id, false, false, 'manual', starts_at + interval '1 hour', ends_at + interval '1 hour'
            FROM scheduling.assignment WHERE shift_id = @shift AND user_id = @user AND NOT is_draft
            """,
            connection);
        command.Parameters.AddWithValue("shift", Guid.Parse(Team.Id(shift)));
        command.Parameters.AddWithValue("user", team.Owner.UserId);

        // AD-011: not application code, a constraint.
        var refused = await Assert.ThrowsAsync<PostgresException>(() => command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));
        Assert.Equal(PostgresErrorCodes.ExclusionViolation, refused.SqlState);
    }

    [Fact]
    public async Task Leaving_the_workplace_opens_the_persons_future_shifts()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var paul = team.Staff[4];
        var held = Team.ShiftsOf(schedule, paul).Count;
        Assert.True(held > 0);

        await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Base}/members/{paul.MembershipId}");

        // FR-038.
        var after = await team.ScheduleAsync();
        Assert.Empty(Team.ShiftsOf(after, paul));
        Assert.Equal(held, after["shifts"]!.AsArray().Sum(x => x!["headcount"]!.GetValue<int>() - x["people"]!.AsArray().Count));
        Assert.DoesNotContain((await team.Owner.GetAsync($"{team.Period}/draft"))["shifts"]!.AsArray(), x => Team.Holds(x!, paul));
    }

    [Fact]
    public async Task Leaving_saves_a_new_version_of_the_schedule_without_the_person()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        var schedule = await team.PublishAsync();
        var paul = team.Staff[4];
        var before = schedule["period"]!["version"]!.GetValue<int>();

        await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Base}/members/{paul.MembershipId}");

        // FR-164: the change is history, like any other change to the live schedule.
        var after = await team.ScheduleAsync();
        Assert.Equal(before + 1, after["period"]!["version"]!.GetValue<int>());
        var source = (NpgsqlDataSource)app.Factory.Services.GetService(typeof(NpgsqlDataSource))!;
        await using var connection = await source.OpenConnectionAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT snapshot::text FROM scheduling.schedule_version WHERE period_id = @period ORDER BY version DESC LIMIT 1", connection);
        command.Parameters.AddWithValue("period", Guid.Parse(after["period"]!["id"]!.GetValue<string>()));
        var snapshot = (string)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
        Assert.DoesNotContain(paul.MembershipId.ToString(), snapshot, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(team.Owner.MembershipId.ToString(), snapshot, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Works_shifts_cannot_be_turned_off_while_the_person_holds_a_published_shift()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.PublishAsync();
        var paul = team.Staff[4];

        // D1: refused, and nothing else in the same request is saved either.
        var refused = await team.Owner.TryAsync(HttpMethod.Patch, $"{team.Base}/members/{paul.MembershipId}", new { worksShifts = false, level = 3 });

        Assert.Equal((HttpStatusCode.Conflict, "workplace.has_upcoming_shifts"), refused);
        var row = (await team.Owner.GetAsync($"{team.Base}/members")).AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == paul.MembershipId.ToString())!;
        Assert.True(row["worksShifts"]!.GetValue<bool>());
        Assert.Equal(1, row["level"]!.GetValue<int>());
    }

    [Fact]
    public async Task Works_shifts_can_be_turned_off_once_the_person_is_taken_off_every_upcoming_shift()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 7 });
        var paul = team.Staff[4];
        var member = $"{team.Base}/members/{paul.MembershipId}";

        // A draft shift counts too: the person would vanish from the draft tools but stay on it.
        Assert.Equal((HttpStatusCode.Conflict, "workplace.has_upcoming_shifts"), await team.Owner.TryAsync(HttpMethod.Patch, member, new { worksShifts = false }));
        // The maximum and level still change while the person has shifts.
        await team.Owner.SendAsync(HttpMethod.Patch, member, new { worksShifts = true, maxWeeklyHours = 12 });
        // A member of another workplace cannot reach Paul at all (1.6).
        var stranger = await app.PersonAsync("Sam Other");
        var elsewhere = await app.WorkplaceAsync(stranger);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.TryAsync(HttpMethod.Patch, $"/api/workplaces/{elsewhere}/members/{paul.MembershipId}", new { worksShifts = false })).Status);

        foreach (var shift in draft["shifts"]!.AsArray().Where(x => Team.Holds(x!, paul)))
        {
            await team.Owner.SendAsync(HttpMethod.Delete, $"{team.Period}/draft/assignments/{Team.Id(shift!)}/{paul.MembershipId}");
        }
        await team.Owner.SendAsync(HttpMethod.Patch, member, new { worksShifts = false });

        var row = (await team.Owner.GetAsync($"{team.Base}/members")).AsArray().Single(x => x!["membershipId"]!.GetValue<string>() == paul.MembershipId.ToString())!;
        Assert.False(row["worksShifts"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Same_as_last_period_offers_the_previous_answers_by_weekday_and_block()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var paul = team.Staff[4];
        foreach (var person in team.Everyone.Where(x => x != paul))
        {
            await team.SendAvailabilityAsync(person);
        }
        // Paul opens on weekdays only.
        await team.SendAvailabilityAsync(paul, shift => shift["start"]!.GetValue<string>() == "10:00" && DateOnly.Parse(shift["date"]!.GetValue<string>(), null).DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday));
        await team.Owner.PostAsync($"{team.Period}/draft/generate", new { seed = 3 });
        await team.Owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });

        await team.OpenPeriodAsync(weeks: 2, monday: new LocalDate(2026, 11, 16));
        var mine = await paul.GetAsync($"{team.Period}/availability/me");
        var suggested = (await paul.GetAsync($"{team.Period}/availability/me/previous"))["shiftIds"]!.AsArray().Select(x => x!.GetValue<string>()).ToHashSet();

        // FR-095: one week of answers repeats over the two new weeks; nothing is sent by itself.
        Assert.True(mine["hasPrevious"]!.GetValue<bool>());
        Assert.Equal("not_sent", mine["status"]!.GetValue<string>());
        Assert.Equal(10, suggested.Count);
        Assert.All(mine["shifts"]!.AsArray().Where(x => suggested.Contains(Team.Id(x!))), shift => Assert.Equal("10:00", shift!["start"]!.GetValue<string>()));
    }
}
