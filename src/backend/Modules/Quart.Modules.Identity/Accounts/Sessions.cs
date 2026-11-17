using System.Security.Cryptography;
using System.Xml.Linq;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection.Repositories;
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

    public async Task<string> StoreAsync(AuthenticationTicket ticket)
    {
        var id = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var now = clock.GetCurrentInstant();
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
        db.Sessions.Add(new Session
        {
            Id = id,
            UserId = ticket.Principal.UserId() ?? throw new InvalidOperationException("A session needs a user."),
            Ticket = TicketSerializer.Default.Serialize(ticket),
            CreatedAt = now,
            ExpiresAt = now + Lifetime,
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
        await db.Sessions.Where(x => x.Id == key)
            .ExecuteUpdateAsync(update => update.SetProperty(x => x.Ticket, bytes).SetProperty(x => x.ExpiresAt, expires));
    }

    public async Task<AuthenticationTicket?> RetrieveAsync(string key)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
        var now = clock.GetCurrentInstant();
        var session = await db.Sessions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == key && x.ExpiresAt > now);
        return session is null ? null : TicketSerializer.Default.Deserialize(session.Ticket);
    }

    public async Task RemoveAsync(string key)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDb>();
        await db.Sessions.Where(x => x.Id == key).ExecuteDeleteAsync();
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
