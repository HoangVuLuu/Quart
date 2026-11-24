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
    public const string InstagramInvalid = "auth.instagram_invalid";
    public const string FacebookInvalid = "auth.facebook_invalid";

    public static readonly string[] Languages = ["fr", "en"];

    // Letters of any alphabet with their accents, plus spaces, hyphens, apostrophes and dots (FR-002).
    [GeneratedRegex(@"^[\p{L}\p{M}][\p{L}\p{M} .'’\-]{0,98}[\p{L}\p{M}.]$")]
    private static partial Regex NamePattern();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();

    // Instagram usernames: letters, digits, dots and underscores, at most 30. Facebook: letters, digits and
    // dots (a numeric profile ID is digits), at most 50 (M2-18).
    [GeneratedRegex(@"^[A-Za-z0-9._]{1,30}$")]
    private static partial Regex InstagramPattern();

    [GeneratedRegex(@"^[A-Za-z0-9.]{1,50}$")]
    private static partial Regex FacebookPattern();

    /// <summary>
    /// A handle as people paste it: "@jasmine.k", "jasmine.k" or a whole profile link. Only the handle is
    /// kept; the link is built from a fixed host when shown, so nobody can point teammates elsewhere.
    /// Empty means "remove it". Null when it is not a valid handle.
    /// </summary>
    public static string? CleanInstagram(string raw) => CleanHandle(raw, ["instagram.com"], InstagramPattern());

    /// <inheritdoc cref="CleanInstagram"/>
    public static string? CleanFacebook(string raw)
    {
        var text = raw.Trim();
        // facebook.com/profile.php?id=1000123: the number alone opens the same profile.
        var id = Regex.Match(text, @"profile\.php\?id=(\d{1,30})");
        return CleanHandle(id.Success ? id.Groups[1].Value : text, ["facebook.com", "fb.com"], FacebookPattern());
    }

    private static string? CleanHandle(string raw, string[] hosts, Regex valid)
    {
        var text = raw.Trim();
        if (text.Length > 200)
        {
            return null;
        }
        foreach (var host in hosts)
        {
            var at = text.IndexOf(host + "/", StringComparison.OrdinalIgnoreCase);
            if (at >= 0)
            {
                text = text[(at + host.Length + 1)..];
                text = text.Split('?', '#')[0].Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty;
                break;
            }
        }
        text = text.TrimStart('@');
        return text.Length == 0 ? string.Empty : valid.IsMatch(text) ? text : null;
    }

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
