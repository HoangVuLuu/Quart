using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;
using Quart.Modules.Notifications.Persistence;
using Quart.SharedKernel.Access;

namespace Quart.Modules.Notifications.Delivery;

/// <summary>
/// The Email switch of Profile (mockup 1g, M8-07): one choice per person and workplace, on until they turn it
/// off. Alerts in the app are always on, and push is chosen on each browser (M8-06).
/// </summary>
internal static class NotificationSettingsEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/workplaces/{workplaceId:guid}/notifications/settings");

        group.MapGet("/", async (Guid workplaceId, HttpContext http, NotificationsDbContext db, CancellationToken cancellationToken) =>
            {
                var member = http.Member();
                var email = await db.NotificationSettings.AsNoTracking()
                    .Where(x => x.UserId == member.UserId && x.WorkplaceId == workplaceId)
                    .Select(x => (bool?)x.Email)
                    .SingleOrDefaultAsync(cancellationToken);
                return TypedResults.Ok(new NotificationSettings(email ?? true));
            })
            .AllowAnyMember()
            .WithName("GetNotificationSettings");

        group.MapPut("/", async (Guid workplaceId, NotificationSettings request, HttpContext http, NotificationsDbContext db, IClock clock, CancellationToken cancellationToken) =>
            {
                var member = http.Member();
                var setting = await db.NotificationSettings
                    .SingleOrDefaultAsync(x => x.UserId == member.UserId && x.WorkplaceId == workplaceId, cancellationToken);
                if (setting is null)
                {
                    setting = new NotificationSetting { UserId = member.UserId, WorkplaceId = workplaceId };
                    db.NotificationSettings.Add(setting);
                }
                setting.Email = request.Email;
                setting.UpdatedAt = clock.GetCurrentInstant();
                await db.SaveChangesAsync(cancellationToken);
                return TypedResults.Ok(new NotificationSettings(setting.Email));
            })
            .AllowAnyMember()
            .WithName("UpdateNotificationSettings");
    }
}

/// <param name="Email">Whether this person gets emails from this workplace (FR-211).</param>
public sealed record NotificationSettings(bool Email);
