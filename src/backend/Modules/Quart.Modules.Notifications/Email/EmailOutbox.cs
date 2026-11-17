using System.Net;
using System.Net.Mail;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NodaTime;
using Quart.Modules.Notifications.Persistence;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Notifications.Email;

/// <summary>
/// The email outbox (AD-030). A message is stored first, then tried at once so account emails arrive in
/// seconds; if the provider is down, a background job retries it with a growing delay.
/// </summary>
internal sealed class EmailOutbox(
    IServiceScopeFactory scopes,
    IJobScheduler jobs,
    IClock clock,
    ILogger<EmailOutbox> logger) : IEmailOutbox
{
    public async Task EnqueueAsync(EmailRequest email, CancellationToken cancellationToken)
    {
        if (!EmailRenderer.Knows(email.Template))
        {
            throw new ArgumentException($"Unknown email template '{email.Template}'.", nameof(email));
        }

        var message = new OutboxMessage
        {
            Id = Guid.NewGuid(),
            Recipient = email.To,
            Template = email.Template,
            Language = email.Language,
            Parameters = JsonSerializer.Serialize(email.Parameters),
            CreatedAt = clock.GetCurrentInstant(),
        };
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
            db.OutboxMessages.Add(message);
            await db.SaveChangesAsync(cancellationToken);
        }

        try
        {
            await SendAsync(message.Id, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // The address stays out of the log (decision 0012); the ID is enough to find the row.
            logger.LogWarning(exception, "Email {MessageId} was not sent; a background job will retry", message.Id);
            await jobs.ScheduleAsync(
                new JobRequest(SendEmailHandler.JobType, clock.GetCurrentInstant() + Duration.FromMinutes(1))
                {
                    Payload = new SendEmailPayload(message.Id),
                    DedupeKey = $"email:{message.Id}",
                },
                cancellationToken);
        }
    }

    /// <summary>Sends one stored message unless it was already sent. Throws when the provider refuses.</summary>
    public async Task SendAsync(Guid messageId, CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<NotificationsDbContext>();
        var message = await db.OutboxMessages.SingleOrDefaultAsync(x => x.Id == messageId, cancellationToken);
        if (message is null || message.SentAt is not null)
        {
            return;
        }

        message.Attempts++;
        await db.SaveChangesAsync(cancellationToken);

        var options = scope.ServiceProvider.GetRequiredService<IOptions<EmailOptions>>().Value;
        var parameters = JsonSerializer.Deserialize<Dictionary<string, string>>(message.Parameters) ?? [];
        var rendered = EmailRenderer.Render(message.Template, message.Language, parameters, options.PublicUrl);
        await scope.ServiceProvider.GetRequiredService<IEmailTransport>()
            .SendAsync(new OutgoingEmail(message.Recipient, rendered.Subject, rendered.Body), cancellationToken);

        message.SentAt = clock.GetCurrentInstant();
        // The parameters can hold a one-time link. Once the email has left, nothing here needs them, and a
        // copy of this table must not be a list of working reset links.
        message.Parameters = "{}";
        await db.SaveChangesAsync(cancellationToken);
    }
}

internal sealed record SendEmailPayload(Guid MessageId);

/// <summary>The retry path: runs on the tick for messages the first attempt could not deliver.</summary>
internal sealed class SendEmailHandler(EmailOutbox outbox) : IJobHandler
{
    public const string JobType = "notifications.send_email";

    public string Type => JobType;

    public async Task<JobOutcome> RunAsync(JobContext job, CancellationToken cancellationToken)
    {
        await outbox.SendAsync(job.ReadPayload<SendEmailPayload>().MessageId, cancellationToken);
        return JobOutcome.Done;
    }
}

