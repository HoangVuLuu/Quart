using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Quart.Generator;
using Quart.SharedKernel;

namespace Quart.Modules.Scheduling.Lab;

/// <summary>
/// The generator lab (M1-01, spec 7.8): try the generator on a sample scenario before any real
/// schedule depends on it. Development and staging only, and only with fictional data; the host maps
/// these endpoints only when <c>Features:Lab</c> is true, never in Production. M2-10 restricts the lab
/// to the platform admin.
/// </summary>
internal static class LabEndpoints
{
    public const string RateLimitPolicy = "lab";

    // Generation is CPU work on a shared server, so the lab is kept small and slow to abuse.
    public const int MaxPeople = 60;
    public const int MaxDays = 8 * 7;
    public const int MaxShifts = 600;
    public const int RequestsPerMinute = 30;
    private const long MaxRequestBytes = 1024 * 1024;

    public const string TooManyPeople = "lab.too_many_people";
    public const string TooManyWeeks = "lab.too_many_weeks";
    public const string TooManyShifts = "lab.too_many_shifts";

    public static IServiceCollection AddLab(this IServiceCollection services)
    {
        // Partitioned by address. Behind the staging ingress every caller shares one address, so there it
        // is one limit for everybody, which is fine for a page only the team uses.
        services.AddRateLimiter(options => options.AddPolicy(RateLimitPolicy, context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = RequestsPerMinute,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                })));
        return services;
    }

    public static IEndpointRouteBuilder MapLab(this IEndpointRouteBuilder endpoints)
    {
        var lab = endpoints.MapGroup("/api/lab").RequireRateLimiting(RateLimitPolicy);

        lab.MapGet("/scenarios/presotea", () => LabScenarios.Presotea)
            .WithName("GetLabPresoteaScenario");

        lab.MapPost("/generate", Results<Ok<GeneratorResult>, ProblemHttpResult> (GeneratorInput input, IScheduleGenerator generator) =>
            {
                var errors = SizeErrors(input);
                if (errors.Count == 0)
                {
                    errors = GeneratorInputValidator.Validate(input);
                }
                if (errors.Count > 0)
                {
                    return TypedResults.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        extensions: new Dictionary<string, object?>
                        {
                            ["code"] = ErrorCodes.Validation,
                            ["errors"] = errors,
                        });
                }

                return TypedResults.Ok(generator.Generate(input));
            })
            .WithName("GenerateLabSchedule")
            .WithMetadata(new RequestSizeLimitAttribute(MaxRequestBytes));

        return endpoints;
    }

    /// <summary>The lab's size caps: at most 60 people, 8 weeks and 600 shifts.</summary>
    private static IReadOnlyList<InputError> SizeErrors(GeneratorInput input)
    {
        var errors = new List<InputError>();
        if (input.Members?.Count > MaxPeople)
        {
            errors.Add(new InputError(TooManyPeople, "members"));
        }

        var dates = input.Shifts?.Where(shift => shift is not null).Select(shift => shift.Date).ToList() ?? [];
        if (dates.Count > MaxShifts)
        {
            errors.Add(new InputError(TooManyShifts, "shifts"));
        }
        if (dates.Count > 0 && dates.Max().DayNumber - dates.Min().DayNumber + 1 > MaxDays)
        {
            errors.Add(new InputError(TooManyWeeks, "shifts"));
        }
        return errors;
    }
}
