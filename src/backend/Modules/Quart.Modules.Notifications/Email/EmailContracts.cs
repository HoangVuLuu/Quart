namespace Quart.Modules.Notifications;

// What the API host and the tests see of email delivery, beside NotificationsModule.

/// <summary>Hands one rendered email to the provider. SMTP in every environment: Mailpit locally (spec 11.2).</summary>
public interface IEmailTransport
{
    /// <summary>Throws when the provider did not take the message; the outbox retries later.</summary>
    Task SendAsync(OutgoingEmail email, CancellationToken cancellationToken);
}

public sealed record OutgoingEmail(string To, string Subject, string TextBody);

/// <summary>Settings under <c>Email</c>. Defaults match docker-compose.yml's Mailpit.</summary>
public sealed class EmailOptions
{
    public const string Section = "Email";

    public string SmtpHost { get; set; } = "localhost";

    public int SmtpPort { get; set; } = 1025;

    public string? SmtpUser { get; set; }

    public string? SmtpPassword { get; set; }

    public bool SmtpUseTls { get; set; }

    public string From { get; set; } = "Quart <no-reply@quart.local>";

    /// <summary>Where the web app lives; emailed links start with it.</summary>
    public string PublicUrl { get; set; } = "http://localhost:5173";
}
