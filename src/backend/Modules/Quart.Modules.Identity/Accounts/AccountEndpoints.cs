using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NodaTime;
using Quart.Modules.Identity.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Identity.Accounts;

/// <summary>
/// Sign up, email verification, sign in and out, password reset and the profile (M2-02 to M2-05, M2-07).
/// Custom endpoints rather than <c>MapIdentityApi</c>, which is designed for bearer tokens (AD-024).
/// </summary>
internal static class AccountEndpoints
{
    public const string RateLimitPolicy = "auth";
    public const int RequestsPerMinute = 20;

    public const string InvalidCredentials = "auth.invalid_credentials";
    public const string EmailNotVerified = "auth.email_not_verified";
    public const string LockedOut = "auth.locked_out";
    public const string LinkInvalid = "auth.link_invalid";
    public const string LinkExpired = "auth.link_expired";
    public const string LinkUsed = "auth.link_used";
    public const string CurrentPasswordWrong = "auth.current_password_wrong";
    public const string EmailSame = "auth.email_same";
    public const string DeleteEmailMismatch = "auth.delete_email_mismatch";
    public const string OwnsWorkplace = "auth.owns_workplace";

    /// <summary>At most one link email per account and purpose in this time, so the form cannot flood a mailbox.</summary>
    private static readonly Duration LinkEmailInterval = Duration.FromMinutes(1);

    private static readonly QuartUser UnknownUser = new() { FullName = string.Empty, DisplayName = string.Empty, Language = "en" };
    private static readonly Lazy<string> UnknownUserHash = new(() =>
        new PasswordHasher<QuartUser>().HashPassword(UnknownUser, Convert.ToHexString(RandomNumberGenerator.GetBytes(16))));

    private static readonly Duration VerifyLifetime = Duration.FromHours(24);
    private static readonly Duration ResetLifetime = Duration.FromMinutes(45);

