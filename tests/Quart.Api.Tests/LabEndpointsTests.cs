using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Quart.Api.Tests;

/// <summary>
/// The generator lab endpoints (M1-01): only where <c>Features:Lab</c> is on and never in Production,
/// size-capped and rate limited. The lab never touches the database, so no Docker is needed.
/// </summary>
public sealed class LabEndpointsTests
{
    private const string Scenario = "/api/lab/scenarios/presotea";
    private const string Generate = "/api/lab/generate";

    private static QuartApiFactory Lab(string environment = "Development", bool? enabled = null) =>
        QuartApiFactory.WithDatabaseDown(
            environment,
            settings: enabled is null ? null : new Dictionary<string, string?> { ["Features:Lab"] = enabled.Value ? "true" : "false" });

    [Theory]
    [InlineData("Development")]
    [InlineData("Staging")]
    public async Task Absent_when_the_lab_feature_is_off(string environment)
    {
        await using var factory = Lab(environment, enabled: false);
        using var client = factory.CreateClient();

        using var scenario = await client.GetAsync(Scenario, TestContext.Current.CancellationToken);
        using var generate = await client.PostAsJsonAsync(Generate, new { }, TestContext.Current.CancellationToken);

        await AssertNotFoundAsync(scenario);
        await AssertNotFoundAsync(generate);
    }

    [Fact]
    public async Task Absent_in_production_even_when_the_setting_says_on()
    {
        await using var factory = Lab("Production", enabled: true);
        using var client = factory.CreateClient();

        using var scenario = await client.GetAsync(Scenario, TestContext.Current.CancellationToken);

        await AssertNotFoundAsync(scenario);
    }

    [Theory]
    [InlineData("Development")]
    [InlineData("Staging")]
    public async Task On_by_default_in_development_and_staging(string environment)
    {
        await using var factory = Lab(environment);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(Scenario, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Serves_the_presotea_sample()
    {
        await using var factory = Lab();
        using var client = factory.CreateClient();

        var scenario = await client.GetFromJsonAsync<JsonElement>(Scenario, TestContext.Current.CancellationToken);

        // 15 people, an opening and a closing every day for two weeks, two per shift.
        var input = scenario.GetProperty("input");
        Assert.Equal(15, scenario.GetProperty("people").GetArrayLength());
        Assert.Equal(15, input.GetProperty("members").GetArrayLength());
        var shifts = input.GetProperty("shifts").EnumerateArray().ToList();
        Assert.Equal(28, shifts.Count);
        Assert.All(shifts, shift => Assert.Equal(2, shift.GetProperty("headcount").GetInt32()));
        Assert.Equal("2026-10-05", shifts[0].GetProperty("date").GetString());
        Assert.Equal("10:00:00", shifts[0].GetProperty("start").GetString());
    }

    [Fact]
    public async Task Generates_a_schedule_for_the_sample()
    {
        await using var factory = Lab();
        using var client = factory.CreateClient();
        var scenario = await client.GetFromJsonAsync<JsonElement>(Scenario, TestContext.Current.CancellationToken);

        using var response = await client.PostAsJsonAsync(Generate, scenario.GetProperty("input"), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal(1, result.GetProperty("seed").GetInt32());
        // Philippe is available for everything, so every one of the 28 shifts gets at least him.
        var assignments = result.GetProperty("assignments").EnumerateArray().ToList();
        Assert.Equal(28, assignments.Select(a => a.GetProperty("shiftId").GetString()).Distinct().Count());
        Assert.InRange(assignments.Count, 28, 56);
    }

    [Fact]
    public async Task An_inconsistent_input_is_a_validation_problem_with_its_paths()
    {
        await using var factory = Lab();
        using var client = factory.CreateClient();
        var input = await SampleInputAsync(client);
        input["lockedAssignments"] = new JsonArray(new JsonObject { ["shiftId"] = "nope", ["memberId"] = "p1" });

        using var response = await client.PostAsJsonAsync(Generate, input, TestContext.Current.CancellationToken);

        var problem = await AssertValidationProblemAsync(response);
        var error = Assert.Single(problem.GetProperty("errors").EnumerateArray());
        Assert.Equal("generator.unknown_shift", error.GetProperty("code").GetString());
        Assert.Equal("lockedAssignments[0].shiftId", error.GetProperty("path").GetString());
    }

    [Fact]
    public async Task More_than_60_people_is_refused()
    {
        await using var factory = Lab();
        using var client = factory.CreateClient();
        var input = await SampleInputAsync(client);
        input["members"] = new JsonArray(Enumerable.Range(1, 61)
            .Select(i => (JsonNode)new JsonObject { ["id"] = $"m{i}", ["level"] = 1, ["desiredWeeklyHours"] = 10, ["maxWeeklyHours"] = null })
            .ToArray());

        using var response = await client.PostAsJsonAsync(Generate, input, TestContext.Current.CancellationToken);

        var problem = await AssertValidationProblemAsync(response);
        Assert.Contains(problem.GetProperty("errors").EnumerateArray(), e => e.GetProperty("code").GetString() == "lab.too_many_people");
    }

    [Fact]
    public async Task More_than_8_weeks_is_refused()
    {
        await using var factory = Lab();
        using var client = factory.CreateClient();
        var input = await SampleInputAsync(client);
        // The sample starts on 5 October; a shift 8 weeks later makes the period 57 days long.
        var shifts = input["shifts"]!.AsArray();
        var late = shifts[0]!.DeepClone();
        late["id"] = "late";
        late["date"] = "2026-11-30";
        shifts.Add(late);

        using var response = await client.PostAsJsonAsync(Generate, input, TestContext.Current.CancellationToken);

        var problem = await AssertValidationProblemAsync(response);
        Assert.Contains(problem.GetProperty("errors").EnumerateArray(), e => e.GetProperty("code").GetString() == "lab.too_many_weeks");
    }

    [Fact]
    public async Task Malformed_json_is_a_validation_problem()
    {
        await using var factory = Lab();
        using var client = factory.CreateClient();
        using var body = new StringContent("{ \"shifts\": [", Encoding.UTF8, "application/json");

        using var response = await client.PostAsync(Generate, body, TestContext.Current.CancellationToken);

        await AssertValidationProblemAsync(response);
    }

    [Fact]
    public async Task Too_many_requests_in_a_minute_are_refused_with_a_code()
    {
        await using var factory = Lab();
        using var client = factory.CreateClient();

        for (var i = 0; i < 30; i++)
        {
            using var allowed = await client.GetAsync(Scenario, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        }
        using var refused = await client.GetAsync(Scenario, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal("common.too_many_requests", problem.GetProperty("code").GetString());
    }

    private static async Task<JsonObject> SampleInputAsync(HttpClient client)
    {
        var scenario = await client.GetFromJsonAsync<JsonObject>(Scenario, TestContext.Current.CancellationToken);
        return scenario!["input"]!.AsObject();
    }

    private static async Task AssertNotFoundAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal("common.not_found", problem.GetProperty("code").GetString());
    }

    private static async Task<JsonElement> AssertValidationProblemAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal("common.validation", problem.GetProperty("code").GetString());
        return problem;
    }
}
