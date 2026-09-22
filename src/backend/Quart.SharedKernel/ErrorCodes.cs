namespace Quart.SharedKernel;

/// <summary>
/// Machine-readable error codes returned in the "code" field of every problem-details response.
/// The server never sends user-facing text; the web app translates these codes (AD-023, FR-263).
/// Codes are dotted and stable: add new ones, never rename existing ones.
/// </summary>
public static class ErrorCodes
{
    public const string NotFound = "common.not_found";
    public const string Validation = "common.validation";
    public const string Unauthorized = "common.unauthorized";
    public const string Forbidden = "common.forbidden";
    public const string Conflict = "common.conflict";
    public const string Unexpected = "common.unexpected";

    /// <summary>Maps an HTTP status to the generic code used when an endpoint did not set its own.</summary>
    public static string ForStatus(int? status) => status switch
    {
        400 => Validation,
        401 => Unauthorized,
        403 => Forbidden,
        404 => NotFound,
        409 => Conflict,
        _ => Unexpected,
    };
}
