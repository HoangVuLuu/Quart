# 0005. No live connection in v1

- Status: Accepted
- Date: 2026-09-21
- Spec: AD-031, AD-032, AD-033

## Context

Chat was removed from scope. Nothing left in v1 needs updates within seconds, and a live WebSocket
connection keeps the container awake, which defeats scale-to-zero and the free tier.

## Decision

Data refreshes when the app returns to the foreground (TanStack Query `refetchOnWindowFocus`) and on
navigation. Anything urgent reaches people as a push notification. Screens are built so a live channel
could be added later without rewriting them.

## Consequences

Two people looking at the same screen can see slightly different data until one refreshes. Optimistic
concurrency (AD-013) stops that from ever producing a wrong write.
