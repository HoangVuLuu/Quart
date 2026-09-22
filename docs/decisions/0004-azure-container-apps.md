# 0004. Azure Container Apps, Canada East

- Status: Accepted
- Date: 2026-09-21
- Spec: AD-051, 11.2, 17 (2026-09-21)

## Context

Google Cloud Run and Azure Container Apps were technically equivalent for this workload: both run one
container, scale to zero, and fit comfortably in their free allowances. Vercel was rejected (Hobby is
non-commercial, no .NET).

## Decision

Azure Container Apps in Canada East (Quebec City), minimum 0 and maximum 1 replica, image pulled from
GitHub Container Registry. The tie was broken by career value: Azure experience matters for the
internships being targeted.

## Consequences

The first request after idle waits a few seconds for a cold start. A budget alert at $1 guards against
surprises. Nothing in the code depends on Azure: the same image runs on any container host.
