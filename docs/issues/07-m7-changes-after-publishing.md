---
milestone: M7 — Give away, claim, trade
description: >-
  Demo: Sarah gives away her Saturday; Kevin claims it; Philippe approves and both are notified.
  A trade request goes coworker → Philippe → applied, re-checked at the moment of approval. A trade
  nobody answered expires by itself. Two people tapping Claim at the same instant: one wins, the
  other is told it was just taken.
---

## M7-01 · Requests tab and inbox
labels: type:feature, stack:full, area:marketplace, size:M
depends: M6-12
spec: FR-230, FR-215, AD-031

**Goal.** One place for everything waiting on someone: open shifts, offers, claims and trades.

**You will see.** The Requests tab with "Open shifts", "Waiting on me" and "My requests" sections, and a "pending requests" card on Home. Empty states until the next issues fill them.

**Backend**
- [ ] One endpoint aggregating open slots (FR-165) now, with the marketplace items added as they land. Screens refetch on focus and on a modest interval (AD-031).

**Done when**
- [ ] Open slots from a published schedule appear on staging for every employee.

## M7-02 · Give away a shift
labels: type:feature, stack:full, area:marketplace, area:notifications, size:M
depends: M7-01
spec: FR-180, FR-181, FR-182, FR-215, AD-013

**Goal.** Someone who cannot work a shift can offer it, and stays responsible until someone takes it.

**You will see.** In "My shifts", a "Give away" action with an optional note. The shift appears under Open shifts for coworkers, and the giver's own view says "Offered — you are still on this shift".

**Backend**
- [ ] `marketplace.give_away` (shift, from membership, status, version for optimistic concurrency, AD-013). Allowed any time before the shift starts (FR-182). The giver stays assigned (FR-181). Cancelling is allowed until it is taken.
- [ ] Notify coworkers who work shifts, bundled once push exists (FR-213).

**Tests**
- [ ] Offering a shift you do not hold, or one that already started, is refused.

**Done when**
- [ ] An offer made on one test account appears for the others on staging.

## M7-03 · Claim an open or offered shift
labels: type:feature, stack:full, area:marketplace, size:L
depends: M7-02
spec: FR-184, FR-185, FR-186, AD-011, AD-013, BR-002

**Goal.** Taking a shift is one tap, with honest warnings and one hard block.

**You will see.** Claim on any open or offered shift. Warnings (not blocks) when it pushes you over your desired hours, when you did not mark yourself available, or when the shift would lose its required level (FR-186). A hard block when it overlaps a shift you already hold, in any workplace (FR-185).

**Backend**
- [ ] With approval off (the default until M7-04), the first claim wins: move the assignment in one transaction, bump the live version, notify the giver and the admins.
- [ ] Concurrency: the version check plus the exclusion constraint (AD-011). The loser gets `marketplace.shift_taken`.
- [ ] Every change goes through the audit log (M5-12).

**Tests**
- [ ] Two parallel claims → exactly one succeeds; an overlapping claim is refused even across workplaces; warnings come back as codes with parameters.

**Done when**
- [ ] Claiming on staging moves the shift, and the loser of a simultaneous claim sees "just taken".

## M7-04 · Approval settings and choosing among claimants
labels: type:feature, stack:full, area:marketplace, size:M
depends: M7-03
spec: FR-187, FR-193, 5.3

**Goal.** Philippe decides whether claims and trades need his approval, independently.

**You will see.** Settings → Requests: "Claims need approval" and "Trades need approval". With claim approval on, a claim becomes a request; Philippe sees every requester for a shift and picks one, and the others are declined automatically and notified.

**Backend**
- [ ] `marketplace.claim` (shift, membership, give_away?, status, decided_by, version). Approving one declines the others in the same transaction.
- [ ] Guarded by ApproveRequests.

**Tests**
- [ ] Approving one of three claims leaves exactly one approved and two declined.

**Done when**
- [ ] With approval on, three test accounts request a shift and Philippe picks one on his phone.

## M7-05 · Unclaimed give-away alert
labels: type:feature, stack:backend, area:marketplace, area:notifications, size:S
depends: M7-02
spec: FR-183, Q-08, AD-029

**Goal.** Philippe hears about a shift nobody has taken while there is still time to act.

**Backend**
- [ ] A workplace setting "alert when still unclaimed N hours before" (default to be agreed under Q-08; ask Philippe before shipping).
- [ ] A job scheduled for each offer; when it runs, it checks the current state and does nothing if the shift was taken.

**Done when**
- [ ] With a fake clock on staging, an untaken offer alerts the admins exactly once.

## M7-06 · Trades: request, accept or decline, cancel
labels: type:feature, stack:full, area:marketplace, size:M
depends: M7-03
spec: FR-188, FR-189, FR-190, FR-215

**Goal.** Two people swap one shift each.

**You will see.** On one of your shifts: "Trade" → pick a coworker's shift → send. The coworker gets a notification and accepts or declines. The requester can cancel until it is approved.

**Backend**
- [ ] `marketplace.trade` (a_membership, a_shift, b_membership, b_shift, status, expires_at, version), strictly one-for-one (FR-188).
- [ ] With trade approval off, acceptance applies the trade; with it on, acceptance moves it to "waiting for approval" (M7-07).

**Tests**
- [ ] Only the named coworker can accept; the requester can cancel until approval; nobody else can act on the trade.

**Done when**
- [ ] A trade with approval off completes on staging between two test accounts.

## M7-07 · Trade approval with re-validation
labels: type:feature, stack:full, area:marketplace, size:M
depends: M7-06, M7-04
spec: FR-189, FR-192

**Goal.** An approved trade is still valid at the moment it is applied.

**Backend**
- [ ] At approval, re-check everything (FR-192): both people still hold those shifts, required levels are still covered, nobody ends up double-booked. If anything fails, reject with a specific code and explanation, and never apply it partially.

**Frontend**
- [ ] Admins see pending trades with both shifts side by side and any level warning.

**Tests**
- [ ] One side claimed away in between → rejected; the swap would leave a shift without a level 3 → rejected with the right code.

**Done when**
- [ ] A stale trade is refused on staging with a message that says why.

## M7-08 · Trade expiry and automatic cancellation
labels: type:feature, stack:backend, area:marketplace, size:S
depends: M7-07
spec: FR-191, AD-029

**Goal.** Old trades never linger or apply by surprise.

**Backend**
- [ ] A pending trade expires after 14 days or when either shift starts, whichever comes first (a job on the earlier instant).
- [ ] An admin edit to either shift (M5-07 update) cancels it automatically. Both people are notified in each case.

**Tests**
- [ ] With a fake clock: expiry at shift start; an admin edit cancels the trade.

**Done when**
- [ ] An ignored trade disappears on its own, and both people are told.
