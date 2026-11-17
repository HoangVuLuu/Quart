# Items for the privacy page

Task 6.2 writes the privacy page (spec section 12, Law 25). Until it exists, every pull request that
stores a new piece of personal data adds a line here, so 6.2 picks it up (remaining-work.md, 1.6).

| What | Why | Who can see it | Kept until | Added in |
| --- | --- | --- | --- | --- |
| A requested new email address (`identity.account_link.pending_email`) | To send the confirmation link and apply the change once it is opened (M2-07) | Nobody in the app; only the system | The link is used, replaced or expires (24 hours); deleting the rows themselves is task 1.7 | M2-07 |
