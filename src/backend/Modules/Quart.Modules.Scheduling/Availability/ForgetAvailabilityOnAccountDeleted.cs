using Microsoft.EntityFrameworkCore;
using Quart.Modules.Scheduling.Persistence;
using Quart.SharedKernel.Directory;

namespace Quart.Modules.Scheduling.Availability;

/// <summary>
/// A deleted account's availability goes, in every period of every workplace it ever belonged to, with its notes
/// to the managers (FR-009). Shifts already worked stay on the schedule history under the bare IDs, which read as
/// "Former employee". Running it twice finds nothing the second time.
/// </summary>
internal sealed class ForgetAvailabilityOnAccountDeleted(SchedulingDb db, IWorkplaceDirectory directory) : IAccountDeletedHandler
{
    public async Task HandleAsync(Guid userId, CancellationToken cancellationToken)
    {
        var membershipIds = (await directory.GetMembershipsOfAsync(userId, cancellationToken)).Select(x => x.MembershipId).ToList();
        if (membershipIds.Count == 0)
        {
            return;
        }
        // Notes and chosen shifts are deleted with their row (cascade).
        await db.Availabilities.Where(x => membershipIds.Contains(x.MembershipId)).ExecuteDeleteAsync(cancellationToken);
    }
}
