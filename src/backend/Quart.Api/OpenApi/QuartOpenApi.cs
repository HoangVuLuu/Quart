using System.Reflection;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Quart.Api.OpenApi;

/// <summary>
/// The OpenAPI description of the API (AD-021). The web app's TypeScript client is generated from it
/// (AD-022), so a renamed field breaks the frontend build instead of production.
/// </summary>
public static class QuartOpenApi
{
    private const string ProblemSchemaName = "ApiProblem";

    /// <summary>True while the build is running the app only to write the OpenAPI document.</summary>
    public static bool IsGeneratingDocument { get; } =
        Assembly.GetEntryAssembly()?.GetName().Name == "GetDocument.Insider";

    public static IServiceCollection AddQuartOpenApi(this IServiceCollection services) =>
        services.AddOpenApi(options => options.AddDocumentTransformer(async (document, context, cancellationToken) =>
        {
            // Every endpoint can fail, and every failure has the same shape (AD-023): document it once
            // and point every operation's error responses at it.
            document.Info.Title = "Quart";

            var schema = await context.GetOrCreateSchemaAsync(typeof(ApiProblem), cancellationToken: cancellationToken);
            document.AddComponent(ProblemSchemaName, schema);
            var reference = new OpenApiSchemaReference(ProblemSchemaName, document);

            foreach (var operation in document.Paths.Values.SelectMany(path => path.Operations ?? [])
                .Select(pair => pair.Value))
            {
                operation.Responses ??= [];
                operation.Responses.TryAdd("default", new OpenApiResponse
                {
                    Description = "Any error, as problem details with a machine-readable code (AD-023).",
                    Content = new Dictionary<string, OpenApiMediaType>
                    {
                        ["application/problem+json"] = new() { Schema = reference },
                    },
                });
            }
        }));
}

/// <summary>
/// The body of every error response. The web app shows <see cref="Code"/> translated, never
/// <see cref="Title"/> or <see cref="Detail"/>, and shows <see cref="TraceId"/> so the log line can be found.
/// Documentation only: responses are written by ASP.NET Core's problem-details service (see Program.cs).
/// </summary>
public sealed class ApiProblem
{
    /// <summary>Machine-readable and stable, from <c>Quart.SharedKernel.ErrorCodes</c>.</summary>
    public required string Code { get; init; }

    /// <summary>The trace ID on the server's log line for this request.</summary>
    public required string TraceId { get; init; }

    public required int Status { get; init; }

    public string? Type { get; init; }

    public string? Title { get; init; }

    public string? Detail { get; init; }

    public string? Instance { get; init; }

    /// <summary>On a validation problem: each thing wrong with the request and where it is.</summary>
    public IReadOnlyList<ApiProblemError>? Errors { get; init; }
}

/// <param name="Code">Machine-readable and stable, for example <c>generator.unknown_member</c>.</param>
/// <param name="Path">Where in the request body, for example <c>lockedAssignments[0].memberId</c>.</param>
public sealed record ApiProblemError(string Code, string Path);
