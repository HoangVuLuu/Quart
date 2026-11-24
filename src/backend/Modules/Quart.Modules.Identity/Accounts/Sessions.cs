using System.Security.Cryptography;
using System.Xml.Linq;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NodaTime;
using Quart.Modules.Identity.Persistence;
using Quart.SharedKernel.Access;

namespace Quart.Modules.Identity.Accounts;

/// <summary>
/// Server-side sessions (AD-045): the cookie carries a random key, the ticket lives in
/// <c>identity.session</c>. Signing out, a password reset or "sign out of all devices" deletes rows, which
/// ends those sessions on their next request.
/// </summary>
internal sealed class SessionTicketStore(IServiceScopeFactory scopes, IClock clock) : ITicketStore
{
    private static readonly Duration Lifetime = Duration.FromDays(30);

    /// <summary>
    /// The stored ticket remembers its own row's ID, so a request can end every other session of the person
    /// and keep its own (a password or email change, M2-07). The ID is the hash, never the cookie's key.
    /// </summary>
    public const string SessionItem = "quart.session";

    // The cookie carries the key; the table keeps only its hash. Someone who reads the database (a leaked
    // backup, a too-broad query) cannot turn a row into a signed-in browser.
    private static string Hash(string key) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(key)));

    public async Task<string> StoreAsync(AuthenticationTicket ticket)
    {
        var id = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var now = clock.GetCurrentInstant();
        ticket.Properties.Items[SessionItem] = Hash(id);
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
        db.Sessions.Add(new Session
        {
            Id = Hash(id),
            UserId = ticket.Principal.UserId() ?? throw new InvalidOperationException("A session needs a user."),
            Ticket = TicketSerializer.Default.Serialize(ticket),
            CreatedAt = now,
            ExpiresAt = now + Lifetime,
            // A new session only comes from typing the password, so it starts confirmed (AD-044).
            ConfirmedAt = now,
        });
        await db.SaveChangesAsync();
        return id;
    }

    public async Task RenewAsync(string key, AuthenticationTicket ticket)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
        var bytes = TicketSerializer.Default.Serialize(ticket);
        var expires = clock.GetCurrentInstant() + Lifetime;
        var id = Hash(key);
        await db.Sessions.Where(x => x.Id == id)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.Ticket, bytes).SetProperty(x => x.ExpiresAt, expires));
    }

    public async Task<AuthenticationTicket?> RetrieveAsync(string key)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
        var now = clock.GetCurrentInstant();
        var id = Hash(key);
        var session = await db.Sessions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.ExpiresAt > now);
        return session is null ? null : TicketSerializer.Default.Deserialize(session.Ticket);
    }

    public async Task RemoveAsync(string key)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
        var id = Hash(key);
        await db.Sessions.Where(x => x.Id == id).ExecuteDeleteAsync();
    }
}

/// <summary>
/// Step-up (AD-044, M2-06): reads this browser's session row. The row's ID is in the ticket, never the
/// cookie's key, so the check needs no secret.
/// </summary>
internal sealed class RecentConfirmation(IdentityDb db, IClock clock) : IRecentConfirmation
{
    public async Task<bool> IsRecentAsync(HttpContext http, CancellationToken cancellationToken)
    {
        if (await CurrentSessionIdAsync(http) is not { } id)
        {
            return false;
        }
        var since = clock.GetCurrentInstant() - Duration.FromTimeSpan(StepUp.Window);
        return await db.Sessions.AnyAsync(x => x.Id == id && x.ConfirmedAt != null && x.ConfirmedAt >= since, cancellationToken);
    }

    /// <summary>The row ID of this browser's session, or null when it has none (or predates remembering it).</summary>
    public static async Task<string?> CurrentSessionIdAsync(HttpContext http)
    {
        var result = await http.AuthenticateAsync(IdentityConstants.ApplicationScheme);
        return result.Properties?.Items.TryGetValue(SessionTicketStore.SessionItem, out var id) == true ? id : null;
    }
}

/// <summary>
/// Data Protection keys in Postgres (AD-045). When the database cannot be reached the app still starts:
/// it falls back to a key that lives only in memory, and says so in the log.
/// </summary>
internal sealed class DatabaseKeyRepository(IServiceScopeFactory scopes, ILogger<DatabaseKeyRepository> logger) : IXmlRepository
{
    public IReadOnlyCollection<XElement> GetAllElements()
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
            return db.DataProtectionKeys.AsNoTracking().Select(x => x.Xml).ToList().Select(XElement.Parse).ToList();
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Could not read Data Protection keys from the database");
            return [];
        }
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
            db.DataProtectionKeys.Add(new DataProtectionKey { FriendlyName = friendlyName, Xml = element.ToString(SaveOptions.DisableFormatting) });
            db.SaveChanges();
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Could not save a Data Protection key; sessions will not survive a restart");
        }
    }
}
