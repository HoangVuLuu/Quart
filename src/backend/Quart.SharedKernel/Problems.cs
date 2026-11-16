using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Quart.SharedKernel;

/// <summary>
/// Error responses as problem details carrying a machine-readable code (AD-023). The server never sends
/// a sentence; the web app translates the code (FR-263).
/// </summary>
public static class Problems
{
    public static ProblemHttpResult Of(int status, string code) =>
        TypedResults.Problem(statusCode: status, extensions: new Dictionary<string, object?> { ["code"] = code });

    public static ProblemHttpResult NotFound() => Of(StatusCodes.Status404NotFound, ErrorCodes.NotFound);

    public static ProblemHttpResult Forbidden(string code = ErrorCodes.Forbidden) => Of(StatusCodes.Status403Forbidden, code);

    public static ProblemHttpResult Conflict(string code) => Of(StatusCodes.Status409Conflict, code);

    public static ProblemHttpResult Unauthorized(string code = ErrorCodes.Unauthorized) => Of(StatusCodes.Status401Unauthorized, code);

    /// <summary>A 400 listing each thing wrong with the request and where it is.</summary>
    public static ProblemHttpResult Validation(params FieldError[] errors) =>
        TypedResults.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            extensions: new Dictionary<string, object?> { ["code"] = ErrorCodes.Validation, ["errors"] = errors });

    public static ProblemHttpResult Validation(IEnumerable<FieldError> errors) => Validation(errors.ToArray());
}

/// <param name="Code">Stable and machine-readable, such as <c>auth.password_too_short</c>.</param>
/// <param name="Path">The field of the request it is about, such as <c>password</c>.</param>
public sealed record FieldError(string Code, string Path);
