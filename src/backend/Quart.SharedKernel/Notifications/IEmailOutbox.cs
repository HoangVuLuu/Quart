namespace Quart.SharedKernel.Notifications;

/// <summary>
/// Queues an email for delivery (AD-030). Implemented by the Notifications module: the message is stored,
/// tried at once, and retried by the tick if the provider is down, so no email is ever lost.
/// </summary>
public interface IEmailOutbox
{
    Task EnqueueAsync(EmailRequest email, CancellationToken cancellationToken);
}

/// <param name="Template">One of <see cref="EmailTemplates"/>. Text is rendered in <paramref name="Language"/> (FR-261).</param>
/// <param name="Parameters">Template values, such as the link. Never sensitive content (FR-216).</param>
public sealed record EmailRequest(string To, string Template, string Language, IReadOnlyDictionary<string, string> Parameters);

public static class EmailTemplates
{
    public const string VerifyEmail = "verify_email";
    public const string AlreadyRegistered = "already_registered";
    public const string ResetPassword = "reset_password";
    public const string PasswordChanged = "password_changed";
    public const string ChangeEmail = "change_email";
    public const string EmailChanged = "email_changed";

    /// <summary>The last email to an account that was just deleted (FR-009). Once sent, its outbox row is deleted too.</summary>
    public const string AccountDeleted = "account_deleted";
}
