---
milestone: M2 — Accounts and workplaces
description: >-
  Demo: sign up, open the verification email, sign in. The platform admin creates Presotea and
  sends the owner invitation; Philippe accepts it and shares the join code; a coworker joins with
  the code; Philippe sets levels and desired hours. Two-factor, step-up and revocable sessions are
  in place, so later sensitive features have their foundation.
---

## M2-01 · Choose the transactional email provider
labels: type:decision, area:notifications, area:privacy, needs:philippe, size:S
depends: -
spec: Q-06, 12.1, FR-211

**Goal.** Verification and reset emails need a provider before M2-03 can ship to staging.

**Tasks**
- [ ] Compare two or three providers on: a free tier that covers about 15 people, a verified sending domain, SMTP support (so local Mailpit and the real provider share one code path), and where the data is processed.
- [ ] Raise the processing location with Philippe. It is the one known exception to keeping data in Quebec (12.1).
- [ ] Record the choice in `docs/decisions/` and answer Q-06 in the spec. Enable two-factor on the provider account (tick it in M0-02).

**Done when**
- [ ] A decision record exists, and staging has SMTP credentials stored as Container App secrets.

## M2-02 · Sign up
labels: type:feature, stack:full, area:auth, payslip-readiness, size:L
depends: M0-05, M0-11
spec: FR-001, FR-002, FR-003, AD-024, AD-025, AD-045, NFR-013

**Goal.** Anyone can create an account safely. Foundations for every authenticated feature land here.

**You will see.** A sign-up page (first name, last name, email, password, confirm password) that validates as you type, in both languages, then a "check your email" page.

**Backend**
- [ ] ASP.NET Core Identity via `AddIdentityCore`, with stores in the `identity` schema: `QuartUser : IdentityUser<Guid>` plus first name, last name, language, `IsPlatformAdmin`, `DeletedAt`. Use custom endpoints, not `MapIdentityApi` (which is designed for bearer tokens).
- [ ] Cookie authentication with **server-side sessions** (AD-045): an `ITicketStore` backed by an `identity.sessions` table, so the cookie holds only a session key. HttpOnly, Secure outside Development, SameSite=Lax.
- [ ] **Persist Data Protection keys to Postgres.** Container Apps scales to zero; without persisted keys, every cold start would invalidate cookies, antiforgery tokens and emailed links.
- [ ] Antiforgery (AD-025): an endpoint filter on the `/api` group validates the `X-XSRF-TOKEN` header on every unsafe method, since minimal APIs only auto-validate form posts.
- [ ] Names accept accents, hyphens and apostrophes (FR-002). Password minimum 8, no composition rules (FR-003).
- [ ] Breached-password check (FR-003): the k-anonymity range API, sending only the first 5 characters of the SHA-1 hash, with the `Add-Padding` header and a 2-second timeout. If the service is down, allow the password and log a warning.
- [ ] No account enumeration: signing up with an existing email shows the same "check your email" page, and that address receives a "you already have an account" email instead.

**Frontend**
- [ ] `features/identity/SignUpPage` with react-hook-form and zod. Server error codes map to translated messages on the right field.

**Tests**
- [ ] Unicode names; the breached-password path with a fake HTTP handler; enumeration-safe responses; a missing antiforgery header is rejected.
- [ ] Restarting the app keeps an existing session valid (keys persisted).

**Done when**
- [ ] A new account can be created on staging, and a known-breached password is refused with a clear message.

## M2-03 · Email verification, sent through the outbox
labels: type:feature, stack:full, area:auth, area:notifications, size:M
depends: M2-01, M2-02, M0-12
spec: FR-004, AD-030, FR-211, FR-261, FR-262

**Goal.** Accounts are usable only after verifying their email, and no email is ever lost.

**You will see.** The verification email arrives in Mailpit locally (and in a real inbox on staging) in the recipient's language. Its link opens a "verified" page.

**Backend**
- [ ] Outbox (AD-030): `notifications.outbox_message`, written in the same transaction as the business change.
- [ ] **Send right away, retry on the tick.** After the transaction commits, try to dispatch immediately in the background; the tick job only retries failures. Otherwise sign-up emails could wait up to 5 minutes.
- [ ] SMTP sender (Mailpit locally, the provider from M2-01 on staging). Templates per language with fr-CA and en-CA date formats (FR-262).
- [ ] Verification token: single use, expires after 24 hours (FR-004). Resending is rate limited.

