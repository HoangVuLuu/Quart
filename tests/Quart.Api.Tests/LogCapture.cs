using System.Collections.Concurrent;
using Quart.Api.Logging;
using Serilog.Core;
using Serilog.Events;

namespace Quart.Api.Tests;

/// <summary>Collects every log line the app writes, formatted exactly as it goes to stdout in production.</summary>
public sealed class LogCapture : ILogEventSink
{
    private readonly ConcurrentQueue<string> lines = new();

    public IReadOnlyList<string> Lines => [.. lines];

    public string All => string.Join('\n', lines);

    public void Emit(LogEvent logEvent)
    {
        using var writer = new StringWriter();
        QuartLogging.Formatter.Format(logEvent, writer);
        lines.Enqueue(writer.ToString().TrimEnd());
    }

    /// <summary>The request summary line is written as the response completes, which can be just after the client has it.</summary>
    public async Task<IReadOnlyList<string>> WaitForAsync(Func<string, bool> match, int count = 1)
    {
        for (var attempt = 0; attempt < 50; attempt++)
        {
            var found = lines.Where(match).ToList();
            if (found.Count >= count)
            {
                return found;
            }
            await Task.Delay(20, TestContext.Current.CancellationToken);
        }
        throw new TimeoutException($"Expected {count} matching log line(s). Captured:\n{All}");
    }
}
