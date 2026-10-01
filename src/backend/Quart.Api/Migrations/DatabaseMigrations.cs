using Quart.Modules.Jobs;

namespace Quart.Api.Migrations;

/// <summary>
/// Applies every module's pending migrations, in a fixed order (decision 0011, spec 11.3).
/// Deployed environments run it as a separate step before the new version takes traffic:
/// <c>dotnet Quart.Api.dll migrate</c>, which the Container Apps job <c>quart-staging-migrate</c> runs.
/// Development also runs it on startup. See docs/runbooks/migrations.md.
/// </summary>
public static class DatabaseMigrations
{
    /// <summary>The command-line argument that runs migrations and exits instead of starting the web server.</summary>
    public const string Command = "migrate";

    /// <summary>Log category for migration progress; kept at Information in every environment.</summary>
    public const string LogCategory = "Quart.Api.Migrations";

    // A module adds itself here with its first migration. Order matters only if one module's migration
    // ever depends on another's; AD-015 forbids cross-schema foreign keys, so keep it alphabetical.
    private static readonly (string Module, Func<IServiceProvider, CancellationToken, Task> Migrate)[] Modules =
    [
        ("jobs", (services, cancellationToken) => services.MigrateJobsModuleAsync(cancellationToken)),
    ];

    /// <summary>
    /// Applies every module's pending migrations; a module that is up to date is left untouched.
    /// EF Core holds a database lock while migrating, so two runs at once cannot both apply a migration.
    /// </summary>
    public static async Task MigrateAllModulesAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger(LogCategory);
        foreach (var (module, migrate) in Modules)
        {
            logger.LogInformation("Migrating module {Module}", module);
            await migrate(services, cancellationToken);
        }
        logger.LogInformation("All {ModuleCount} module(s) are up to date", Modules.Length);
    }

    /// <summary>Runs <see cref="Command"/>. Returns the process exit code: 0 on success, 1 on any failure.</summary>
    public static async Task<int> RunCommandAsync(IServiceProvider services)
    {
        try
        {
            await services.MigrateAllModulesAsync();
            return 0;
        }
        catch (Exception exception)
        {
            services.GetRequiredService<ILoggerFactory>().CreateLogger(LogCategory)
                .LogError(exception, "Migration failed. Nothing after the failing module was applied");
            return 1;
        }
    }
}
