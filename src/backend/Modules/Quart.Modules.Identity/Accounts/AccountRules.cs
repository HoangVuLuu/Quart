using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Quart.SharedKernel;

namespace Quart.Modules.Identity.Accounts;

/// <summary>The rules every account form shares (FR-001, FR-002, FR-003).</summary>
internal static partial class AccountRules
{
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 200;

    public const string NameInvalid = "auth.name_invalid";
    public const string EmailInvalid = "auth.email_invalid";
    public const string PasswordTooShort = "auth.password_too_short";
    public const string PasswordBreached = "auth.password_breached";
    public const string LanguageInvalid = "auth.language_invalid";

    public static readonly string[] Languages = ["fr", "en"];

    // Letters of any alphabet with their accents, plus spaces, hyphens, apostrophes and dots (FR-002).
    [GeneratedRegex(@"^[\p{L}\p{M}][\p{L}\p{M} .'’\-]{0,98}[\p{L}\p{M}.]$")]
    private static partial Regex NamePattern();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();

    public static string CleanName(string? name) => Regex.Replace((name ?? string.Empty).Trim(), @"\s+", " ");

    public static string CleanEmail(string? email) => (email ?? string.Empty).Trim().ToLowerInvariant();

    public static bool IsName(string name) => NamePattern().IsMatch(name);

    public static bool IsEmail(string email) => email.Length <= 254 && EmailPattern().IsMatch(email);

    public static FieldError? CheckPassword(string? password, string path = "password") =>
        password is null || password.Length < MinPasswordLength || password.Length > MaxPasswordLength
            ? new FieldError(PasswordTooShort, path)
            : null;

    /// <summary>"Jasmine Kaur" becomes "Jasmine K."; a single name stays as it is (FR-001).</summary>
    public static string DisplayNameOf(string fullName)
    {
        var parts = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2)
        {
            return fullName;
        }
        var initial = new StringInfo(parts[^1]).SubstringByTextElements(0, 1).ToUpperInvariant();
        return $"{parts[0]} {initial}.";
    }
}

/// <summary>Is this password in a known breach (FR-003)?</summary>
public interface IBreachedPasswordCheck
{
    Task<bool> IsBreachedAsync(string password, CancellationToken cancellationToken);
}

/// <summary>
/// Development only, when <see cref="Setting"/> is true: knows no breach, so nothing leaves the machine.
/// The browser tests use it; every other environment ignores the setting.
/// </summary>
internal sealed class OfflineBreachedPasswordCheck : IBreachedPasswordCheck
{
    public const string Setting = "Auth:OfflineBreachedPasswordCheck";

    public Task<bool> IsBreachedAsync(string password, CancellationToken cancellationToken) => Task.FromResult(false);
}

/// <summary>
/// The Have I Been Pwned range API with k-anonymity: only the first 5 characters of the SHA-1 hash leave the
/// server, never the password. If the service is slow or down the password is allowed, with a warning.
/// </summary>
internal sealed class PwnedPasswordsCheck(HttpClient http, ILogger<PwnedPasswordsCheck> logger) : IBreachedPasswordCheck
{
    public async Task<bool> IsBreachedAsync(string password, CancellationToken cancellationToken)
    {
        var hash = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(password)));
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"range/{hash[..5]}");
            request.Headers.Add("Add-Padding", "true");
            request.Headers.UserAgent.Add(new ProductInfoHeaderValue("Quart", "1.0"));
            using var response = await http.SendAsync(request, cancellationToken);
            response.EnsureSuccessStatusCode();
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            var suffix = hash[5..];
            // Each line is "SUFFIX:COUNT"; padding lines have a count of 0.
            return body.Split('\n').Any(line =>
                line.StartsWith(suffix, StringComparison.OrdinalIgnoreCase)
                && line.Split(':') is [_, var count]
                && int.TryParse(count.Trim(), out var seen)
                && seen > 0);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("The breached-password service did not answer; the password was allowed");
            return false;
        }
    }
}
