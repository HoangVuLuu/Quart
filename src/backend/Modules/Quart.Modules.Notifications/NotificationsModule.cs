using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NodaTime;
using Npgsql;
using Quart.Modules.Notifications.Delivery;
using Quart.Modules.Notifications.Email;
using Quart.Modules.Notifications.Push;
using Quart.Modules.Notifications.Persistence;
using Quart.SharedKernel;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Notifications;

/// <summary>
/// Entry point of the Notifications module: the only things the API host calls.
/// The in-app inbox (M2-14), the email outbox (M2-03, AD-030), notification emails (FR-211) and web push (M8-06).
/// Other modules notify through <see cref="INotifier"/> and <see cref="IEmailOutbox"/>.
/// </summary>
public static class NotificationsModule
{
    /// <summary>Needs an <see cref="NpgsqlDataSource"/> (with NodaTime enabled) registered by the host.</summary>
    public static IServiceCollection AddNotificationsModule(this IServiceCollection services)
    {
        services.AddDbContext<NotificationsDbContext>((provider, options) =>
            Configure(options, provider.GetRequiredService<NpgsqlDataSource>()));
        services.TryAddSingleton<IClock>(SystemClock.Instance);
        services.AddOptions<EmailOptions>().BindConfiguration(EmailOptions.Section);
        services.TryAddSingleton<IEmailTransport, SmtpEmailTransport>();
        services.AddSingleton<EmailOutbox>();
        services.AddSingleton<IEmailOutbox>(provider => provider.GetRequiredService<EmailOutbox>());
        services.AddScoped<IJobHandler, SendEmailHandler>();
        services.AddScoped<IJobHandler, NotificationRetention>();
        services.AddSingleton(new NightlyJob(NotificationRetention.JobType));
        services.AddScoped<INotifier, Notifier>();
        // Bundling (M8-07, FR-213): pushes and emails go out a few minutes after the alert, grouped by kind.
        services.AddSingleton(BundleWait.FiveMinutes);
        services.AddScoped<IJobHandler, DeliverBundleHandler>();
        services.AddScoped<IAccountDeletedHandler, ForgetNotificationsOnAccountDeleted>();

        // Web push (M8-06, decision 0015). Off until both VAPID keys are set.
        services.AddOptions<PushOptions>().BindConfiguration(PushOptions.Section);
        services.AddHttpClient(WebPushSender.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(15))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.TryAddScoped<IPushSender, WebPushSender>();
        services.AddScoped<IJobHandler, SendPushHandler>();
        services.AddScoped<ISessionsEndedHandler, ForgetPushOnSessionsEnded>();
        return services;
    }

