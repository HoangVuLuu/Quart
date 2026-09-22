# 0003. PostgreSQL on Supabase, Canada Central (Montreal)

- Status: Accepted
- Date: 2026-09-21
- Spec: AD-050, 11.2, 12.1

## Context

The app stores personal information about Quebec employees. Law 25 does not forbid storing it
elsewhere, but keeping it in Quebec removes the cross-border assessment entirely. Azure's free
PostgreSQL offer lasts 12 months; Supabase's free tier does not expire and offers a Montreal region.

## Decision

Staging and production each get a Supabase project in Canada Central (Montreal), used as plain
PostgreSQL through Npgsql and EF Core, plus private Supabase Storage buckets for files. No Supabase
client libraries in the app: if Supabase ever has to go, any PostgreSQL host works.

## Consequences

Free projects pause after a week without activity; the scheduled tick keeps them awake. The database
sits in Montreal and the app in Quebec City, a few milliseconds apart.
