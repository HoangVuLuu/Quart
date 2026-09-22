---
milestone: M8 — News and push
description: >-
  Demo: Philippe posts a recipe with three photos from his phone. Staff get a push notification
  on their home-screen app, open the News tab, view the photos full screen and thumbs-up the post.
  A removed member's old photo link no longer works. This milestone also completes the file and
  offline foundations payslips will need.
---

## M8-01 · News tab with text posts
labels: type:feature, stack:full, area:news, size:M
depends: M6-12
spec: FR-230, FR-231, FR-235, FR-238, AD-046

**Goal.** Philippe's announcements have their own home.

**You will see.** A News tab listing posts, newest first. Admins get a composer; posts can be edited (marked "edited") and deleted. The Home card previews the latest post.

**Backend**
- [ ] Announcements module, `announcements` schema: `announcement` (workplace, author, body, edited_at, deleted_at). Posting needs PostAnnouncements.
- [ ] Bodies are plain text with line breaks; links are made clickable client-side. Never rendered as HTML (AD-046).
- [ ] Kept until an admin deletes them (FR-238). Authors who delete their account show as "Former member" (FR-009).

**Done when**
- [ ] Admin posts appear for every member on staging, in the order posted.

## M8-02 · Stored files: one model, one validation path, short-lived links
labels: type:feature, stack:full, area:files, area:security, payslip-readiness, size:L
depends: M8-01
spec: AD-017, AD-034, AD-047, NFR-015, 12.7

**Goal.** Every uploaded file goes through one gate and one link issuer, so adding payslips later means adding a file kind, not a second file system.

**Backend**
- [ ] Files module: `stored_file` (workplace, scope `workplace | member`, subject membership, kind, storage key, content type, size, sha256, created_by, deleted_at).
- [ ] Upload through the API only (AD-034): check permission, detect the type from the **first bytes** (never the name or the declared type), enforce size limits, refuse SVG outright, and only then write to a **private** Supabase Storage bucket.
- [ ] One `IssueLink(fileId)` path: check the scope for the caller every time, then return a link valid for **5 minutes**, served with `Cache-Control: no-store` and a strict content type. Rate limited per user.
- [ ] Add the storage domain to the CSP `img-src` (AD-046).

**Tests** (NFR-015, all must be refused)
- [ ] A member of another workplace; a removed member; an employee asking for another member's member-scoped file; an expired link; a PNG renamed to `.pdf` or the reverse; an SVG upload.

**Done when**
- [ ] The suite passes, and a file uploaded on staging is unreachable without a fresh link.

## M8-03 · Photos on posts, re-encoded on the server
labels: type:feature, stack:full, area:news, area:files, area:privacy, size:L
depends: M8-02
spec: FR-232, FR-233, FR-236, FR-237, Q-13

**Goal.** Recipe photos and screenshots, with location metadata removed before anything is stored.

**You will see.** Up to 6 photos per post, picked from the phone. Thumbnails in the feed; tap for a full-screen viewer with swipe and no download button (FR-236).

**Backend**
- [ ] Accept JPEG, PNG and WebP up to 10 MB each. Decode and re-encode every image with SkiaSharp: metadata stripped (including GPS), longest edge at most 2048 px, screenshots kept as PNG so text stays sharp, photos saved as JPEG (FR-233).
- [ ] **HEIC (Q-13).** Skia's HEIC decoding depends on platform codecs and may not work in the Linux container. Check first. If it does not work, choose between (a) setting `accept="image/jpeg,image/png,image/webp"` so iOS converts photos to JPEG before upload, and refusing HEIC with `files.unsupported_type`, or (b) adding an Apache-licensed decoder such as Magick.NET. Record the choice and update FR-232.
- [ ] Deleting a post deletes its files in the same operation (FR-235).

**Frontend**
- [ ] The browser shrinks photos before upload to save mobile data. The server never relies on that step.

**Tests**
- [ ] A fixture photo with GPS EXIF comes back with no metadata; a 6000 px image is resized to 2048 px.

**Done when**
- [ ] A photo taken on an iPhone posts from Safari, and the stored file has no location data.

## M8-04 · Thumbs-up reactions
labels: type:feature, stack:full, area:news, size:S
depends: M8-01
spec: FR-234

