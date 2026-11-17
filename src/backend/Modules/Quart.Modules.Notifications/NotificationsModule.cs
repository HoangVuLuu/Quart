using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NodaTime;
using Npgsql;
using Quart.Modules.Notifications.Email;
using Quart.Modules.Notifications.Persistence;
using Quart.SharedKernel.Access;
using Quart.SharedKernel.Directory;
using Quart.SharedKernel.Jobs;
using Quart.SharedKernel.Notifications;

namespace Quart.Modules.Notifications;

/// <summary>
/// Entry point of the Notifications module: the only things the API host calls.
/// The in-app inbox (M2-14), the email outbox (M2-03, AD-030) and notification emails (FR-211). Push arrives in M8.
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
        services.AddScoped<INotifier, Notifier>();
        return services;
    }

    public static IEndpointRouteBuilder MapNotificationsModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/notifications");

        // A member only ever sees their own notifications (M2-14).
        // The workplace is named in the route so the API description lists it; the guard has already resolved it.
        group.MapGet("/", async (Guid workplaceId, HttpContext http, NotificationsDbContext db, CancellationToken cancellationToken) =>
            {
                _ = workplaceId;
                var member = http.Member();
                var rows = await db.Notifications.AsNoTracking()
                    .Where(x => x.MembershipId == member.MembershipId)
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
                return TypedResults.Ok(new NotificationInbox(items.Count(item => !item.Read), items));
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
/// Stores in-app notifications and, for the types in <see cref="NotificationEmails"/>, an email to the
/// recipient in their language (FR-211, FR-261). Both are written in one transaction. The emails are sent by
/// a job on the next tick rather than during the request, so publishing to the whole team never waits on the
/// email provider; the job retries with a growing delay and gives up after a day (background-jobs.md).
/// </summary>
internal sealed class Notifier(NotificationsDbContext db, IUserDirectory users, IJobScheduler jobs, IClock clock) : INotifier
{
    public async Task NotifyAsync(IReadOnlyCollection<NotificationRequest> notifications, CancellationToken cancellationToken)
    {
        var now = clock.GetCurrentInstant();
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

            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(),
                WorkplaceId = request.WorkplaceId,
                MembershipId = request.MembershipId,
                UserId = request.UserId,
                Type = request.Type,
                Parameters = JsonSerializer.Serialize(parameters),
                CreatedAt = now,
            });
        }

        var emails = await EmailsForAsync(notifications, now, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        foreach (var email in emails)
        {
            await jobs.ScheduleAsync(
                new JobRequest(SendEmailHandler.JobType, now)
                {
                    Payload = new SendEmailPayload(email.Id),
                    DedupeKey = $"email:{email.Id}",
                },
                cancellationToken);
        }
    }

    private async Task<List<OutboxMessage>> EmailsForAsync(IReadOnlyCollection<NotificationRequest> notifications, Instant now, CancellationToken cancellationToken)
    {
        var emailed = notifications.Where(x => NotificationEmails.IsEmailed(x.Type)).ToList();
        if (emailed.Count == 0)
        {
            return [];
        }
        var recipients = await users.GetAsync(emailed.Select(x => x.UserId).Distinct().ToList(), cancellationToken);
        var messages = new List<OutboxMessage>();
        foreach (var request in emailed)
        {
            // A deleted account is missing; an unconfirmed address gets nothing but its verification email.
            if (!recipients.TryGetValue(request.UserId, out var recipient) || !recipient.EmailConfirmed)
            {
                continue;
            }
            var parameters = new Dictionary<string, string>(request.Parameters ?? new Dictionary<string, string>())
            {
                [NotificationEmails.RecipientParameter] = recipient.DisplayName,
            };
            var message = new OutboxMessage
            {
                Id = Guid.NewGuid(),
                Recipient = recipient.Email,
                Template = NotificationEmails.TemplatePrefix + request.Type,
                Language = recipient.Language,
                Parameters = JsonSerializer.Serialize(parameters),
                CreatedAt = now,
            };
            db.OutboxMessages.Add(message);
            messages.Add(message);
        }
        return messages;
    }
}
