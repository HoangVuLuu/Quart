# Items for the privacy page

Task 6.2 writes the privacy page (spec section 12, Law 25). Until it exists, every pull request that
stores a new piece of personal data adds a line here, so 6.2 picks it up (remaining-work.md, 1.6).

| What | Why | Who can see it | Kept until | Added in |
| --- | --- | --- | --- | --- |
| A requested new email address (`identity.account_link.pending_email`) | To send the confirmation link and apply the change once it is opened (M2-07) | Nobody in the app; only the system | The link is used, replaced or expires (24 hours); the row is deleted a day after it expires (1.7) | M2-07 |
| Hours a person wants per week, given with each period's availability (`scheduling.availability.desired_weekly_hours`) | To build a schedule close to what each person wants (BR-032) | The person and the workplace's admins | Kept with the period's availability, like the rest of it | 2026-11-18 change list |
| Which open shifts, give-aways and trade requests a person has opened (`marketplace.seen_item`) | To count unopened items on the Trade tab (FR-215) | Nobody in the app; only the system, to show the count | 60 days (1.7) | 2026-11-18 change list |

## Retention and deletion (tasks 1.6 and 1.7)

- The retention table for the privacy page is `Retention.Table` in `src/backend/Quart.SharedKernel/Retention.cs`. It
  is the spec's section 13 table word for word (a test checks it); 6.2 should show it from there, with the
  housekeeping periods listed under section 13.
- Deleting an account (FR-009) cannot be undone. It removes the profile, sessions, links, the person's alerts, their
  availability and notes, and every email to their address in the outbox; the goodbye email's row goes once sent.
- Accounts whose email was never confirmed are deleted 7 days after sign-up. What stays: bare IDs on past schedules (shown as
  "Former employee"), and for up to 60 days the short name inside other people's alerts ("Paul C. left").
