---
milestone: M6 — Go live
description: >-
  Demo: Presotea runs one real availability-to-publish cycle in production, on its own domain,
  alongside the Excel sheet. Before any real personal data enters the app: a production
  environment, a privacy policy, retention jobs, encrypted backups, monitoring, and an incident
  plan. This is v1.
---

## M6-01 · Production environment and release-tag deploys
labels: type:chore, area:infra, size:M
depends: M5-12
spec: 11.2, 11.3, AD-061

**Goal.** Real data lives in its own environment, deployed only on purpose.

**Tasks**
- [ ] Repeat the staging runbook for production: Supabase `quart-production` (Canada Central), resource group `rg-quart-production` (canadaeast), container app, migrate job, tick job, federated credential for a `production` GitHub environment with a required reviewer (you).
- [ ] `deploy-production.yml`, triggered by a `v*` tag: promote the already-tested image by digest (never rebuild), run migrations, update the app, smoke test.
- [ ] `Features:Lab` is off; `/dev/ui` is not in the production build.

**Done when**
- [ ] Tag `v0.1.0` deploys to production with an approval, and the lab returns 404 there.

## M6-02 · Custom domain, TLS and email authentication
labels: type:chore, area:infra, area:notifications, size:S
depends: M6-01
spec: AD-062, 11.4

**Goal.** A permanent address before any staff member installs the app. Installed web apps and push subscriptions are tied to the address, so it must never change after the pilot starts.

**Tasks**
- [ ] Buy a domain under $30 a year; check the **renewal** price, not just the first year. Two-factor on the registrar (tick it in M0-02).
- [ ] Production on the apex or `app.` subdomain, staging on `staging.` Container Apps managed certificates.
- [ ] SPF, DKIM and DMARC for the email provider. Send a test to Gmail and Outlook and confirm it lands in the inbox.

**Done when**
- [ ] Both environments serve over HTTPS on the domain, and a password-reset email passes SPF, DKIM and DMARC.

## M6-03 · Privacy policy and retention statement in the app
labels: type:feature, stack:full, area:privacy, needs:philippe, size:M
depends: M6-01
spec: 12.1, 12.2, 12.4, 13, FR-260

**Goal.** Law 25 expects the business to say what it collects, why, who sees it, and when it is destroyed.

**You will see.** A Privacy page in French and English, linked from sign-up and settings. New and existing users see it once and acknowledge it.

