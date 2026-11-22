# 0015. Web push with Lib.Net.Http.WebPush

- Status: Accepted
- Date: 2026-11-22
- Spec: FR-211, FR-212, FR-216, NFR-012

## Context

Notifications should reach the lock screen (M8-06). A web push message must be signed with the server's
VAPID key and encrypted for the browser (RFC 8291, aes128gcm) before it is posted to the push service the
browser chose. Writing that by hand is easy to get subtly wrong; decision 0007 asks for a maintained,
permissively licensed package.

## Options

- **Lib.Net.Http.WebPush 3.3.1** (MIT, Tomasz Pęczek; releases 2024-10 and 2025-03). On .NET 6 and later it
  depends only on its sibling Lib.Net.Http.EncryptedContentEncoding and uses .NET's own cryptography. It
  takes our `HttpClient`, so we decide redirects and timeouts, and reports the push service's status code.
- **WebPush 1.0.13** (web-push-csharp, Mozilla Public License 2.0; one release since 2021). Depends on
  Portable.BouncyCastle, a package its own authors no longer maintain.

## Decision

Lib.Net.Http.WebPush, behind our `IPushSender` interface (`WebPushSender`), so tests use a stand-in and the
library could be swapped in one file.

- The HTTP client never follows redirects and has a 15-second timeout; the library's own wait on 429 is
  off. A message goes to the endpoint the browser gave, or nowhere.
- 404 and 410 delete the subscription; 400, 403 and 413 drop the message; anything else is retried by the
  job runner (about a day, background-jobs.md).
- Keys are settings `Push:PublicKey`, `Push:PrivateKey` and `Push:Subject`, made once per environment by
  `dotnet Quart.Api.dll push-keys` and kept as secrets. Without both keys, push is off: the key route answers
  `push.off` and nothing is sent.
- The message carries the alert's type, its whitelisted parameters (FR-216) and the recipient's language;
  the service worker writes the same sentence as the Alerts tab (Hoang chose the full alert over a generic
  one, 2026-11-22). It is encrypted end to end: the push service cannot read it.

## Consequences

One small dependency, with no BouncyCastle. Pushes leave with the tick, so they arrive up to 5 minutes after
the alert, like emails. If the package stops being maintained, `WebPushSender` is the only file to replace.
