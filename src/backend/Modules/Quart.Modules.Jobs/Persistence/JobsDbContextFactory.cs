using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Npgsql;

namespace Quart.Modules.Jobs.Persistence;

/// <summary>
/// Lets `dotnet ef migrations add` build the context without starting the API or reaching a database.
/// Runtime code never uses this: the host supplies the real data source.
/// </summary>
internal sealed class JobsDbContextFactory : IDesignTimeDbContextFactory<JobsDbContext>
{
    public JobsDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<JobsDbContext>();
        JobsModule.Configure(options, new NpgsqlDataSourceBuilder("Host=design-time").UseNodaTime().Build());
        return new JobsDbContext(options.Options);
    }
}
