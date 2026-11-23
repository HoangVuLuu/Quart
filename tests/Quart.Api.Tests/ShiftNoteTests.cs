using System.Net;
using System.Text.Json.Nodes;
using Quart.Modules.Jobs;

namespace Quart.Api.Tests;

/// <summary>
/// Notes on shifts. A short note on one shift of someone's availability (FR-103a): "Can only stay until 21:00". It lives on the
/// shift the person can work, goes when they unselect it, locks with the availability, and reaches the admins on
/// that shift only. And the manager's note on a shift (FR-145), which the whole team reads once published.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class ShiftNoteTests(PostgresFixture postgres)
{
    [Fact]
    public async Task A_note_is_kept_on_a_shift_the_person_can_work_and_goes_when_they_unselect_it()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var lea = team.Staff[0];
        var send = $"{team.Period}/availability/me/send";
        var (a, b, c) = await ThreeShiftsAsync(team, lea);

        var mine = await lea.PostAsync(send, new
        {
            shiftIds = new[] { a, b },
            desiredWeeklyHours = 20,
            shiftNotes = new[] { new { shiftId = a, note = "  Can only stay until 21:00  " }, new { shiftId = b, note = "" } },
        });
        Assert.Equal("Can only stay until 21:00", NoteOf(mine, a));
        Assert.Null(NoteOf(mine, b));

        // Only on a shift the person can work, and 60 characters at most, checked by the server.
        Assert.Equal("availability.shift_note_unselected", (await lea.TryAsync(HttpMethod.Post, send, new
        {
            shiftIds = new[] { a },
            desiredWeeklyHours = 20,
            shiftNotes = new[] { new { shiftId = c, note = "Prefer not" } },
        })).Code);
        Assert.Equal("availability.shift_note_too_long", (await lea.TryAsync(HttpMethod.Post, send, new
        {
            shiftIds = new[] { a },
            desiredWeeklyHours = 20,
            shiftNotes = new[] { new { shiftId = a, note = new string('a', 61) } },
        })).Code);
        mine = await lea.PostAsync(send, new { shiftIds = new[] { a }, desiredWeeklyHours = 20, shiftNotes = new[] { new { shiftId = a, note = new string('a', 60) } } });
        Assert.Equal(60, NoteOf(mine, a)!.Length);

        // An app without the list leaves the notes of the shifts that stay as they were.
        mine = await lea.PostAsync(send, new { shiftIds = new[] { a, b }, desiredWeeklyHours = 20 });
        Assert.Equal(60, NoteOf(mine, a)!.Length);

        // Unselecting the shift drops its note; selecting it again starts without one.
        await lea.PostAsync(send, new { shiftIds = new[] { b }, desiredWeeklyHours = 20, shiftNotes = Array.Empty<object>() });
        mine = await lea.PostAsync(send, new { shiftIds = new[] { a, b }, desiredWeeklyHours = 20 });
        Assert.Null(NoteOf(mine, a));
    }

    [Fact]
    public async Task Managers_read_a_note_on_its_own_shift_once_sent_and_nobody_else_reads_it()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        var (lea, marc, nora) = (team.Staff[0], team.Staff[1], team.Staff[2]);
        var (a, b, _) = await ThreeShiftsAsync(team, lea);

        await lea.PostAsync($"{team.Period}/availability/me/send", new
        {
            shiftIds = new[] { a, b },
            desiredWeeklyHours = 20,
            shiftNotes = new[] { new { shiftId = a, note = "Until 21:00 only" } },
        });
        await marc.PostAsync($"{team.Period}/availability/me/send", new
        {
            shiftIds = new[] { a, b },
            desiredWeeklyHours = 20,
            shiftNotes = new[] { new { shiftId = b, note = "Can start later" } },
        });
        // A draft is private, notes included (FR-104a).
        await nora.SendAsync(HttpMethod.Put, $"{team.Period}/availability/me", new
        {
            shiftIds = new[] { a },
            shiftNotes = new[] { new { shiftId = a, note = "Not sent yet" } },
        });

        // The person's own page, read by a manager.
        Assert.Equal("Until 21:00 only", NoteOf(await team.Owner.GetAsync($"{team.Period}/availability/{lea.MembershipId}"), a));
        Assert.All((await team.Owner.GetAsync($"{team.Period}/availability/{nora.MembershipId}"))["shifts"]!.AsArray(), x => Assert.Null(x!["note"]));

        // Building Schedule: each shift carries only its own notes, from people who sent.
        var draft = await team.Owner.PostAsync($"{team.Period}/draft/start");
        var notesOf = (string shift) => draft["shifts"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == shift)!["notes"]!.AsArray()
            .Select(x => (x!["membershipId"]!.GetValue<string>(), x["note"]!.GetValue<string>())).ToList();
        Assert.Equal([(lea.MembershipId.ToString(), "Until 21:00 only")], notesOf(a));
        Assert.Equal([(marc.MembershipId.ToString(), "Can start later")], notesOf(b));
        Assert.Equal(2, draft["shifts"]!.AsArray().Sum(x => x!["notes"]!.AsArray().Count));

        // Coworkers never read them, and the shift locks them with the availability (FR-100).
        Assert.Equal(HttpStatusCode.Forbidden, (await nora.TryAsync(HttpMethod.Get, $"{team.Period}/availability/{lea.MembershipId}")).Status);
        Assert.Equal("availability.locked", (await lea.TryAsync(HttpMethod.Post, $"{team.Period}/availability/me/send", new
        {
            shiftIds = new[] { a },
            desiredWeeklyHours = 20,
            shiftNotes = new[] { new { shiftId = a, note = "Changed" } },
        })).Code);
        var stranger = await app.PersonAsync("Sam Stranger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.TryAsync(HttpMethod.Get, $"{team.Period}/availability/{lea.MembershipId}")).Status);
    }

    [Fact]
    public async Task A_manager_note_goes_live_with_publish_and_update_and_tells_the_people_on_that_shift()
    {
        await using var app = await TestApp.StartAsync(postgres);
        var team = await Team.CreateAsync(app);
        await team.OpenPeriodAsync();
        foreach (var person in team.Everyone)
        {
            await team.SendAvailabilityAsync(person);
        }
        var owner = team.Owner;
        var draft = await owner.PostAsync($"{team.Period}/draft/start");
        draft = await owner.PostAsync($"{team.Period}/draft/generate", new { seed = 7 });
        var ids = draft["shifts"]!.AsArray().Select(x => x!["id"]!.GetValue<string>()).ToList();
        var note = (string shift) => $"{team.Period}/draft/shifts/{shift}/note";

        // Plain text, trimmed, 100 characters at most (FR-145).
        Assert.Equal("schedule.note_too_long", (await owner.TryAsync(HttpMethod.Put, note(ids[0]), new { note = new string('a', 101) })).Code);
        draft = await owner.SendAsync(HttpMethod.Put, note(ids[0]), new { note = "  Leaving at 5pm  " });
        Assert.Equal("Leaving at 5pm", ManagerNoteOf(draft, ids[0]));
        Assert.True(draft["hasUnsavedChanges"]!.GetValue<bool>());

        // Live with the first publish, for the whole team, whoever works the shift.
        await owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });
        var paul = team.Staff[4];
        Assert.Equal("Leaving at 5pm", LiveNoteOf(await team.ScheduleAsync(paul), ids[0]));
        Assert.Null(LiveNoteOf(await team.ScheduleAsync(paul), ids[1]));

        // On Editing Schedule, an unsaved note is dropped with the visit, like any unsaved change.
        await owner.PostAsync($"{team.Period}/draft/start");
        await owner.SendAsync(HttpMethod.Put, note(ids[2]), new { note = "Not saved" });
        await owner.PostAsync($"{team.Period}/draft/leave");
        draft = await owner.PostAsync($"{team.Period}/draft/start");
        Assert.Null(ManagerNoteOf(draft, ids[2]));
        Assert.False(draft["hasUnpublishedChanges"]!.GetValue<bool>());

        // A changed note alone is something to update, and tells only the people on that shift.
        draft = await owner.SendAsync(HttpMethod.Put, note(ids[1]), new { note = "Bring the keys" });
        Assert.True(draft["hasUnpublishedChanges"]!.GetValue<bool>());
        var onShift = draft["shifts"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == ids[1])!["people"]!.AsArray()
            .Select(x => x!["membershipId"]!.GetValue<string>()).ToHashSet();
        // Everything from the first publish goes out first, so only what this update sends is counted.
        await app.Factory.Services.RunTickAsync(TestContext.Current.CancellationToken);
        var emails = app.Emails.Sent.Count;
        await owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });
        Assert.Equal("Bring the keys", LiveNoteOf(await team.ScheduleAsync(paul), ids[1]));
        await app.Factory.Services.RunTickAsync(TestContext.Current.CancellationToken);
        foreach (var person in team.Everyone)
        {
            var told = (await team.NotificationTypesAsync(person)).Contains("shift.note");
            Assert.Equal(onShift.Contains(person.MembershipId.ToString()), told);
        }
        // In the app and by push, not by email.
        Assert.Equal(emails, app.Emails.Sent.Count);

        // Removing a note goes live too, and tells nobody.
        await owner.PostAsync($"{team.Period}/draft/start");
        await owner.SendAsync(HttpMethod.Put, note(ids[1]), new { note = "" });
        await owner.PostAsync($"{team.Period}/draft/publish", new { confirmed = true });
        Assert.Null(LiveNoteOf(await team.ScheduleAsync(paul), ids[1]));
        foreach (var person in team.Everyone)
        {
            Assert.True((await team.NotificationTypesAsync(person)).Count(x => x == "shift.note") <= 1);
        }

        // Only managers write them.
        Assert.Equal(HttpStatusCode.Forbidden, (await paul.TryAsync(HttpMethod.Put, note(ids[0]), new { note = "Mine" })).Status);
    }

    private static string? ManagerNoteOf(JsonNode draft, string shiftId) =>
        draft["shifts"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == shiftId)!["managerNote"]?.GetValue<string>();

    private static string? LiveNoteOf(JsonNode schedule, string shiftId) =>
        schedule["shifts"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == shiftId)!["note"]?.GetValue<string>();

    private static async Task<(string A, string B, string C)> ThreeShiftsAsync(Team team, TestUser person)
    {
        var ids = (await person.GetAsync($"{team.Period}/availability/me"))["shifts"]!.AsArray().Select(x => x!["id"]!.GetValue<string>()).ToList();
        return (ids[0], ids[1], ids[2]);
    }

    private static string? NoteOf(JsonNode availability, string shiftId) =>
        availability["shifts"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == shiftId)!["note"]?.GetValue<string>();
}
