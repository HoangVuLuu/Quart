using System.Reflection;
using System.Xml.Linq;

namespace Quart.ArchitectureTests;

/// <summary>
/// Module boundaries (AD-015, AD-020). These rules fail the build instead of relying on good intentions.
/// Two kinds of check on purpose: compiled references show what a module actually uses, and the project
/// files show what it declares. The compiler drops a reference nothing uses yet, so only the second
/// catches a boundary violation before the first line of code relies on it.
/// </summary>
public sealed class ModuleBoundaryTests
{
    private static readonly Assembly[] Modules =
    [
        typeof(Modules.Identity.IdentityModule).Assembly,
        typeof(Modules.Workplaces.WorkplacesModule).Assembly,
        typeof(Modules.Scheduling.SchedulingModule).Assembly,
        typeof(Modules.Marketplace.MarketplaceModule).Assembly,
        typeof(Modules.Announcements.AnnouncementsModule).Assembly,
        typeof(Modules.Files.FilesModule).Assembly,
        typeof(Modules.Notifications.NotificationsModule).Assembly,
        typeof(Modules.Jobs.JobsModule).Assembly,
    ];

    [Fact]
    public void Modules_use_only_the_shared_kernel_and_the_generator()
    {
        var allowed = new HashSet<string>(StringComparer.Ordinal) { "Quart.SharedKernel", "Quart.Generator" };

        var violations = Modules
            .SelectMany(module => QuartReferences(module)
                .Where(name => !allowed.Contains(name))
                .Select(name => $"{module.GetName().Name} uses {name}"))
            .ToList();

        Assert.Empty(violations);
    }

    [Fact]
    public void Only_the_scheduling_module_uses_the_generator()
    {
        var violations = Modules
            .Where(module => module.GetName().Name != "Quart.Modules.Scheduling")
            .Where(module => QuartReferences(module).Contains("Quart.Generator"))
            .Select(module => module.GetName().Name)
            .ToList();

        Assert.Empty(violations);
    }

    [Fact]
    public void Module_project_files_never_reference_another_module()
    {
        var modulesFolder = Path.Combine(RepositoryRoot(), "src", "backend", "Modules");

        var violations = Directory.GetFiles(modulesFolder, "*.csproj", SearchOption.AllDirectories)
            .SelectMany(project => ProjectReferences(project)
                .Where(reference => reference.StartsWith("Quart.Modules.", StringComparison.Ordinal))
                .Select(reference => $"{Path.GetFileNameWithoutExtension(project)} references {reference}"))
            .ToList();

        Assert.Empty(violations);
    }

    [Fact]
    public void The_generator_depends_on_nothing_but_the_base_library()
    {
        var compiled = typeof(Generator.SeededRandom).Assembly.GetReferencedAssemblies().Select(reference => reference.Name!);
        Assert.All(compiled, name => Assert.StartsWith("System.", name));

        var project = XDocument.Load(Path.Combine(RepositoryRoot(), "src", "backend", "Quart.Generator", "Quart.Generator.csproj"));
        Assert.Empty(project.Descendants("ProjectReference"));
        Assert.Empty(project.Descendants("PackageReference"));
        Assert.Empty(project.Descendants("FrameworkReference"));
    }

    private static IEnumerable<string> QuartReferences(Assembly assembly) =>
        assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name!)
            .Where(name => name.StartsWith("Quart.", StringComparison.Ordinal));

    private static IEnumerable<string> ProjectReferences(string projectPath) =>
        XDocument.Load(projectPath)
            .Descendants("ProjectReference")
            .Select(element => (string?)element.Attribute("Include") ?? string.Empty)
            .Select(include => Path.GetFileNameWithoutExtension(include.Replace('\\', Path.DirectorySeparatorChar)));

    private static string RepositoryRoot()
    {
        var folder = new DirectoryInfo(AppContext.BaseDirectory);
        while (folder is not null && !File.Exists(Path.Combine(folder.FullName, "Quart.slnx")))
        {
            folder = folder.Parent;
        }

        return folder?.FullName ?? throw new InvalidOperationException("Could not find Quart.slnx above the test output folder.");
    }
}