    public static IServiceCollection AddAccountRateLimit(this IServiceCollection services) =>
        // By address. In-memory is fine because the app runs at most one replica (M2-04).
        // "Auth:RequestsPerMinute" overrides the limit, for tests that create many accounts.
        services.AddRateLimiter(options => options.AddPolicy(RateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = context.RequestServices.GetRequiredService<IConfiguration>().GetValue("Auth:RequestsPerMinute", RequestsPerMinute),
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                })));

    public static void MapAccounts(this IEndpointRouteBuilder endpoints)
    {
        var auth = endpoints.MapGroup("/api/auth").RequireRateLimiting(RateLimitPolicy);

        auth.MapPost("/sign-up", SignUpAsync).WithName("SignUp");
        auth.MapPost("/verify-email", VerifyEmailAsync).WithName("VerifyEmail");
        auth.MapPost("/resend-verification", ResendVerificationAsync).WithName("ResendVerification");
        auth.MapPost("/sign-in", SignInAsync).WithName("SignIn");
        auth.MapPost("/sign-out", (Delegate)SignOutAsync).WithName("SignOut");
        auth.MapPost("/sign-out-everywhere", SignOutEverywhereAsync).RequireUser().WithName("SignOutEverywhere");
        auth.MapPost("/forgot-password", ForgotPasswordAsync).WithName("ForgotPassword");
        auth.MapPost("/reset-password", ResetPasswordAsync).WithName("ResetPassword");
        auth.MapPost("/confirm-password", ConfirmPasswordAsync).RequireUser().WithName("ConfirmPassword");

        endpoints.MapGet("/api/me", GetMeAsync).RequireUser().WithName("GetMe");
        endpoints.MapPatch("/api/me", UpdateMeAsync).RequireUser().WithName("UpdateMe");
        // Both ask for the current password, so they share the sign-in limit and count towards lockout (M2-07).
        endpoints.MapPost("/api/me/password", ChangePasswordAsync).RequireUser().RequireRateLimiting(RateLimitPolicy).WithName("ChangePassword");
        endpoints.MapPost("/api/me/email", ChangeEmailAsync).RequireUser().RequireRateLimiting(RateLimitPolicy).WithName("ChangeEmail");
        endpoints.MapPost("/api/me/delete", DeleteAccountAsync).RequireUser().RequireRecentConfirmation().RequireRateLimiting(RateLimitPolicy).WithName("DeleteAccount");
        // Public on purpose: the link may open in a browser that is not signed in. The single-use token sent to
        // the new address, after the current password was given, is the proof (section 1.6).
        endpoints.MapPost("/api/me/email/confirm", ConfirmEmailChangeAsync).RequireRateLimiting(RateLimitPolicy).WithName("ConfirmEmailChange");
    }

    /// <summary>
    /// Always answers the same way, whether or not the address already has an account (no enumeration):
    /// an existing address gets a "you already have an account" email instead.
    /// </summary>
    private static async Task<Results<Accepted, ProblemHttpResult>> SignUpAsync(
        SignUpRequest request,
        UserManager<QuartUser> users,
        IBreachedPasswordCheck breaches,
        IdentityDb db,
        IEmailOutbox emails,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var fullName = AccountRules.CleanName(request.FullName);
        var email = AccountRules.CleanEmail(request.Email);
        var language = request.Language ?? "fr";
        var errors = new List<FieldError>();
        if (!AccountRules.IsName(fullName))
        {
            errors.Add(new FieldError(AccountRules.NameInvalid, "fullName"));
        }
        if (!AccountRules.IsEmail(email))
        {
            errors.Add(new FieldError(AccountRules.EmailInvalid, "email"));
        }
        if (!AccountRules.Languages.Contains(language))
        {
            errors.Add(new FieldError(AccountRules.LanguageInvalid, "language"));
        }
        if (AccountRules.CheckPassword(request.Password) is { } passwordError)
        {
            errors.Add(passwordError);
        }
        else if (await breaches.IsBreachedAsync(request.Password!, cancellationToken))
        {
            errors.Add(new FieldError(AccountRules.PasswordBreached, "password"));
        }
        if (errors.Count > 0)
        {
            return Problems.Validation(errors);
        }

        if (await users.FindByEmailAsync(email) is { } existing)
        {
            if (existing.EmailConfirmed)
            {
                await emails.EnqueueAsync(new EmailRequest(email, EmailTemplates.AlreadyRegistered, existing.Language, new Dictionary<string, string>()), cancellationToken);
            }
            else
            {
                // The address is not confirmed, so nobody has proved it is theirs. This attempt's password
                // and name travel with this attempt's link and apply only if that link is opened: a
                // stranger who signed up first with someone else's address must not end up owning the
                // account the real owner later confirms.
                await SendLinkAsync(
                    db, emails, clock, existing, AccountLink.VerifyEmail, cancellationToken,
                    pendingPasswordHash: users.PasswordHasher.HashPassword(existing, request.Password!), pendingFullName: fullName);
            }
            return TypedResults.Accepted((string?)null);
        }

        var user = new QuartUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            FullName = fullName,
            DisplayName = AccountRules.DisplayNameOf(fullName),
            Language = language,
            CreatedAt = clock.GetCurrentInstant(),
        };
        var created = await users.CreateAsync(user, request.Password!);
        if (!created.Succeeded)
        {
            return Problems.Validation(new FieldError(ErrorCodes.Validation, "email"));
        }

        await SendLinkAsync(db, emails, clock, user, AccountLink.VerifyEmail, cancellationToken);
        return TypedResults.Accepted((string?)null);
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> VerifyEmailAsync(
        TokenRequest request, IdentityDb db, IClock clock, CancellationToken cancellationToken)
    {
        var (link, problem) = await FindLinkAsync(db, clock, request.Token, AccountLink.VerifyEmail, cancellationToken);
        if (link is null)
        {
            return problem!;
        }

        var user = await db.Users.SingleAsync(x => x.Id == link.UserId, cancellationToken);
        var now = clock.GetCurrentInstant();
        user.EmailConfirmed = true;
        if (link.PendingPasswordHash is not null)
        {
            user.PasswordHash = link.PendingPasswordHash;
            user.SecurityStamp = Guid.NewGuid().ToString();
            if (link.PendingFullName is { } fullName)
            {
                user.FullName = fullName;
                user.DisplayName = AccountRules.DisplayNameOf(fullName);
            }
        }
        link.UsedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        // The other links sent for this account are finished too, with whatever password they carried.
        await RetireLinksAsync(db, user.Id, AccountLink.VerifyEmail, now, cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Accepted> ResendVerificationAsync(
        EmailOnlyRequest request, UserManager<QuartUser> users, IdentityDb db, IEmailOutbox emails, IClock clock, CancellationToken cancellationToken)
    {
        if (await users.FindByEmailAsync(AccountRules.CleanEmail(request.Email)) is { EmailConfirmed: false } user)
        {
            await SendLinkAsync(db, emails, clock, user, AccountLink.VerifyEmail, cancellationToken);
        }
        return TypedResults.Accepted((string?)null);
    }

    private static async Task<Results<Ok<Me>, ProblemHttpResult>> SignInAsync(
        SignInRequest request, HttpContext http, UserManager<QuartUser> users)
    {
        var user = await users.FindByEmailAsync(AccountRules.CleanEmail(request.Email));
        if (user is null)
        {
            // Spend the same time as for a real account, so the answer's speed does not say whether the
            // address has one.
            users.PasswordHasher.VerifyHashedPassword(UnknownUser, UnknownUserHash.Value, request.Password ?? string.Empty);
            return Problems.Unauthorized(InvalidCredentials);
        }
        if (await users.IsLockedOutAsync(user))
        {
            return Problems.Forbidden(LockedOut);
        }
        if (!await users.CheckPasswordAsync(user, request.Password ?? string.Empty))
        {
            await users.AccessFailedAsync(user);
            return await users.IsLockedOutAsync(user) ? Problems.Forbidden(LockedOut) : Problems.Unauthorized(InvalidCredentials);
        }
        if (!user.EmailConfirmed)
        {
            return Problems.Forbidden(EmailNotVerified);
        }

        await users.ResetAccessFailedCountAsync(user);
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())], IdentityConstants.ApplicationScheme);
        await http.SignInAsync(
            IdentityConstants.ApplicationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
        return TypedResults.Ok(ToMe(user));
    }

    private static async Task<NoContent> SignOutAsync(HttpContext http)
    {
        // Deletes this browser's session row through the ticket store, then clears the cookie.
        await http.SignOutAsync(IdentityConstants.ApplicationScheme);
        return TypedResults.NoContent();
    }

    private static async Task<NoContent> SignOutEverywhereAsync(
        HttpContext http, IdentityDb db, IEnumerable<ISessionsEndedHandler> ended, CancellationToken cancellationToken)
    {
        var userId = http.CurrentUserId();
        await db.Sessions.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await TellSessionsEndedAsync(ended, userId, cancellationToken);
        await http.SignOutAsync(IdentityConstants.ApplicationScheme);
        return TypedResults.NoContent();
    }

    /// <summary>Always answers the same way, whether or not the account exists (M2-05).</summary>
    private static async Task<Accepted> ForgotPasswordAsync(
        EmailOnlyRequest request, UserManager<QuartUser> users, IdentityDb db, IEmailOutbox emails, IClock clock, CancellationToken cancellationToken)
    {
        if (await users.FindByEmailAsync(AccountRules.CleanEmail(request.Email)) is { } user)
        {
            await SendLinkAsync(db, emails, clock, user, AccountLink.ResetPassword, cancellationToken);
        }
        return TypedResults.Accepted((string?)null);
    }

    /// <summary>A successful reset ends every session of the account (FR-005) and proves the email address.</summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> ResetPasswordAsync(
        ResetPasswordRequest request,
        HttpContext http,
        UserManager<QuartUser> users,
        IBreachedPasswordCheck breaches,
        IdentityDb db,
        IClock clock,
        CancellationToken cancellationToken)
    {
        if (AccountRules.CheckPassword(request.Password) is { } passwordError)
        {
            return Problems.Validation(passwordError);
        }
        var (link, problem) = await FindLinkAsync(db, clock, request.Token, AccountLink.ResetPassword, cancellationToken);
        if (link is null)
        {
            return problem!;
        }
        if (await breaches.IsBreachedAsync(request.Password!, cancellationToken))
        {
            return Problems.Validation(new FieldError(AccountRules.PasswordBreached, "password"));
        }

        var user = await users.FindByIdAsync(link.UserId.ToString());
        if (user is null)
        {
            return Problems.Validation(new FieldError(LinkInvalid, "token"));
        }
        user.PasswordHash = users.PasswordHasher.HashPassword(user, request.Password!);
        user.EmailConfirmed = true;
        await users.UpdateSecurityStampAsync(user);
        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);

        var now = clock.GetCurrentInstant();
        link.UsedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        // Any other reset link still in a mailbox dies with this one.
        await RetireLinksAsync(db, user.Id, AccountLink.ResetPassword, now, cancellationToken);
        await db.Sessions.Where(x => x.UserId == user.Id).ExecuteDeleteAsync(cancellationToken);
        await TellSessionsEndedAsync(http.RequestServices.GetServices<ISessionsEndedHandler>(), user.Id, cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<Me>, ProblemHttpResult>> GetMeAsync(HttpContext http, IdentityDb db, CancellationToken cancellationToken)
    {
        var userId = http.CurrentUserId();
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId, cancellationToken);
        return user is null ? Problems.Unauthorized() : TypedResults.Ok(ToMe(user));
    }

    private static async Task<Results<Ok<Me>, ProblemHttpResult>> UpdateMeAsync(
        UpdateMeRequest request, HttpContext http, IdentityDb db, CancellationToken cancellationToken)
    {
        var userId = http.CurrentUserId();
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (user is null)
        {
            return Problems.Unauthorized();
        }

        if (request.DisplayName is not null)
        {
            var displayName = AccountRules.CleanName(request.DisplayName);
            if (!AccountRules.IsName(displayName) || displayName.Length > 40)
            {
                return Problems.Validation(new FieldError(AccountRules.NameInvalid, "displayName"));
            }
            user.DisplayName = displayName;
        }
        if (request.Language is not null)
        {
            if (!AccountRules.Languages.Contains(request.Language))
            {
                return Problems.Validation(new FieldError(AccountRules.LanguageInvalid, "language"));
            }
            user.Language = request.Language;
        }
        // FR-040, M2-18: an empty text removes the link.
        if (request.Instagram is not null)
        {
            if (AccountRules.CleanInstagram(request.Instagram) is not { } handle)
            {
                return Problems.Validation(new FieldError(AccountRules.InstagramInvalid, "instagram"));
            }
            user.Instagram = handle.Length == 0 ? null : handle;
        }
        if (request.Facebook is not null)
        {
            if (AccountRules.CleanFacebook(request.Facebook) is not { } handle)
            {
                return Problems.Validation(new FieldError(AccountRules.FacebookInvalid, "facebook"));
            }
            user.Facebook = handle.Length == 0 ? null : handle;
        }
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(ToMe(user));
    }

    /// <summary>
    /// Changes the password while signed in (M2-07): the current password first, then the sign-up rules. The
    /// address on file is told before the change, every other session ends, and this browser stays signed in.
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> ChangePasswordAsync(
        ChangePasswordRequest request,
        HttpContext http,
        UserManager<QuartUser> users,
        IBreachedPasswordCheck breaches,
        IdentityDb db,
        IEmailOutbox emails,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(http.CurrentUserId().ToString());
        if (user is null)
        {
            return Problems.Unauthorized();
        }
        if (await CheckCurrentPasswordAsync(users, user, request.CurrentPassword) is { } refused)
        {
            return refused;
        }
        if (AccountRules.CheckPassword(request.NewPassword, "newPassword") is { } passwordError)
        {
            return Problems.Validation(passwordError);
        }
        if (await breaches.IsBreachedAsync(request.NewPassword!, cancellationToken))
        {
            return Problems.Validation(new FieldError(AccountRules.PasswordBreached, "newPassword"));
        }

        await emails.EnqueueAsync(
            new EmailRequest(user.Email!, EmailTemplates.PasswordChanged, user.Language, new Dictionary<string, string> { ["name"] = user.DisplayName }),
            cancellationToken);
        user.PasswordHash = users.PasswordHasher.HashPassword(user, request.NewPassword!);
        await users.UpdateSecurityStampAsync(user);
        // A reset link still in the mailbox would undo this change: it goes too.
        await RetireLinksAsync(db, user.Id, AccountLink.ResetPassword, clock.GetCurrentInstant(), cancellationToken);
        await EndOtherSessionsAsync(http, db, user, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// First step of an email change (M2-07): sends a link to the new address. The answer is the same whether
    /// or not that address already has an account, and nothing is sent to it then, so addresses cannot be probed.
    /// </summary>
    private static async Task<Results<Accepted, ProblemHttpResult>> ChangeEmailAsync(
        ChangeEmailRequest request,
        HttpContext http,
        UserManager<QuartUser> users,
        IdentityDb db,
        IEmailOutbox emails,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(http.CurrentUserId().ToString());
        if (user is null)
        {
            return Problems.Unauthorized();
        }
        if (await CheckCurrentPasswordAsync(users, user, request.CurrentPassword) is { } refused)
        {
            return refused;
        }
        var email = AccountRules.CleanEmail(request.Email);
        if (!AccountRules.IsEmail(email))
        {
            return Problems.Validation(new FieldError(AccountRules.EmailInvalid, "email"));
        }
        if (string.Equals(email, user.Email, StringComparison.OrdinalIgnoreCase))
        {
            return Problems.Validation(new FieldError(EmailSame, "email"));
        }
        if (await users.FindByEmailAsync(email) is not null)
        {
            return TypedResults.Accepted((string?)null);
        }

        var now = clock.GetCurrentInstant();
        // One link a minute per account, so the form cannot flood a mailbox. Asking again later retires the
        // earlier link, so only the newest address can ever be confirmed.
        var recent = now + VerifyLifetime - LinkEmailInterval;
        if (await db.AccountLinks.AnyAsync(x => x.UserId == user.Id && x.Purpose == AccountLink.ChangeEmail && x.UsedAt == null && x.ExpiresAt > recent, cancellationToken))
        {
            return TypedResults.Accepted((string?)null);
        }
        await RetireLinksAsync(db, user.Id, AccountLink.ChangeEmail, now, cancellationToken);
        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        db.AccountLinks.Add(new AccountLink
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Purpose = AccountLink.ChangeEmail,
            TokenHash = Hash(token),
            ExpiresAt = now + VerifyLifetime,
            PendingEmail = email,
        });
        await db.SaveChangesAsync(cancellationToken);
        await emails.EnqueueAsync(
            new EmailRequest(email, EmailTemplates.ChangeEmail, user.Language, new Dictionary<string, string> { ["token"] = token, ["name"] = user.DisplayName }),
            cancellationToken);
        return TypedResults.Accepted((string?)null);
    }

    /// <summary>
    /// Second step: the link from the new mailbox swaps the address. The old address is told first, and every
    /// session ends except this browser's, if it belongs to the same person.
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> ConfirmEmailChangeAsync(
        TokenRequest request,
        HttpContext http,
        UserManager<QuartUser> users,
        IdentityDb db,
        IEmailOutbox emails,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var (link, problem) = await FindLinkAsync(db, clock, request.Token, AccountLink.ChangeEmail, cancellationToken);
        if (link is null)
        {
            return problem!;
        }
        var user = await users.FindByIdAsync(link.UserId.ToString());
        // Someone may have signed up with the new address since the link was sent.
        if (user is null || link.PendingEmail is not { } email || await users.FindByEmailAsync(email) is not null)
        {
            return Problems.Validation(new FieldError(LinkInvalid, "token"));
        }

        var now = clock.GetCurrentInstant();
        link.UsedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        await emails.EnqueueAsync(
            new EmailRequest(user.Email!, EmailTemplates.EmailChanged, user.Language, new Dictionary<string, string> { ["name"] = user.DisplayName }),
            cancellationToken);

        user.Email = email;
        user.UserName = email;
        user.EmailConfirmed = true;
        await users.UpdateNormalizedEmailAsync(user);
        await users.UpdateNormalizedUserNameAsync(user);
        var updated = await users.UpdateSecurityStampAsync(user);
        if (!updated.Succeeded)
        {
            return Problems.Validation(new FieldError(LinkInvalid, "token"));
        }
        // Links sent to the old address (a reset, an older change) must not work any more.
        await RetireLinksAsync(db, user.Id, AccountLink.ResetPassword, now, cancellationToken);
        await RetireLinksAsync(db, user.Id, AccountLink.ChangeEmail, now, cancellationToken);
        await EndOtherSessionsAsync(http, db, user, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// Deletes the signed-in account for good (FR-009, M2-16). The person confirms by typing their email, as on
    /// mockup 1g-del (decision log, 2026-11-20). An owner is refused: the workplace would be left without one.
    /// Every workplace is left through the same path as leaving one, each module forgets what it keeps about the
    /// person, a goodbye email goes to the address on file, and only then is the account row itself deleted, so
    /// the address can sign up again. Past shifts keep the bare ID, which reads as "Former employee".
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> DeleteAccountAsync(
        DeleteAccountRequest request,
        HttpContext http,
        UserManager<QuartUser> users,
        IdentityDb db,
        IWorkplaceDirectory workplaces,
        IEnumerable<IAccountDeletedHandler> handlers,
        IEmailOutbox emails,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(http.CurrentUserId().ToString());
        if (user is null)
        {
            return Problems.Unauthorized();
        }
        if (!string.Equals(AccountRules.CleanEmail(request.Email), user.Email, StringComparison.OrdinalIgnoreCase))
        {
            return Problems.Validation(new FieldError(DeleteEmailMismatch, "email"));
        }
        // Ownership cannot be handed over in the app (M2-13 dropped, 2026-11-23): the owner asks the platform admin.
        var memberships = await workplaces.GetMembershipsOfAsync(user.Id, cancellationToken);
        if (memberships.Any(x => x.Active && x.Role == Roles.Owner))
        {
            return Problems.Conflict(OwnsWorkplace);
        }

        foreach (var handler in handlers)
        {
            await handler.HandleAsync(user.Id, cancellationToken);
        }
        await emails.EnqueueAsync(
            new EmailRequest(user.Email!, EmailTemplates.AccountDeleted, user.Language, new Dictionary<string, string> { ["name"] = user.DisplayName }),
            cancellationToken);

        await db.Sessions.Where(x => x.UserId == user.Id).ExecuteDeleteAsync(cancellationToken);
        await db.AccountLinks.Where(x => x.UserId == user.Id).ExecuteDeleteAsync(cancellationToken);
        var deleted = await users.DeleteAsync(user);
        if (!deleted.Succeeded)
        {
            throw new InvalidOperationException($"Account {user.Id} could not be deleted.");
        }
        await http.SignOutAsync(IdentityConstants.ApplicationScheme);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// Step-up (AD-044, M2-06): the password, typed again, marks this browser's session as confirmed for the
    /// next ten minutes. A wrong one counts towards the lockout like any other.
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> ConfirmPasswordAsync(
        ConfirmPasswordRequest request,
        HttpContext http,
        UserManager<QuartUser> users,
        IdentityDb db,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(http.CurrentUserId().ToString());
        if (user is null)
        {
            return Problems.Unauthorized();
        }
        if (await CheckCurrentPasswordAsync(users, user, request.Password, "password") is { } refused)
        {
            return refused;
        }
        var id = await RecentConfirmation.CurrentSessionIdAsync(http);
        var now = clock.GetCurrentInstant();
        await db.Sessions.Where(x => x.Id == id && x.UserId == user.Id)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.ConfirmedAt, now), cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>Null when the password is right; otherwise the refusal. A wrong one counts towards the lockout (FR-007).</summary>
    private static async Task<ProblemHttpResult?> CheckCurrentPasswordAsync(
        UserManager<QuartUser> users, QuartUser user, string? password, string field = "currentPassword")
    {
        if (await users.IsLockedOutAsync(user))
        {
            return Problems.Forbidden(LockedOut);
        }
        if (await users.CheckPasswordAsync(user, password ?? string.Empty))
        {
            await users.ResetAccessFailedCountAsync(user);
            return null;
        }
        await users.AccessFailedAsync(user);
        return await users.IsLockedOutAsync(user)
            ? Problems.Forbidden(LockedOut)
            : Problems.Validation(new FieldError(CurrentPasswordWrong, field));
    }

    /// <summary>Ends every session of the account except this browser's, when this browser is that person's.</summary>
    private static async Task EndOtherSessionsAsync(HttpContext http, IdentityDb db, QuartUser user, CancellationToken cancellationToken)
    {
        string? current = null;
        if (http.User.UserId() == user.Id)
        {
            current = await RecentConfirmation.CurrentSessionIdAsync(http);
        }
        // A session from before its row ID was remembered cannot be told apart: it ends too, and the person signs in again.
        await db.Sessions.Where(x => x.UserId == user.Id && x.Id != current).ExecuteDeleteAsync(cancellationToken);
        await TellSessionsEndedAsync(http.RequestServices.GetServices<ISessionsEndedHandler>(), user.Id, cancellationToken);
    }

    private static async Task TellSessionsEndedAsync(IEnumerable<ISessionsEndedHandler> handlers, Guid userId, CancellationToken cancellationToken)
    {
        foreach (var handler in handlers)
        {
            await handler.HandleAsync(userId, cancellationToken);
        }
    }

    private static Me ToMe(QuartUser user) =>
        new(user.Id, user.FullName, user.DisplayName, user.Email!, user.Language, user.IsPlatformAdmin,
            user.Instagram, user.Facebook);

    private static Task<int> RetireLinksAsync(IdentityDb db, Guid userId, string purpose, Instant now, CancellationToken cancellationToken) =>
        db.AccountLinks.Where(x => x.UserId == userId && x.Purpose == purpose && x.UsedAt == null)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.UsedAt, now), cancellationToken);

    private static async Task SendLinkAsync(
        IdentityDb db, IEmailOutbox emails, IClock clock, QuartUser user, string purpose, CancellationToken cancellationToken,
        string? pendingPasswordHash = null, string? pendingFullName = null)
    {
        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var verify = purpose == AccountLink.VerifyEmail;
        var now = clock.GetCurrentInstant();
        var lifetime = verify ? VerifyLifetime : ResetLifetime;
        // A link's age is its lifetime minus what is left of it. One was sent a moment ago: say nothing more.
        var recent = now + lifetime - LinkEmailInterval;
        if (await db.AccountLinks.AnyAsync(x => x.UserId == user.Id && x.Purpose == purpose && x.UsedAt == null && x.ExpiresAt > recent, cancellationToken))
        {
            return;
        }
        db.AccountLinks.Add(new AccountLink
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Purpose = purpose,
            TokenHash = Hash(token),
            ExpiresAt = now + lifetime,
            PendingPasswordHash = pendingPasswordHash,
            PendingFullName = pendingFullName,
        });
        await db.SaveChangesAsync(cancellationToken);
        await emails.EnqueueAsync(
            new EmailRequest(
                user.Email!,
                verify ? EmailTemplates.VerifyEmail : EmailTemplates.ResetPassword,
                user.Language,
                new Dictionary<string, string> { ["token"] = token, ["name"] = user.DisplayName }),
            cancellationToken);
    }

    /// <summary>Finds a usable link, or says exactly why it is not: unknown, already used, or expired.</summary>
    private static async Task<(AccountLink? Link, ProblemHttpResult? Problem)> FindLinkAsync(
        IdentityDb db, IClock clock, string? token, string purpose, CancellationToken cancellationToken)
    {
        var hash = Hash(token ?? string.Empty);
        var link = await db.AccountLinks.SingleOrDefaultAsync(x => x.TokenHash == hash && x.Purpose == purpose, cancellationToken);
        if (link is null)
        {
            return (null, Problems.Validation(new FieldError(LinkInvalid, "token")));
        }
        if (link.UsedAt is not null)
        {
            return (null, Problems.Validation(new FieldError(LinkUsed, "token")));
        }
        if (link.ExpiresAt <= clock.GetCurrentInstant())
        {
            return (null, Problems.Validation(new FieldError(LinkExpired, "token")));
        }
        return (link, null);
    }

    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

public sealed record SignUpRequest(string? FullName, string? Email, string? Password, string? Language);

public sealed record SignInRequest(string? Email, string? Password);

public sealed record EmailOnlyRequest(string? Email);

public sealed record TokenRequest(string? Token);

public sealed record ResetPasswordRequest(string? Token, string? Password);

/// <param name="Instagram">A handle or a profile link; empty removes it; null leaves it.</param>
public sealed record UpdateMeRequest(string? DisplayName, string? Language, string? Instagram = null, string? Facebook = null);

public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

public sealed record ConfirmPasswordRequest(string? Password);

public sealed record ChangeEmailRequest(string? Email, string? CurrentPassword);

/// <param name="Email">Typed by the person to confirm; must be the account's own address.</param>
public sealed record DeleteAccountRequest(string? Email);

/// <summary>The signed-in account. Memberships come from <c>GET /api/workplaces</c>.</summary>
public sealed record Me(
    Guid Id, string FullName, string DisplayName, string Email, string Language, bool IsPlatformAdmin,
    string? Instagram, string? Facebook);
