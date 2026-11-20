# Items for the privacy page

Task 6.2 writes the privacy page (spec section 12, Law 25). Until it exists, every pull request that
stores a new piece of personal data adds a line here, so 6.2 picks it up (remaining-work.md, 1.6).

| What | Why | Who can see it | Kept until | Added in |
| --- | --- | --- | --- | --- |
| A requested new email address (`identity.account_link.pending_email`) | To send the confirmation link and apply the change once it is opened (M2-07) | Nobody in the app; only the system | The link is used, replaced or expires (24 hours); deleting the rows themselves is task 1.7 | M2-07 |
| Hours a person wants per week, given with each period's availability (`scheduling.availability.desired_weekly_hours`) | To build a schedule close to what each person wants (BR-032) | The person and the workplace's admins | Kept with the period's availability, like the rest of it | 2026-11-18 change list |
| Which open shifts, give-aways and trade requests a person has opened (`marketplace.seen_item`) | To count unopened items on the Trade tab (FR-215) | Nobody in the app; only the system, to show the count | Kept with the membership; deleting old rows is task 1.7 | 2026-11-18 change list |
