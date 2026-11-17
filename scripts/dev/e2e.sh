#!/usr/bin/env bash
# Runs the browser tests (tests/e2e, M6-09) on this computer, from an empty database, in Chromium and
# WebKit at phone size. Needs Docker Desktop running. Extra arguments go to Playwright, for example:
#   scripts/dev/e2e.sh --project webkit     only Safari's engine
#   scripts/dev/e2e.sh --headed             watch it happen
# A development server already running on port 5080 is left alone: the tests use port 5090 and their
# own database, quart_e2e.
set -euo pipefail
cd "$(dirname "$0")/../.."

docker compose up -d --wait
docker compose exec -T postgres dropdb --if-exists --force -U quart quart_e2e

dotnet build src/backend/Quart.Api --configuration Release
(cd src/web && { [ -d node_modules ] || npm ci; } && npm run build)

cd tests/e2e
[ -d node_modules ] || npm ci
npx playwright install chromium webkit
npx playwright test "$@"
