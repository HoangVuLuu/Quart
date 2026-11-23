using System.Net;
using System.Text.Json.Nodes;

namespace Quart.Api.Tests;

/// <summary>
/// A short note on one shift of someone's availability (FR-103a): "Can only stay until 21:00". It lives on the
/// shift the person can work, goes when they unselect it, locks with the availability, and reaches the admins on
/// that shift only.
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

    private static async Task<(string A, string B, string C)> ThreeShiftsAsync(Team team, TestUser person)
    {
        var ids = (await person.GetAsync($"{team.Period}/availability/me"))["shifts"]!.AsArray().Select(x => x!["id"]!.GetValue<string>()).ToList();
        return (ids[0], ids[1], ids[2]);
    }

    private static string? NoteOf(JsonNode availability, string shiftId) =>
        availability["shifts"]!.AsArray().Single(x => x!["id"]!.GetValue<string>() == shiftId)!["note"]?.GetValue<string>();
}
