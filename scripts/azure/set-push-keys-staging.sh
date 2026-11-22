#!/usr/bin/env bash
# Turns web push on for staging (M8-06): makes a VAPID key pair and stores it as Container App secrets on the
# app and on the tick job (which sends the pushes). The private key is never printed or written to a file.
# Run once, from the repository root, after `az login` with Quart's subscription:
#   ./scripts/azure/set-push-keys-staging.sh
# Running it again makes new keys: every phone then has to turn push on again (docs/runbooks/staging.md).
set -euo pipefail
RESOURCE_GROUP="rg-quart-staging"
APP="quart-staging"
TICK_JOB="quart-staging-tick"

read -r -p "Contact email the push services may write to (for example your own): " CONTACT
[[ "$CONTACT" == *@* ]] || { echo "Stopped: that does not look like an email address."; exit 1; }

KEYS=$(dotnet run --project src/backend/Quart.Api -c Release -- push-keys)
PUBLIC_KEY=$(sed -n 's/^Push__PublicKey=//p' <<<"$KEYS")
PRIVATE_KEY=$(sed -n 's/^Push__PrivateKey=//p' <<<"$KEYS")
unset KEYS
[[ -n "$PUBLIC_KEY" && -n "$PRIVATE_KEY" ]] || { echo "Stopped: the keys could not be made."; exit 1; }

SECRETS=("push-public-key=${PUBLIC_KEY}" "push-private-key=${PRIVATE_KEY}")
ENV_VARS=("Push__PublicKey=secretref:push-public-key" "Push__PrivateKey=secretref:push-private-key" "Push__Subject=mailto:${CONTACT}")

echo "== The app ${APP}"
az containerapp secret set -g "$RESOURCE_GROUP" -n "$APP" --secrets "${SECRETS[@]}" --output none
az containerapp update -g "$RESOURCE_GROUP" -n "$APP" --set-env-vars "${ENV_VARS[@]}" --output none

echo "== The tick job ${TICK_JOB}"
az containerapp job secret set -g "$RESOURCE_GROUP" -n "$TICK_JOB" --secrets "${SECRETS[@]}" --output none
az containerapp job update -g "$RESOURCE_GROUP" -n "$TICK_JOB" --set-env-vars "${ENV_VARS[@]}" --output none

unset PRIVATE_KEY SECRETS
echo "Push is on for staging. Public key: ${PUBLIC_KEY}"
