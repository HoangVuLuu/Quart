# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-09-21

## Context

Quart has one developer today, but it runs a real business and is meant to outlive the co-op term.
Decisions made in chat or in someone's head are lost the first time someone else opens the repository.

## Decision

Keep short numbered records in `docs/decisions`. The spec stays the source of truth for requirements;
these records explain choices in the code that the spec does not fully cover.

## Consequences

A few minutes per decision. In exchange, a reviewer or a future maintainer can see why, not only what.
