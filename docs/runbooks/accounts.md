# Infrastructure accounts

Every account that can reach Quart's code, data or bill, who owns it, and how it is protected
(spec 11.5). No single stolen password may reach Presotea's data, so every account here has
two-factor authentication before any real data exists.

**Never put passwords, recovery codes or secrets in this file or anywhere in the repository.** This
file says _where_ things are kept, never what they are.

## Accounts

| Account         | What it reaches                                       | Owner | Two-factor        | Recovery codes    |
| --------------- | ----------------------------------------------------- | ----- | ----------------- | ----------------- |
| GitHub          | Code, CI, the container registry, deploy secrets      | Hoang | Authenticator app | On paper, offline |
| Microsoft Azure | The running app (Container Apps), logs, billing       | Hoang | Authenticator app | On paper, offline |
| Supabase        | The database and file storage, with all personal data | Hoang | Authenticator app | On paper, offline |

Recovery codes are kept on paper, separate from the phone that holds the authenticator app, so
losing the phone does not lock every account at once. If a set of codes is used or lost, generate a
new set in that account's security settings and replace the paper copy.

## Still to add

Add each account to the table above, with two-factor on, in the same pull request as the issue that
creates it, and move it out of this list.

| Account          | Created in | What it will reach                                  |
| ---------------- | ---------- | --------------------------------------------------- |
| Domain registrar | M2-01      | The domain; whoever controls it controls the emails |
| Email provider   | M6-02      | Every email the app sends                           |

## Cost alert

The Azure subscription has a budget of **$1/month** (spec 11.5), so any charge is noticed at once:

- Alerts at **100% of actual** and **100% of forecast** spend, emailed to the owner.
- Attached to the action group `quart-budget-alerts`. Its **Test action group** button sends a
  sample alert; one was received when this was set up (M0-02).
- Azure checks spending about once a day, so an alert can arrive hours after the charge.

Alert emails come from `azure-noreply@microsoft.com`; keep that address out of the spam folder.

## Checking it

Once a quarter, and whenever someone gains or loses access:

1. Sign in to each account above and confirm two-factor is still on.
2. Confirm the paper recovery codes are where they should be.
3. In Azure, confirm the budget and its alert recipients are unchanged.