    public static IEndpointRouteBuilder MapNotificationsModule(this IEndpointRouteBuilder endpoints)
    {
        PushEndpoints.Map(endpoints);
        NotificationSettingsEndpoints.Map(endpoints);

        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/notifications");

        // A member only ever sees their own notifications (M2-14).
        // The workplace is named in the route so the API description lists it; the guard has already resolved it.
        group.MapGet("/", async (Guid workplaceId, HttpContext http, NotificationsDbContext db, CancellationToken cancellationToken) =>
            {
                _ = workplaceId;
                var member = http.Member();
                // Give-aways and trade requests live in the Trade tab, which counts them itself (2.5, 2026-11-18);
                // requests waiting for a decision show at the top of Alerts with their buttons (2026-11-21).
                var elsewhere = NotificationTypes.TradeTab.Concat(NotificationTypes.Decisions).ToList();
                var mine = db.Notifications.AsNoTracking().Where(x => x.MembershipId == member.MembershipId && !elsewhere.Contains(x.Type));
                var unread = await mine.CountAsync(x => x.ReadAt == null, cancellationToken);
                var rows = await mine
                    .OrderByDescending(x => x.CreatedAt)
                    .Take(100)
                    .ToListAsync(cancellationToken);
                var items = rows
                    .Select(x => new NotificationItem(
                        x.Id,
                        x.Type,
                        JsonSerializer.Deserialize<Dictionary<string, string>>(x.Parameters) ?? [],
                        x.CreatedAt.ToDateTimeOffset(),
                        x.ReadAt is not null))
                    .ToList();
                return TypedResults.Ok(new NotificationInbox(unread, items));
            })
            .AllowAnyMember()
            .WithName("GetNotifications");

        group.MapPost("/read-all", async (Guid workplaceId, HttpContext http, NotificationsDbContext db, IClock clock, CancellationToken cancellationToken) =>
            {
                _ = workplaceId;
                var member = http.Member();
                var now = clock.GetCurrentInstant();
                await db.Notifications
                    .Where(x => x.MembershipId == member.MembershipId && x.ReadAt == null)
                    .ExecuteUpdateAsync(update => update.SetProperty(x => x.ReadAt, now), cancellationToken);
                return TypedResults.NoContent();
            })
            .AllowAnyMember()
            .WithName("MarkNotificationsRead");

        // Tapping a notification marks it read and goes nowhere (5, 2026-11-18). Only the caller's own.
        group.MapPost("/{notificationId:guid}/read", async Task<Results<NoContent, ProblemHttpResult>> (Guid workplaceId, Guid notificationId, HttpContext http, NotificationsDbContext db, IClock clock, CancellationToken cancellationToken) =>
            {
                _ = workplaceId;
                var member = http.Member();
                var now = clock.GetCurrentInstant();
                var changed = await db.Notifications
                    .Where(x => x.Id == notificationId && x.MembershipId == member.MembershipId)
                    .ExecuteUpdateAsync(update => update.SetProperty(x => x.ReadAt, x => x.ReadAt ?? now), cancellationToken);
                return changed == 0 ? Problems.NotFound() : TypedResults.NoContent();
            })
            .AllowAnyMember()
            .WithName("MarkNotificationRead");

        return endpoints;
    }

    /// <summary>Applies this module's pending migrations.</summary>
    public static async Task MigrateNotificationsModuleAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<NotificationsDbContext>().Database.MigrateAsync(cancellationToken);
    }

    internal static void Configure(DbContextOptionsBuilder options, NpgsqlDataSource dataSource) =>
        options.UseNpgsql(dataSource, npgsql => npgsql
            .UseNodaTime()
            .MigrationsHistoryTable("__ef_migrations", NotificationsDbContext.Schema));
}

/// <param name="Unread">How many of the member's notifications are unread; the tab's badge.</param>
public sealed record NotificationInbox(int Unread, IReadOnlyList<NotificationItem> Items);

/// <param name="Type">A code such as <c>schedule.published</c>; the web app renders the sentence.</param>
public sealed record NotificationItem(Guid Id, string Type, IReadOnlyDictionary<string, string> Parameters, DateTimeOffset CreatedAt, bool Read);

