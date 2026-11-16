#!/usr/bin/env bash
# Starts everything needed to try Quart on this computer and on a phone on the same Wi-Fi:
# Postgres and Mailpit in Docker, the API, and the web app. Stop it all with Ctrl+C.
# How to use it: docs/runbooks/local.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

# This computer's address on the Wi-Fi, so a phone can open the app and the links in emails work there too.
ADDRESS="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"
ADDRESS="${ADDRESS:-localhost}"

docker compose up -d --wait
[ -d src/web/node_modules ] || (cd src/web && npm ci)

# Emailed links (verify email, reset password) point at the address the phone can reach.
export Email__PublicUrl="http://${ADDRESS}:5173"

trap 'kill 0' EXIT
dotnet run --project src/backend/Quart.Api --launch-profile http &
(cd src/web && npm run dev -- --host) &

cat <<MESSAGE

  Quart is starting. In a few seconds:

    On this computer   http://localhost:5173
    On your phone      http://${ADDRESS}:5173   (same Wi-Fi)
    Emails (Mailpit)   http://localhost:8025    (on a phone: http://${ADDRESS}:8025)

  First time? In a second terminal:  node scripts/dev/seed.mjs
  Ctrl+C stops everything.

MESSAGE
wait
