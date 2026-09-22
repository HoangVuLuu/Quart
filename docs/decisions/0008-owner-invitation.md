# 0008. A new workplace starts with a single owner invitation

- Status: Accepted
- Date: 2026-09-21
- Spec: FR-032, FR-042 (new), 5.2

## Context

Only the platform admin can create a workplace (FR-032), and the platform admin has no access to a
workplace's data (5.2). The spec never said how the actual owner, Philippe, becomes the owner of a
workplace someone else created.

## Decision

Creating a workplace produces a single-use owner invitation link, valid 7 days. The platform admin
sends it to the owner. Whoever signs in and accepts it becomes the owner. Until then the workplace has
no members. The platform admin can revoke and reissue the link while it is unused.

## Consequences

No special case where the platform admin briefly owns a workplace and must transfer it away.
Recorded in the spec as FR-042.