/// <summary>
/// Stores each alert for the Alerts tab, then puts the ones that leave the app in bundles (M8-07, FR-213): pushes
/// and emails go out a few minutes later, one per kind and person for everything that came in meanwhile.
/// </summary>
internal sealed class Notifier(NotificationsDbContext db, IJobScheduler jobs, IClock clock, BundleWait wait) : INotifier
{
    public async Task NotifyAsync(IReadOnlyCollection<NotificationRequest> notifications, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
        var stored = new List<Notification>();
        foreach (var request in notifications)
        {
            // FR-216 in one place: a type carries only the parameter names it declared.
            if (!NotificationTypes.AllowedParameters.TryGetValue(request.Type, out var allowed))
            {
                throw new ArgumentException($"Unknown notification type '{request.Type}'.", nameof(notifications));
            }
            var parameters = request.Parameters ?? new Dictionary<string, string>();
            if (parameters.Keys.FirstOrDefault(name => !allowed.Contains(name)) is { } refused)
            {
                throw new ArgumentException($"Notification type '{request.Type}' may not carry '{refused}'.", nameof(notifications));
            }

            var notification = new Notification
            {
                Id = Guid.NewGuid(),
                WorkplaceId = request.WorkplaceId,
                MembershipId = request.MembershipId,
                UserId = request.UserId,
                Type = request.Type,
                Parameters = JsonSerializer.Serialize(parameters),
                CreatedAt = now,
            };
            db.Notifications.Add(notification);
            stored.Add(notification);
        }

        // A period cancelled before its "availability requested" left the app takes that alert back, and the
        // cancellation stays in the app: the person never heard of the period by push or email (2026-11-23).
        var inAppOnly = await WithdrawAsync(stored, cancellationToken);

        // Saved with the alerts; the deliveries run on a later tick, so the request that caused them never waits
        // on a push service or the mail server.
        var opened = await Bundles.AssignAsync(db, stored.Except(inAppOnly).ToList(), wait.Value, now, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await Bundles.ScheduleAsync(jobs, opened, cancellationToken);
    }

    /// <summary>
    /// For each "period cancelled": the same person's alerts about that period still waiting to leave the app
    /// (requested, reminder), unread, are removed. Returns the cancellations that took one back.
    /// </summary>
    private async Task<List<Notification>> WithdrawAsync(List<Notification> stored, CancellationToken cancellationToken)
    {
        var cancelled = stored.Where(x => x.Type == NotificationTypes.PeriodCancelled).ToList();
        if (cancelled.Count == 0)
        {
            return [];
        }
        var people = cancelled.Select(x => x.UserId).ToList();
        var workplaces = cancelled.Select(x => x.WorkplaceId).Distinct().ToList();
        string[] about = [NotificationTypes.AvailabilityRequested, NotificationTypes.AvailabilityReminder];
        var waiting = await db.Notifications
            .Where(x => people.Contains(x.UserId) && workplaces.Contains(x.WorkplaceId) && about.Contains(x.Type)
                && x.BundleId != null && x.DeliveredAt == null && x.ReadAt == null)
            .ToListAsync(cancellationToken);
        static string? PeriodOf(Notification x) =>
            JsonSerializer.Deserialize<Dictionary<string, string>>(x.Parameters)?.GetValueOrDefault("periodStart");
        var inAppOnly = new List<Notification>();
        foreach (var cancel in cancelled)
        {
            var taken = waiting.Where(x => x.UserId == cancel.UserId && x.WorkplaceId == cancel.WorkplaceId && PeriodOf(x) == PeriodOf(cancel)).ToList();
            if (taken.Count > 0)
            {
                db.Notifications.RemoveRange(taken);
                inAppOnly.Add(cancel);
            }
        }
        return inAppOnly;
    }
}

/// <summary>
/// A deleted account's own alerts go, and so does every email to its address still in the outbox, sent or not
/// (FR-009). The goodbye email is queued after this runs. Alerts to other people that mention the person's name
/// stay until the nightly cleanup removes them after 60 days, like every alert (decision log, 2026-11-20).
/// </summary>
internal sealed class ForgetNotificationsOnAccountDeleted(NotificationsDbContext db, IUserDirectory users) : IAccountDeletedHandler
{
    public async Task HandleAsync(Guid userId, CancellationToken cancellationToken)
    {
        await db.Notifications.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.PushSubscriptions.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.NotificationSettings.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        if ((await users.GetAsync([userId], cancellationToken)).GetValueOrDefault(userId) is { } user)
        {
            var address = user.Email.ToUpperInvariant();
            await db.OutboxMessages.Where(x => x.Recipient.ToUpper() == address).ExecuteDeleteAsync(cancellationToken);
        }
    }
}

/// <summary>
/// Signing out everywhere, or changing or resetting the password or email, forgets every browser that had push on
/// (M8-06): a lost phone stops showing the person's alerts. The browser still in use subscribes again by itself
/// the next time the app opens.
/// </summary>
internal sealed class ForgetPushOnSessionsEnded(NotificationsDbContext db) : ISessionsEndedHandler
{
    public Task HandleAsync(Guid userId, CancellationToken cancellationToken) =>
        db.PushSubscriptions.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
}