**Goal.** Acknowledge a post without a comment thread.

**Backend**
- [ ] `announcement_reaction` (announcement, membership), unique per pair; toggling is idempotent.

**Frontend**
- [ ] A thumbs-up button with a count and an accessible label ("12 people liked this").

**Done when**
- [ ] Reactions toggle on staging, and counts stay correct across two accounts.

## M8-05 · Installable app with an offline allowlist
labels: type:feature, stack:frontend, area:ui, area:security, payslip-readiness, size:M
depends: M8-03
spec: AD-040, NFR-006, FR-239, Q-09, 12.7

**Goal.** Quart installs to the Home Screen and opens instantly, and caches nothing sensitive on the phone.

**Frontend**
- [ ] `vite-plugin-pwa` using the `injectManifest` strategy (the push handler in M8-06 needs a custom service worker). Manifest, icons, and French and English names.
- [ ] The offline cache is an **allowlist**: the app shell and the user's own published shifts. Never storage files (photos, and later payslips), never `no-store` responses, never other people's data (AD-040).
- [ ] Offline: "My shifts" shows the last copy with its date; everything else explains that it needs a connection.

**Tests**
- [ ] A test enumerates the service worker's cache rules and fails if a storage-domain or API path outside the allowlist is cached.

**Done when**
- [ ] With airplane mode on, an installed iPhone app shows the user's shifts and no photos.

## M8-06 · Web push, end to end, with the iPhone install guide
labels: type:feature, stack:full, area:notifications, size:L
depends: M8-05, M2-14
spec: FR-210, FR-212, FR-216, NFR-012

**Goal.** Notifications reach the lock screen.

**You will see.** On first sign-in on an iPhone in Safari: a short guide (Share → Add to Home Screen → open from the icon → Turn on notifications). On other devices: a "Turn on notifications" prompt after the first meaningful action, never on first load.

**Backend**
- [ ] VAPID keys as secrets; `push_subscription` per device; a push sender (for example the MIT-licensed `Lib.Net.Http.WebPush`) delivering through the outbox. Expired subscriptions (HTTP 404 or 410) are deleted.
- [ ] Push text comes from the same type-plus-parameters and FR-216 rule as in-app notifications, in the recipient's language.
- [ ] Email fallback (FR-211) stops for people with an active subscription, per preference.

**Done when**
- [ ] Publishing an update on staging produces a lock-screen notification on an installed iPhone app.

## M8-07 · Notification bundling and preferences
labels: type:feature, stack:full, area:notifications, size:M
depends: M8-06
spec: FR-213, FR-215, FR-211

**Goal.** Five edits in ten minutes produce one notification, not five.

**Backend**
- [ ] Group notifications of the same type for the same recipient within a window (for example 10 minutes) before push or email goes out. In-app rows can merge the same way.
- [ ] New-post notifications to all members use the same path (FR-215).
- [ ] Per-user preferences: push and email per category, within what the spec allows.

**Tests**
- [ ] Five schedule edits within the window → one push and one email; one after the window → a second.

**Done when**
- [ ] Rapid edits on staging produce a single notification per affected person.

## M8-08 · File access test suite and link leak checks
labels: type:chore, area:files, area:security, stack:backend, size:S
depends: M8-03
spec: NFR-015, AD-046, AD-047, AD-027

**Goal.** Lock in every file rule with tests, before payslips raise the stakes.

**Tasks**
- [ ] Extend the M8-02 suite across every file endpoint, and add it to the authorization suite from M2-10.
- [ ] Confirm `Referrer-Policy: no-referrer` stops links leaking to other sites, and that links are never logged.

**Done when**
- [ ] The suite is part of CI, and adding a new file endpoint without it fails a test.

## M8-09 · Back up storage files and review payslip readiness
labels: type:chore, area:security, area:infra, payslip-readiness, size:S
depends: M8-08, M6-08
spec: 12.7, 11.5, 12.5

**Goal.** Close out every item on the payslip readiness checklist.

**Tasks**
- [ ] Add storage files to the encrypted nightly backup from M6-08, and repeat the restore drill.
- [ ] Walk through the 13 items in spec 12.7 and link the issue or code that implements each. Open issues for any gaps.

**Done when**
- [ ] Every item in 12.7 has a link, and the storage restore drill succeeds.
