using NodaTime;
using Npgsql;
using NpgsqlTypes;
using Quart.SharedKernel.Jobs;

namespace Quart.Modules.Jobs.Tick;

/// <summary>
/// Every query the tick and the scheduler run against <c>jobs.scheduled_job</c> and <c>jobs.heartbeat</c>.
/// Raw SQL on purpose (spec 9.3): claiming needs <c>FOR UPDATE SKIP LOCKED</c> and scheduling needs
/// <c>ON CONFLICT</c>, which EF Core cannot express. The tables themselves are defined, and migrated, by
/// <see cref="Persistence.JobsDbContext"/>. Statuses are stored as text, as the context maps them.
/// </summary>
internal sealed class JobStore(NpgsqlDataSource dataSource)
{
    /// <summary>
    /// Takes the oldest due job and marks it as running until <paramref name="lockedUntil"/>, in one statement.
    /// <c>SKIP LOCKED</c> makes a second tick skip a row the first is claiming instead of waiting for it, and
    /// once the first commits, the row is no longer pending, so two ticks never get the same job.
    /// A job left running past its lock (its tick crashed) counts as due again.
    /// </summary>
    /// <param name="skip">Jobs this tick already ran: a job rescheduled for now must wait for the next tick.</param>
    public async Task<ClaimedJob?> ClaimNextAsync(Instant now, Instant lockedUntil, IReadOnlyCollection<Guid> skip, CancellationToken cancellationToken)
    {
        await using var command = dataSource.CreateCommand(
            """
            UPDATE jobs.scheduled_job AS job
            SET status = 'Running', attempts = job.attempts + 1, locked_until = @locked_until
            WHERE job.id = (
                SELECT id FROM jobs.scheduled_job
                WHERE ((status = 'Pending' AND run_at <= @now) OR (status = 'Running' AND locked_until <= @now))
                  AND NOT (id = ANY(@skip))
                ORDER BY run_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED)
            RETURNING job.id, job.type, job.workplace_id, job.attempts, job.payload::text
            """);
        command.Parameters.Add(new NpgsqlParameter<Instant>("now", now));
        command.Parameters.Add(new NpgsqlParameter<Instant>("locked_until", lockedUntil));
        command.Parameters.Add(new NpgsqlParameter<Guid[]>("skip", [.. skip]));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }
        return new ClaimedJob(
            Id: reader.GetGuid(0),
            Type: reader.GetString(1),
            WorkplaceId: await reader.IsDBNullAsync(2, cancellationToken) ? null : reader.GetGuid(2),
            Attempts: reader.GetInt32(3),
            Payload: reader.GetString(4),
            LockedUntil: lockedUntil);
    }

    /// <summary>The job is finished for good.</summary>
    public Task MarkSucceededAsync(ClaimedJob job, CancellationToken cancellationToken) =>
        ReleaseAsync(job, "status = 'Succeeded'", runAt: null, cancellationToken);

    /// <summary>Recurring work: back to pending at <paramref name="runAt"/>, attempts reset.</summary>
    public Task RescheduleAsync(ClaimedJob job, Instant runAt, CancellationToken cancellationToken) =>
        ReleaseAsync(job, "status = 'Pending', run_at = @run_at, attempts = 0", runAt, cancellationToken);

    /// <summary>Failed, tried again at <paramref name="runAt"/>; the attempt stays counted.</summary>
    public Task RetryLaterAsync(ClaimedJob job, Instant runAt, CancellationToken cancellationToken) =>
        ReleaseAsync(job, "status = 'Pending', run_at = @run_at", runAt, cancellationToken);

    /// <summary>Out of attempts: never runs again on its own.</summary>
    public Task MarkFailedAsync(ClaimedJob job, CancellationToken cancellationToken) =>
        ReleaseAsync(job, "status = 'Failed'", runAt: null, cancellationToken);

    // Only while this runner still holds the lock it took. If the lock ran out and another tick claimed
    // the job meanwhile, the other tick's result is the one that counts.
    private async Task ReleaseAsync(ClaimedJob job, string set, Instant? runAt, CancellationToken cancellationToken)
    {
        await using var command = dataSource.CreateCommand(
            $"UPDATE jobs.scheduled_job SET {set}, locked_until = NULL WHERE id = @id AND locked_until = @locked_until");
        command.Parameters.Add(new NpgsqlParameter<Guid>("id", job.Id));
        command.Parameters.Add(new NpgsqlParameter<Instant>("locked_until", job.LockedUntil));
        if (runAt is { } value)
        {
            command.Parameters.Add(new NpgsqlParameter<Instant>("run_at", value));
        }
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <returns>False when <see cref="JobRequest.DedupeKey"/> is already taken.</returns>
    public async Task<bool> InsertAsync(JobRequest job, string payload, CancellationToken cancellationToken)
    {
        await using var command = dataSource.CreateCommand(
            """
            INSERT INTO jobs.scheduled_job (id, type, workplace_id, run_at, status, attempts, payload, dedupe_key)
            VALUES (@id, @type, @workplace_id, @run_at, 'Pending', 0, @payload, @dedupe_key)
            ON CONFLICT (dedupe_key) DO NOTHING
            """);
        command.Parameters.Add(new NpgsqlParameter<Guid>("id", Guid.CreateVersion7()));
        command.Parameters.Add(new NpgsqlParameter<string>("type", job.Type));
        command.Parameters.Add(new NpgsqlParameter("workplace_id", NpgsqlDbType.Uuid) { Value = (object?)job.WorkplaceId ?? DBNull.Value });
        command.Parameters.Add(new NpgsqlParameter<Instant>("run_at", job.RunAt));
        command.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Jsonb) { Value = payload });
        command.Parameters.Add(new NpgsqlParameter("dedupe_key", NpgsqlDbType.Text) { Value = (object?)job.DedupeKey ?? DBNull.Value });
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }

    /// <summary>Moves the heartbeat forward, never back: an older tick finishing late cannot undo a newer one.</summary>
    public async Task RecordHeartbeatAsync(Instant at, CancellationToken cancellationToken)
    {
        await using var command = dataSource.CreateCommand(
            """
            INSERT INTO jobs.heartbeat (id, last_tick_at) VALUES (1, @at)
            ON CONFLICT (id) DO UPDATE SET last_tick_at = GREATEST(jobs.heartbeat.last_tick_at, EXCLUDED.last_tick_at)
            """);
        command.Parameters.Add(new NpgsqlParameter<Instant>("at", at));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<Instant?> ReadHeartbeatAsync(CancellationToken cancellationToken)
    {
        await using var command = dataSource.CreateCommand("SELECT last_tick_at FROM jobs.heartbeat WHERE id = 1");
        return await command.ExecuteScalarAsync(cancellationToken) is Instant at ? at : null;
    }
}

/// <param name="Attempts">Including the run that is starting now.</param>
/// <param name="LockedUntil">The lock this runner took; releasing the job checks it still holds it.</param>
internal sealed record ClaimedJob(Guid Id, string Type, Guid? WorkplaceId, int Attempts, string Payload, Instant LockedUntil);
