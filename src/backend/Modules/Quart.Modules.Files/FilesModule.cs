using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Quart.Modules.Files;

/// <summary>
/// Entry point of the Files module: the only two things the API host calls.
/// Private storage, validation by content, image re-encoding, short-lived download links, file access audit. Built in M8.
/// </summary>
public static class FilesModule
{
    public static IServiceCollection AddFilesModule(this IServiceCollection services)
    {
        return services;
    }

    public static IEndpointRouteBuilder MapFilesModule(this IEndpointRouteBuilder endpoints)
    {
        return endpoints;
    }
}
