using System.Globalization;
using System.Text.RegularExpressions;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Notifications.Email;

/// <summary>
/// Which notifications also go out by email, and their text (FR-211). Email is for things a person has to
/// act on or know about their own shifts; everything else stays in the app. Everyone gets these, with or
/// without push, until they turn Email off in Profile (M8-07, Hoang 2026-11-22). Several of one kind within a
/// few minutes become one email with the bundle sentence (FR-213).
/// </summary>
/// <remarks>
/// The sentence of each email is the in-app sentence of the same type, copied from the web app's
/// <c>alerts.types</c> translations with <c>{{x}}</c> written as <c>{x}</c>. A test keeps the two the same.
/// Subjects never carry a name, a date of someone else's shift or a note.
/// </remarks>
public static partial class NotificationEmails
{
    /// <summary>Outbox templates for notification emails are this prefix plus the notification type.</summary>
    public const string TemplatePrefix = "notification:";

    /// <summary>The greeting's parameter: the recipient's short name. Not a notification parameter, so it cannot clash with one.</summary>
    public const string RecipientParameter = "recipient";

    /// <summary>Outbox templates for bundles (M8-07, FR-213): several alerts of one kind in one email.</summary>
    public const string BundlePrefix = "notification-bundle:";

    /// <summary>How many alerts a bundle stands for. Not a notification parameter either.</summary>
    public const string CountParameter = "count";

    private static readonly Dictionary<string, Entry> Entries = new(StringComparer.Ordinal)
    {
        [NotificationTypes.SchedulePublished] = new("/schedule",
            new("The new schedule is out", "The schedule starting {periodStart} is published", "{count} schedules were published"),
            new("Le nouvel horaire est publié", "L’horaire du {periodStart} est publié", "{count} horaires ont été publiés")),
        [NotificationTypes.PeriodCancelled] = new("/schedule",
            new("A period was cancelled", "The period starting {periodStart} was cancelled", "{count} periods were cancelled"),
            new("Une période a été annulée", "La période du {periodStart} a été annulée", "{count} périodes ont été annulées")),
        [NotificationTypes.ScheduleChanged] = new("/schedule",
            new("Your schedule changed", "Your schedule changed: {added} added, {removed} removed", "Your schedule changed {count} times"),
            new("Ton horaire a changé", "Ton horaire a changé : {added} ajouté, {removed} retiré", "Ton horaire a changé {count} fois")),
        [NotificationTypes.AvailabilityRequested] = new("/availability",
            new("Send your availability", "Availability is open for the period starting {periodStart}", "Availability is open for {count} periods"),
            new("Envoie tes disponibilités", "Les disponibilités sont ouvertes pour la période du {periodStart}", "Les disponibilités sont ouvertes pour {count} périodes")),
        [NotificationTypes.AvailabilityReminder] = new("/availability",
            new("Reminder: send your availability", "Reminder: send your availability for the period starting {periodStart}", "{count} reminders to send your availability"),
            new("Rappel : envoie tes disponibilités", "Rappel : envoie tes disponibilités pour la période du {periodStart}", "{count} rappels pour envoyer tes disponibilités")),
        [NotificationTypes.AvailabilityDue] = new("/availability/team",
            new("Availability is due", "Availability for the period starting {periodStart} is due: {sent} of {total} sent", "Availability is due for {count} periods"),
            new("Les disponibilités sont dues", "Les disponibilités pour la période du {periodStart} sont dues : {sent} sur {total} envoyées", "Les disponibilités sont dues pour {count} périodes")),
        [NotificationTypes.ShiftHoursChanged] = new("/schedule",
            new("Your shift's hours changed", "Your shift on {date} is now {start}–{end}", "The hours of {count} of your shifts changed"),
            new("Les heures de ton quart ont changé", "Ton quart du {date} est maintenant {start}–{end}", "Les heures de {count} de tes quarts ont changé")),
        [NotificationTypes.ShiftRemoved] = new("/schedule",
            new("A shift of yours was removed", "Your shift on {date}, {start}–{end} was removed from the schedule", "{count} of your shifts were removed from the schedule"),
            new("Un de tes quarts a été retiré", "Ton quart du {date}, {start}–{end} a été retiré de l’horaire", "{count} de tes quarts ont été retirés de l’horaire")),
        [NotificationTypes.ClaimApproved] = new("/trade",
            new("A shift is yours", "The shift on {date}, {start}–{end} is yours", "{count} shifts are yours"),
            new("Un quart est à toi", "Le quart du {date}, {start}–{end} est à toi", "{count} quarts sont à toi")),
        [NotificationTypes.ClaimDeclined] = new("/trade",
            new("Your shift request was declined", "Your request for {date}, {start}–{end} was declined", "{count} of your shift requests were declined"),
            new("Ta demande de quart a été refusée", "Ta demande pour le {date}, {start}–{end} a été refusée", "{count} de tes demandes de quart ont été refusées")),
        [NotificationTypes.TradeRequested] = new("/trade",
            new("A coworker wants to trade a shift", "{name} wants to trade their shift on {date}, {start}–{end}", "You have {count} trade requests"),
            new("Un collègue veut échanger un quart", "{name} veut échanger son quart du {date}, {start}–{end}", "Tu as {count} demandes d’échange")),
        [NotificationTypes.TradeApplied] = new("/trade",
            new("Your trade is done", "The trade for {date}, {start}–{end} is done", "{count} trades are done"),
            new("Ton échange est fait", "L’échange du {date}, {start}–{end} est fait", "{count} échanges sont faits")),
        [NotificationTypes.TradeRejected] = new("/trade",
            new("Your trade was not applied", "The trade for {date}, {start}–{end} was not applied", "{count} trades were not applied"),
            new("Ton échange n’a pas été appliqué", "L’échange du {date}, {start}–{end} n’a pas été appliqué", "{count} échanges n’ont pas été appliqués")),
    };