**Frontend**
- [ ] Verify page, "resend email" action, and an unverified-account screen after sign-in.

**Tests**
- [ ] An email provider outage still commits the sign-up, and the tick delivers the email later.
- [ ] Expired and reused links are refused with distinct codes.

**Done when**
- [ ] Sign up → email → click → verified works end to end on staging.

## M2-04 · Sign in, sign out, lockout and rate limits
labels: type:feature, stack:full, area:auth, payslip-readiness, size:M
depends: M2-03
spec: FR-007, AD-045, 12.3

**Goal.** Signing in is safe against guessing, and sessions can be ended from anywhere.

**You will see.** A sign-in page, a signed-in area, a sign-out button, and "sign out of all devices" in settings.

**Backend**
- [ ] Identity lockout after 5 failures for 15 minutes. Built-in ASP.NET Core rate limiter, partitioned by IP and by email. In-memory is fine because the app runs at most one replica.
- [ ] `GET /api/me` returns the signed-in user, their memberships and their language.
- [ ] Signing out deletes the server-side session; "sign out of all devices" deletes all of that user's sessions.

**Frontend**
- [ ] Route guards: signed-out users go to sign-in and return to where they were afterwards. A 401 anywhere shows "your session ended".

**Tests**
- [ ] The lockout threshold; rate-limit responses carry a code and `Retry-After`; a revoked session stops working on its very next request.

**Done when**
- [ ] Signing out on the phone and then choosing "sign out of all devices" on the laptop ends both sessions.

## M2-05 · Forgot password and reset
labels: type:feature, stack:full, area:auth, size:S
depends: M2-04
spec: FR-005, FR-007

**Goal.** Philippe's staff can recover their accounts without asking anyone.

**Backend**
- [ ] The request always answers the same way, whether or not the account exists. It is rate limited.
- [ ] Token valid 45 minutes, single use. A successful reset ends every other session.

**Frontend**
- [ ] Forgot and reset pages (new password plus confirmation), with the same password rules as sign-up.

**Tests**
- [ ] Reused and expired tokens are refused; other sessions are revoked after a reset.

**Done when**
- [ ] A reset on staging signs out the other browser.

## M2-06 · Step-up confirmation for sensitive actions
labels: type:feature, stack:full, area:auth, area:security, payslip-readiness, size:S
depends: M2-04
spec: AD-044, 12.7

**Goal.** Sensitive actions require the password to have been confirmed within the last 10 minutes.

**Backend**
- [ ] `POST /api/auth/confirm-password` stamps the session with a confirmation time.
- [ ] A reusable `RequireRecentConfirmation()` endpoint filter returns 403 with code `auth.step_up_required` when the stamp is missing or older than 10 minutes.

**Frontend**
- [ ] The API client catches `auth.step_up_required`, opens a password dialog, and retries the original request once the password is confirmed.

**Tests**
- [ ] The filter at the boundary (9 and 11 minutes, using a fake clock); the stamp is per session, not per user.

**Done when**
- [ ] The first action to use it (email change, M2-07) prompts once, then not again for 10 minutes.

## M2-07 · Profile, language and email change
labels: type:feature, stack:full, area:auth, area:i18n, size:S
depends: M2-06
spec: FR-008, FR-261, FR-262, AD-044

**Goal.** People control their name, language and email.

**You will see.** A profile screen. Changing the language switches the interface immediately and is remembered on every device.

**Backend**
- [ ] Update the name and language. The language chooses the email templates and push text from now on (FR-261).
- [ ] Changing the email requires step-up, sends a verification link to the new address, and notifies the old address. The change applies only after verification.

**Frontend**
- [ ] The language setting replaces the local switcher's default once signed in.

**Done when**
- [ ] Switching to English on the phone shows English on the laptop after refresh.

## M2-08 · Two-factor authentication with an authenticator app
labels: type:feature, stack:full, area:auth, area:security, payslip-readiness, size:M
depends: M2-06
spec: AD-043, 12.7

**Goal.** Optional two-factor for everyone now; mandatory later for anyone handling payslips.

**You will see.** Settings → Security: scan a QR code, enter a code, save ten recovery codes. Signing in then asks for a code.

**Backend**
- [ ] Identity's built-in TOTP authenticator support. Recovery codes are shown once and stored hashed.
- [ ] Turning two-factor off requires step-up. The sign-in challenge is rate limited.