/// <summary>Plain SMTP: Mailpit locally, the provider chosen in M2-01 elsewhere, through one code path.</summary>
internal sealed class SmtpEmailTransport(IOptions<EmailOptions> options) : IEmailTransport
{
    public async Task SendAsync(OutgoingEmail email, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        using var client = new SmtpClient(settings.SmtpHost, settings.SmtpPort)
        {
            EnableSsl = settings.SmtpUseTls,
            Timeout = 10_000,
        };
        if (!string.IsNullOrEmpty(settings.SmtpUser))
        {
            client.Credentials = new NetworkCredential(settings.SmtpUser, settings.SmtpPassword);
        }

        using var message = new MailMessage(settings.From, email.To, email.Subject, email.TextBody);
        await client.SendMailAsync(message, cancellationToken);
    }
}

/// <summary>
/// Email text, in French and English (FR-261). Emails are the one place the server writes sentences,
/// because no browser is there to translate a code. They carry a link, never sensitive content (FR-216).
/// </summary>
internal static class EmailRenderer
{
    private static readonly Dictionary<string, (string Path, Dictionary<string, (string Subject, string Body)> Text)> Templates = new()
    {
        [EmailTemplates.VerifyEmail] = ("/verify-email?token=", new()
        {
            ["en"] = ("Confirm your email for Quart", "Hi {name},\n\nOpen this link to confirm your email address. It works once and expires in 24 hours.\n\n{link}\n\nIf you did not create a Quart account, you can ignore this email."),
            ["fr"] = ("Confirme ton courriel pour Quart", "Bonjour {name},\n\nOuvre ce lien pour confirmer ton adresse courriel. Il fonctionne une seule fois et expire dans 24 heures.\n\n{link}\n\nSi tu n'as pas créé de compte Quart, tu peux ignorer ce courriel."),
        }),
        [EmailTemplates.AlreadyRegistered] = ("/login", new()
        {
            ["en"] = ("You already have a Quart account", "Hi,\n\nSomeone tried to create a Quart account with this email address, but you already have one. You can log in here:\n\n{link}\n\nIf you forgot your password, use \"Forgot password?\" on that page."),
            ["fr"] = ("Tu as déjà un compte Quart", "Bonjour,\n\nQuelqu'un a essayé de créer un compte Quart avec cette adresse courriel, mais tu en as déjà un. Tu peux te connecter ici :\n\n{link}\n\nSi tu as oublié ton mot de passe, utilise « Mot de passe oublié ? » sur cette page."),
        }),
        [EmailTemplates.ResetPassword] = ("/reset-password?token=", new()
        {
            ["en"] = ("Reset your Quart password", "Hi {name},\n\nOpen this link to choose a new password. It works once and expires in 45 minutes.\n\n{link}\n\nIf you did not ask for this, you can ignore this email: your password stays the same."),
            ["fr"] = ("Réinitialise ton mot de passe Quart", "Bonjour {name},\n\nOuvre ce lien pour choisir un nouveau mot de passe. Il fonctionne une seule fois et expire dans 45 minutes.\n\n{link}\n\nSi tu n'as rien demandé, tu peux ignorer ce courriel : ton mot de passe reste le même."),
        }),
    };

    public static bool Knows(string template) => Templates.ContainsKey(template) || NotificationEmails.Knows(template);

    public static (string Subject, string Body) Render(string template, string language, IReadOnlyDictionary<string, string> parameters, string publicUrl)
    {
        if (NotificationEmails.Knows(template))
        {
            return NotificationEmails.Render(template, language, parameters, publicUrl);
        }
        var (path, text) = Templates[template];
        var (subject, body) = text.TryGetValue(language, out var found) ? found : text["en"];
        var token = parameters.TryGetValue("token", out var value) ? Uri.EscapeDataString(value) : string.Empty;
        var link = publicUrl.TrimEnd('/') + path + token;
        var name = parameters.TryGetValue("name", out var given) ? given : string.Empty;
        return (subject, body.Replace("{link}", link, StringComparison.Ordinal).Replace("{name}", name, StringComparison.Ordinal));
    }
}
