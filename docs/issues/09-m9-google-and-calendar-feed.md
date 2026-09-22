---
milestone: M9 — Google and calendar feed
description: >-
  Demo: an employee signs in with Google, presses "Import from Google Calendar", chooses which
  calendars count, reviews the proposed availability and sends it. Another subscribes to their
  shifts in Apple Calendar. After launch on purpose: Google's app verification can take weeks, and
  launch never waits on it.
---

## M9-01 · Sign in with Google
labels: type:feature, stack:full, area:auth, size:M
depends: M6-02
spec: FR-006, AD-024

**Goal.** One-tap sign-in for people who prefer it.

**Backend**
- [ ] A Google Cloud project, an OAuth consent screen (app name, privacy policy link from M6-03, the domain from M6-02), and `Microsoft.AspNetCore.Authentication.Google`.
- [ ] Match an existing account only by an email Google reports as verified; otherwise create an account that is already verified. Linking an existing password account needs that account's password or a signed-in session.
- [ ] The Google sign-in result becomes the same server-side session as a password sign-in; two-factor still applies if enrolled.

**Done when**
- [ ] A test account signs in with Google on staging and lands on the same account as its password sign-in.

## M9-02 · Import availability from Google Calendar free/busy
labels: type:feature, stack:full, area:availability, area:calendar, area:privacy, size:L
depends: M9-01
spec: FR-097, 12.2

**Goal.** Fill availability from your own calendar, without Quart ever seeing event details.

**You will see.** On the availability screen: "Import from Google Calendar" → choose calendars → a review that marks each block as free, busy or partly busy → adjust → send yourself.

**Backend**
- [ ] Ask for the narrowest scopes that allow listing calendars and querying free/busy. Check Google's current scope list; expect `calendar.freebusy` and `calendar.calendarlist.readonly`. Never read event titles or details (12.2).
- [ ] **Store no Google tokens.** Each import asks for a fresh short-lived access token (incremental authorization) and discards it. This is narrower than the spec's earlier "token storage" plan; record the decision.
- [ ] A block is marked available only if the whole block is free (FR-097). Events marked "free" in Google do not block. The import only fills the draft.

**Tests**
- [ ] Mapping busy ranges to blocks, including an event ending exactly at a block's start (half-open ranges).

**Done when**
- [ ] A real Google calendar fills a staging draft correctly, and no token remains in the database afterwards.

## M9-03 · Subscribe to my shifts in any calendar app
labels: type:feature, stack:full, area:calendar, area:privacy, size:M
depends: M6-12
spec: 3.2, FR-040, AD-047

**Goal.** Your published shifts show up in Apple, Google or Outlook Calendar and stay up to date.

**You will see.** Settings → Calendar: "Subscribe" gives a private link (and a `webcal://` button). "Reset link" invalidates the old one.

**Backend**
- [ ] `GET /api/calendar/{token}.ics`: the token is random and stored hashed, and the feed contains only that person's own published shifts (no coworkers), with `Cache-Control: private`.
- [ ] Events carry stable UIDs, so updates move events instead of duplicating them. Times are in the workplace time zone.
- [ ] Leaving the workplace or deleting the account revokes the feed.

**Done when**
- [ ] An iPhone subscribed on staging shows a changed shift after the next refresh.

## M9-04 · Submit the Google app for verification
labels: type:chore, area:calendar, area:auth, size:S
depends: M9-02
spec: 11.4, AD-062

**Goal.** Remove the "unverified app" warning and the test-user cap.

**Tasks**
- [ ] Complete Google's verification for the calendar scopes: the domain from M6-02, the privacy policy from M6-03, the scope justifications, and a demo video if requested.
- [ ] Until approval, add staff as test users so the feature can be used.

**Done when**
- [ ] Google approves the app, or the remaining requirements are listed in this issue.