**Frontend**
- [ ] QR generated locally, never by a third-party service. The secret key is also shown as text for manual entry.

**Tests**
- [ ] A valid code, a wrong code, a used recovery code, and turning it off without step-up.

**Done when**
- [ ] Sign-in with an authenticator app works on staging, and a recovery code works exactly once.

## M2-09 · Create a workplace and invite its owner
labels: type:feature, stack:full, area:workplace, size:L
depends: M2-04
spec: FR-030, FR-031, FR-032, FR-039, FR-042, AD-001, 5.2

**Goal.** Only the platform admin can create a workplace, and the real owner becomes owner through a single-use invitation (`docs/decisions/0008`).

**You will see.** After sign-in, the workplace list: empty with a "Join with a code" button for most people. For the platform admin, a "Create workplace" wizard (name, address, time zone, default America/Toronto) that ends by showing the owner invitation link.

**Backend**
- [ ] Workplaces module, `workplaces` schema: `workplace`, `membership` (user_id, role, status, and more), `owner_invitation` (token stored hashed, expires after 7 days, single use).
- [ ] `Quart.Api grant-platform-admin <email>` command, run once through the job infrastructure. There is no configuration flag and no UI for it.
- [ ] Accepting the invitation, as any signed-in, verified account, creates the owner membership. The platform admin can revoke and reissue an unused invitation but never becomes a member (5.2).

**Frontend**
- [ ] Workplace list as the landing screen; choosing a workplace sets the context for every other screen.

**Tests**
- [ ] A non-platform-admin cannot create a workplace; an invitation cannot be accepted twice or after expiry; the platform admin has no membership afterwards.

**Done when**
- [ ] On staging, you create Presotea and Philippe's test account accepts the invitation and sees itself as owner.

## M2-10 · Named permissions and the authorization guard
labels: type:feature, stack:full, area:auth, area:security, payslip-readiness, size:L
depends: M2-09
spec: AD-026, AD-027, AD-042, 5.3, 5.5, NFR-014

**Goal.** Code asks "does this member hold ManageSchedule here?", never "is this an admin?". Every request resolves the caller's membership first.

**Backend**
- [ ] `Permission` enum and an `IWorkplaceAccess` contract in `Quart.SharedKernel`, implemented by the Workplaces module, so other modules can check permissions without referencing it.
- [ ] Role bundles from 5.5 plus a `membership_permission` table for individual grants.
- [ ] `RequirePermission(Permission.X)` endpoint filter: reads the workplace ID from the route, loads the active membership, and returns 404 for non-members (never confirm that a workplace exists) and 403 for members who lack the permission.
- [ ] Lab endpoints now also require the platform admin.

**Frontend**
- [ ] `useWorkplace()` exposes the current membership and its permissions. Controls a member cannot use are hidden, and the server still refuses them.

**Tests** (the suite AD-027 requires, extended by every later milestone)
- [ ] Parameterised over every workplace-scoped endpoint: a member of another workplace gets 404, an employee gets 403 on admin endpoints, and a removed member gets 404.
- [ ] A test that fails when a new endpoint is added without a permission requirement or an explicit `AllowAnyMember()` marker.

**Done when**
- [ ] The suite runs in CI, and adding an unguarded endpoint makes it fail.

## M2-11 · Join a workplace with a code, a link or a QR code
labels: type:feature, stack:full, area:workplace, size:M
depends: M2-10
spec: FR-033, FR-034, FR-007, AD-044

**Goal.** Staff join Presotea in seconds.

**You will see.** A "Join" screen accepting a 10-character code (for example PRESTEA24X). Admins see the code, a share link, and a QR code that pre-fills the join screen, plus a "Regenerate code" action.

**Backend**
- [ ] Codes are 10 characters from uppercase letters and digits without look-alikes (no 0, O, 1, I, L), matched case-insensitively, and generated with a cryptographic random source.
- [ ] Join attempts are rate limited per user and per IP. Regenerating needs step-up and invalidates the old code immediately.
- [ ] Optional workplace setting "require approval": joiners wait as `pending` until an admin approves (FR-034).

**Frontend**
- [ ] QR rendered locally. `/join/:code` pre-fills the form. Admins get an approval list when approval is on.

**Tests**
- [ ] Look-alike characters never appear in 10,000 generated codes; an old code fails after regeneration; pending members have no access.

**Done when**
- [ ] A second test account joins Presotea on staging by scanning the QR code with a phone.