    private static readonly Dictionary<string, (string Greeting, string Open, string Footer)> Layout = new(StringComparer.Ordinal)
    {
        ["en"] = ("Hi {recipient},", "Open Quart to see it:", "You get this email because you work at a shop that uses Quart. Replies are not read."),
        ["fr"] = ("Bonjour {recipient},", "Ouvre Quart pour le voir :", "Tu reçois ce courriel parce que tu travailles dans un commerce qui utilise Quart. Les réponses ne sont pas lues."),
    };

    /// <summary>The notification types that are emailed. The one list; nothing else decides it.</summary>
    public static IReadOnlyCollection<string> Types => Entries.Keys;

    public static bool IsEmailed(string type) => Entries.ContainsKey(type);

    /// <summary>The in-app sentence an email repeats, with <c>{x}</c> placeholders. For the test that keeps it in step.</summary>
    public static string Sentence(string type, string language) => TextOf(Entries[type], language).Sentence;

    /// <summary>The sentence of a bundle, as the app's push shows it (<c>alerts.bundles</c>). For the same test.</summary>
    public static string BundleSentence(string type, string language) => TextOf(Entries[type], language).Bundle;

    internal static bool Knows(string template) => TypeOf(template) is { } type && Entries.ContainsKey(type);

    private static string? TypeOf(string template) =>
        template.StartsWith(BundlePrefix, StringComparison.Ordinal) ? template[BundlePrefix.Length..]
        : template.StartsWith(TemplatePrefix, StringComparison.Ordinal) ? template[TemplatePrefix.Length..]
        : null;

    internal static (string Subject, string Body) Render(string template, string language, IReadOnlyDictionary<string, string> parameters, string publicUrl)
    {
        var entry = Entries[TypeOf(template)!];
        var text = TextOf(entry, language);
        var bundle = template.StartsWith(BundlePrefix, StringComparison.Ordinal);
        var layout = Layout.TryGetValue(language, out var found) ? found : Layout["en"];
        var culture = CultureInfo.GetCultureInfo(language == "fr" ? "fr-CA" : "en-CA");

        // One pass, so a value that happens to contain "{date}" is never filled in again.
        var sentence = Placeholder().Replace(bundle ? text.Bundle : text.Sentence, match =>
        {
            var name = match.Groups[1].Value;
            if (!parameters.TryGetValue(name, out var value))
            {
                return string.Empty;
            }
            return name is "date" or "periodStart" && DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                // FR-262: the reader's date format, "Mon, Nov. 23" or "lun. 23 nov.".
                ? date.ToString(language == "fr" ? "ddd d MMM" : "ddd, MMM d", culture)
                : value;
        });
        var recipient = parameters.TryGetValue(RecipientParameter, out var who) ? who : string.Empty;
        var link = publicUrl.TrimEnd('/') + entry.Path;
        var body = string.Join(
            "\n\n",
            layout.Greeting.Replace("{" + RecipientParameter + "}", recipient, StringComparison.Ordinal),
            sentence + ".",
            layout.Open + "\n" + link,
            layout.Footer);
        return (text.Subject, body);
    }

    private static Text TextOf(Entry entry, string language) => language == "fr" ? entry.French : entry.English;

    [GeneratedRegex(@"\{(\w+)\}")]
    private static partial Regex Placeholder();

    private sealed record Entry(string Path, Text English, Text French);

    /// <param name="Bundle">Several alerts of the kind at once, with <c>{count}</c> (M8-07).</param>
    private sealed record Text(string Subject, string Sentence, string Bundle);
}
