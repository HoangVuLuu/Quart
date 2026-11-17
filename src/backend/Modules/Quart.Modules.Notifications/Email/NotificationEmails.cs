using System.Globalization;
using System.Text.RegularExpressions;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Notifications.Email;

/// <summary>
/// Which notifications also go out by email, and their text (FR-211). Email is for things a person has to
/// act on or know about their own shifts; everything else stays in the app. Until push exists (M8-06) every
/// member gets these; preferences (M8-07) will start from this list.
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

    private static readonly Dictionary<string, Entry> Entries = new(StringComparer.Ordinal)
    {
        [NotificationTypes.SchedulePublished] = new("/schedule",
            new("The new schedule is out", "The schedule starting {periodStart} is published"),
            new("Le nouvel horaire est publié", "L’horaire du {periodStart} est publié")),
        [NotificationTypes.ScheduleChanged] = new("/schedule",
            new("Your schedule changed", "Your schedule changed: {added} added, {removed} removed"),
            new("Ton horaire a changé", "Ton horaire a changé : {added} ajouté, {removed} retiré")),
        [NotificationTypes.AvailabilityRequested] = new("/availability",
            new("Send your availability", "Availability is open for the period starting {periodStart}"),
            new("Envoie tes disponibilités", "Les disponibilités sont ouvertes pour la période du {periodStart}")),
        [NotificationTypes.AvailabilityReminder] = new("/availability",
            new("Reminder: send your availability", "Reminder: send your availability for the period starting {periodStart}"),
            new("Rappel : envoie tes disponibilités", "Rappel : envoie tes disponibilités pour la période du {periodStart}")),
        [NotificationTypes.ClaimApproved] = new("/trade",
            new("A shift is yours", "The shift on {date}, {start}–{end} is yours"),
            new("Un quart est à toi", "Le quart du {date}, {start}–{end} est à toi")),
        [NotificationTypes.ClaimDeclined] = new("/trade",
            new("Your shift request was declined", "Your request for {date}, {start}–{end} was declined"),
            new("Ta demande de quart a été refusée", "Ta demande pour le {date}, {start}–{end} a été refusée")),
        [NotificationTypes.TradeRequested] = new("/trade",
            new("A coworker wants to trade a shift", "{name} wants to trade their shift on {date}, {start}–{end}"),
            new("Un collègue veut échanger un quart", "{name} veut échanger son quart du {date}, {start}–{end}")),
        [NotificationTypes.TradeApplied] = new("/trade",
            new("Your trade is done", "The trade for {date}, {start}–{end} is done"),
            new("Ton échange est fait", "L’échange du {date}, {start}–{end} est fait")),
        [NotificationTypes.TradeRejected] = new("/trade",
            new("Your trade was not applied", "The trade for {date}, {start}–{end} was not applied"),
            new("Ton échange n’a pas été appliqué", "L’échange du {date}, {start}–{end} n’a pas été appliqué")),
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

    internal static bool Knows(string template) =>
        template.StartsWith(TemplatePrefix, StringComparison.Ordinal) && Entries.ContainsKey(template[TemplatePrefix.Length..]);

    internal static (string Subject, string Body) Render(string template, string language, IReadOnlyDictionary<string, string> parameters, string publicUrl)
    {
        var entry = Entries[template[TemplatePrefix.Length..]];
        var text = TextOf(entry, language);
        var layout = Layout.TryGetValue(language, out var found) ? found : Layout["en"];
        var culture = CultureInfo.GetCultureInfo(language == "fr" ? "fr-CA" : "en-CA");

        // One pass, so a value that happens to contain "{date}" is never filled in again.
        var sentence = Placeholder().Replace(text.Sentence, match =>
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

    private sealed record Text(string Subject, string Sentence);
}