## M2-12 · Members screen: levels, "I work shifts too", desired hours
labels: type:feature, stack:full, area:workplace, size:M
depends: M2-10
spec: FR-035, FR-036, FR-037, FR-040, 5.4

**Goal.** Philippe sets what the generator needs to know about each person.

**You will see.** A team list with each person's name, level and email. Admins can edit level (1–3), "works shifts", desired weekly hours and an optional maximum.

**Backend**
- [ ] Only ManageLevels holders change levels; employees can never change any level, including their own (5.4).
- [ ] Coworkers see name, level and contact email only (FR-040).

**Frontend**
- [ ] Level shown with text as well as colour. Editing happens in a sheet on phones and a side panel on desktop.

**Tests**
- [ ] An employee changing their own level gets 403; the response for coworkers contains no other fields.

**Done when**
- [ ] Philippe's test account can set up the whole seed team from a phone.

## M2-13 · Admins, permission grants and ownership transfer
labels: type:feature, stack:full, area:workplace, area:security, size:M
depends: M2-12, M2-06
spec: FR-041, 5.3, 5.5, AD-044

**Goal.** More than one admin, individual permission grants, and a safe handover of ownership.

**Backend**
- [ ] Promote or demote admins (owner only). Grant or revoke an individual permission (owner only, step-up). Every change is audited (the full audit log arrives in M5-12; until then, log a structured event).
- [ ] Ownership transfer to another admin: the current owner starts it with step-up, the new owner accepts, and the old owner becomes an admin.

**Frontend**
- [ ] Role and permission controls in the member panel, visible to the owner only.

**Tests**
- [ ] An admin cannot promote; a transfer cannot target a non-admin; exactly one owner exists after a transfer.

**Done when**
- [ ] Ownership can be passed to a second account and back on staging.

## M2-14 · In-app notifications inbox
labels: type:feature, stack:full, area:notifications, payslip-readiness, size:M
depends: M2-10
spec: FR-210, FR-215, FR-216, FR-261, FR-263, 12.7

**Goal.** One place where every notification lands, with the rule against sensitive content enforced in one spot.

**You will see.** A bell with an unread count in the top bar, a list, and "mark all read". The first notification types: a join request awaiting approval (to admins) and a member joined.

**Backend**
- [ ] `INotifier` contract in `Quart.SharedKernel`; the Notifications module stores rows (membership, type, parameters, read_at).
- [ ] The server stores a type plus whitelisted parameters, never text. The web app renders text from translations (FR-263); emails render server-side in the recipient's language.
- [ ] **FR-216 in one place**: each type declares its allowed parameter names. A test enumerates every type and fails on names such as `comment`, `body`, `amount` or `file`.

**Frontend**
- [ ] The inbox refetches when the app returns to the foreground (`docs/decisions/0005`).

**Tests**
- [ ] A member only ever sees their own notifications; the content-rule test above.

**Done when**
- [ ] Approving a join request on staging notifies both sides.

## M2-15 · Leave a workplace or remove a member
labels: type:feature, stack:full, area:workplace, size:S
depends: M2-14
spec: FR-038, AD-017

**Goal.** Access ends the moment someone leaves.

**Backend**
- [ ] Leave (self) and remove (ManageMembers). The membership becomes inactive, and its access fails on the next request.
- [ ] Publish a `MemberLeft` integration event through the outbox. The Scheduling module consumes it in M5-10 to release future shifts. Admins get a notification.

**Frontend**
- [ ] Confirmation dialogs; a removed person sees the workplace disappear from their list.

**Tests**
- [ ] A removed member gets 404 on every workplace endpoint (the M2-10 suite covers it).

**Done when**
- [ ] Removing a test account on staging locks it out immediately.

## M2-16 · Delete my account
labels: type:feature, stack:full, area:auth, area:privacy, size:S
depends: M2-15
spec: FR-009, 13

**Goal.** People can leave Quart entirely, and history stays readable.

**Backend**
- [ ] Requires step-up. Deletes the profile, sessions and two-factor secrets, and leaves every membership (which triggers `MemberLeft`).
- [ ] Past schedules show "Former employee" and posts show "Former member". Resolve names at read time, so no copy of the name survives in other modules.
- [ ] An owner must transfer ownership first.

**Tests**
- [ ] The email can be reused for a new account afterwards; no table in any schema still holds the old name or email.

**Done when**
- [ ] A deleted test account shows as "Former employee" wherever it appeared.