**Tasks**
- [ ] Draft from sections 12 and 13: data collected, purposes, who can see what (5.3), where it is stored (Quebec, plus the email provider's location from M2-01), retention periods, how to delete your account, and who to contact (Philippe as the person in charge of personal information).
- [ ] Philippe reviews and approves it. Neither of you is a lawyer; if the policy raises questions he cannot answer, that is the moment for professional advice.
- [ ] Store the policy version each user acknowledged.

**Done when**
- [ ] The approved policy is live in both languages, and acknowledging it is recorded per user.

## M6-04 · Data arrangement with Philippe and the incident runbook
labels: type:chore, area:privacy, area:security, payslip-readiness, needs:philippe, size:S
depends: -
spec: 12.1, 12.5, 12.8, 12.7

**Goal.** Write down who is responsible for the data, how it is protected, and what happens if something leaks.

**Tasks**
- [ ] A short written arrangement between you and Philippe: the business is responsible for the personal information; you operate the infrastructure on its behalf; your access is for stated support reasons only (12.5); what happens if you stop maintaining the app.
- [ ] `docs/runbooks/incident.md`: how to revoke sessions and file links, how to use the audit log to see who accessed what, who tells whom, and where the confidentiality-incident register lives (it is Philippe's register, 12.8).

**Done when**
- [ ] Both documents exist, and Philippe has signed or agreed to the arrangement.

## M6-05 · Retention: automatic nightly deletion
labels: type:feature, stack:backend, area:privacy, size:M
depends: M6-01
spec: 13, AD-029

**Goal.** Data is destroyed on the schedule the privacy policy promises, automatically.

**Backend**
- [ ] One nightly job per data class in section 13: notifications after 60 days; raw availability and comments 60 days after the period ends; published schedules, audit events and generation runs after 2 months.
- [ ] Deletes in batches, logs counts only, and is idempotent. A retention table in code mirrors section 13, and a test checks the two stay in sync.

**Tests**
- [ ] With a fake clock, rows one day inside the window survive and rows one day outside are gone.

**Done when**
- [ ] The job runs nightly on staging and production, and its counts appear in the logs.

## M6-06 · Monthly schedule email to the owner
labels: type:feature, stack:backend, area:notifications, size:S
depends: M6-05, M5-09
spec: FR-214, 13

**Goal.** The business keeps its records after the app deletes old schedules.

**Backend**
- [ ] On the first of each month, email the owner the previous month's final published schedule as a PDF and CSV (reusing M5-09).
- [ ] This is the only email with attachments, and it goes only to the owner. FR-216 names this exception; nothing else may attach files.

**Done when**
- [ ] The owner's test account receives last month's schedule on schedule, through a fake clock on staging.

## M6-07 · Monitoring: uptime check and alerts
labels: type:chore, area:infra, size:S
depends: M6-02
spec: 11.5, NFR-006

**Goal.** You learn about an outage before Philippe does.

**Tasks**
- [ ] An external uptime check on production `/health` every 5 minutes, emailing you on failure. It wakes the app, so check the Azure grant usage after a week and lower the frequency if needed.
- [ ] An alert when the tick job fails three times in a row or the outbox has messages older than 1 hour.
- [ ] Check that Log Analytics ingestion stays under its daily cap.

**Done when**
- [ ] Stopping the production app triggers an email within 10 minutes.

## M6-08 · Encrypted nightly backup, stored in Montreal
labels: type:chore, area:infra, area:security, payslip-readiness, size:M
depends: M6-01
spec: 11.5, 12.7

**Goal.** A backup you control, independent of the provider, that is useless to anyone who steals it without the key.

**Tasks**
- [ ] A nightly job running `pg_dump`, encrypting the dump with a key stored separately from the backups, and writing it to storage in a Canadian region.
- [ ] Keep 30 daily copies. Do a restore drill into a scratch database and write down the steps in `docs/runbooks/backup-restore.md`.
- [ ] Note in the issue: storage files (recipe photos) join the backup in M8-09.

**Done when**
- [ ] A restore drill from last night's backup succeeds, and the steps are written down.

## M6-09 · End-to-end tests of the core loop, including Safari's engine
labels: type:chore, area:infra, stack:full, size:M
depends: M5-07
spec: 10.1, NFR-001

**Goal.** The one flow that must never break is tested in a real browser on every pull request.

**Tasks**
- [ ] Playwright with Chromium and **WebKit** (iPhone viewport). Run against the app and a Postgres container in CI.
- [ ] Flow: admin creates a period → two employees send availability → admin generates, edits one shift, publishes → employee sees the shift → admin updates → only that employee is notified.
- [ ] Test data is created through the API, not by clicking, to keep the run fast.

**Done when**
- [ ] The suite runs on every pull request in under 5 minutes.

## M6-10 · Accessibility review of every v1 screen
labels: type:chore, area:a11y, stack:frontend, size:M
depends: M5-07
spec: NFR-007, NFR-008, NFR-009, NFR-010, NFR-011

**Goal.** v1 works for everyone on the team, including anyone using VoiceOver or a keyboard.

**Tasks**
- [ ] For each screen: keyboard only, VoiceOver on an iPhone, 200% zoom, dark mode, reduced motion, and colour never the only signal.
- [ ] Automated axe checks in the Playwright flow from M6-09.
- [ ] File one bug per finding, labelled `area:a11y`, and fix the blocking ones before the pilot.

**Done when**
- [ ] No blocking findings remain open.

## M6-11 · Set up Presotea in production
labels: type:chore, area:workplace, needs:philippe, size:S
depends: M6-02, M6-03, M6-04, M6-08
spec: FR-042, FR-033, NFR-012

**Goal.** The real team is in the app, with a clean start.

**Tasks**
- [ ] Grant yourself platform admin in production; create Presotea; send Philippe the owner invitation.
- [ ] Philippe builds the template, sets levels and hours, and shares the QR code. Staff join and verify their email.
- [ ] A one-page guide for staff in French and English: how to open the app, add it to the Home Screen, set availability, and read the schedule.

**Done when**
- [ ] Every staff member has joined, with their level and desired hours set.

## M6-12 · Pilot: one real cycle alongside Excel
labels: type:chore, area:scheduling, needs:philippe, size:M
depends: M6-11, M6-09, M6-10
spec: 1, 15

**Goal.** Philippe runs a full cycle in Quart while keeping Excel as a backup.

**Tasks**
- [ ] One full cycle: request → availability → generate → edit → publish → one update.
- [ ] Afterwards, a 20-minute debrief with Philippe: what took longer than Excel, what he did not trust, what staff said. Turn every finding into an issue.
- [ ] Decide together when Excel stops being the backup.

**Done when**
- [ ] The cycle is complete, the debrief is written in this issue, and the follow-up issues exist.
