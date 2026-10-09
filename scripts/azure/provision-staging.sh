#!/usr/bin/env bash
# Creates the staging environment in Azure and connects it to GitHub (issue M0-07).
# Every step is explained in docs/runbooks/staging.md. Safe to run again: existing resources are kept.
#
# Before running:
#   1. The Supabase project quart-staging exists (runbook, step 1).
#   2. `az login` with the account that owns Quart's subscription, and `gh auth status` works.
# Run from the repository root, in an interactive terminal:
#   ./scripts/azure/provision-staging.sh
set -euo pipefail

REPO="HoangVuLuu/Quart"
LOCATION="canadaeast"                   # Quebec City (spec 10.3, 12.1)
RESOURCE_GROUP="rg-quart-staging"
WORKSPACE="log-quart-staging"
ENVIRONMENT="cae-quart-staging"
APP="quart-staging"
MIGRATE_JOB="quart-staging-migrate"
TICK_JOB="quart-staging-tick"
ENTRA_APP="github-quart-staging"
# Placeholder until M0-09 deploys the real image. Listens on 8080, like ours.
PLACEHOLDER_IMAGE="mcr.microsoft.com/dotnet/samples:aspnetapp"
# Placeholder for the scheduled tick job until the next deploy: Microsoft's sample job image, which exits at
# once. The web placeholder above would never exit and would run until the replica timeout every 5 minutes.
PLACEHOLDER_JOB_IMAGE="mcr.microsoft.com/k8se/quickstart-jobs:latest"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "0. Check the Azure account"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
az account show --query '{subscription:name, user:user.name}' -o table
read -r -p "Is this Quart's own subscription (not a work or school one)? [y/N] " answer
[[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Stopped. Run 'az login' with the right account, then 'az account set --subscription <name>'."; exit 1; }

step "1. Database connection (Supabase session pooler)"
echo "From Supabase: Connect > Session pooler. Example host: aws-0-ca-central-1.pooler.supabase.com"
read -r -p "Pooler host: " DB_HOST
read -r -p "User (looks like postgres.abcdefghijklmnop): " DB_USER
read -r -s -p "Database password (hidden): " DB_PASSWORD; echo
CONNECTION_STRING="Host=${DB_HOST};Port=5432;Database=postgres;Username=${DB_USER};Password=${DB_PASSWORD};SSL Mode=Require;Timeout=15"

step "2. Register the Azure services this subscription uses"
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az extension add --name containerapp --upgrade --only-show-errors

step "3. Resource group ${RESOURCE_GROUP} in ${LOCATION}"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

step "4. Log Analytics: 30-day retention, 0.1 GB/day cap (spec 10.3: no surprise log bill)"
az monitor log-analytics workspace create --resource-group "$RESOURCE_GROUP" --workspace-name "$WORKSPACE" \
  --location "$LOCATION" --retention-time 30 --quota 0.1 --output none
WORKSPACE_ID=$(az monitor log-analytics workspace show -g "$RESOURCE_GROUP" -n "$WORKSPACE" --query customerId -o tsv)
WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys -g "$RESOURCE_GROUP" -n "$WORKSPACE" --query primarySharedKey -o tsv)

step "5. Container Apps environment ${ENVIRONMENT}"
if ! az containerapp env show -g "$RESOURCE_GROUP" -n "$ENVIRONMENT" --output none 2>/dev/null; then
  az containerapp env create --resource-group "$RESOURCE_GROUP" --name "$ENVIRONMENT" --location "$LOCATION" \
    --logs-destination log-analytics --logs-workspace-id "$WORKSPACE_ID" --logs-workspace-key "$WORKSPACE_KEY" --output none
fi

step "6. Container app ${APP}: port 8080, 0-1 replica, 0.25 vCPU / 0.5 GiB"
# The connection string is a Container App secret, never stored in GitHub.
if ! az containerapp show -g "$RESOURCE_GROUP" -n "$APP" --output none 2>/dev/null; then
  az containerapp create --resource-group "$RESOURCE_GROUP" --name "$APP" --environment "$ENVIRONMENT" \
    --image "$PLACEHOLDER_IMAGE" --ingress external --target-port 8080 \
    --min-replicas 0 --max-replicas 1 --cpu 0.25 --memory 0.5Gi \
    --secrets "db-connection=${CONNECTION_STRING}" \
    --env-vars "ConnectionStrings__Quart=secretref:db-connection" "ASPNETCORE_ENVIRONMENT=Staging" \
    --output none
else
  az containerapp secret set -g "$RESOURCE_GROUP" -n "$APP" --secrets "db-connection=${CONNECTION_STRING}" --output none
fi

step "6b. Container Apps job ${MIGRATE_JOB}: the same image with the 'migrate' argument, started by hand or by the deploy"
# Runs `dotnet Quart.Api.dll migrate` and exits (docs/runbooks/migrations.md). No retries: a failed
# migration stops the deploy instead of being attempted again. M0-09's deploy sets the real image.
if ! az containerapp job show -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB" --output none 2>/dev/null; then
  az containerapp job create --resource-group "$RESOURCE_GROUP" --name "$MIGRATE_JOB" --environment "$ENVIRONMENT" \
    --trigger-type Manual --replica-timeout 600 --replica-retry-limit 0 --parallelism 1 --replica-completion-count 1 \
    --image "$PLACEHOLDER_IMAGE" --args "migrate" --cpu 0.25 --memory 0.5Gi \
    --secrets "db-connection=${CONNECTION_STRING}" \
    --env-vars "ConnectionStrings__Quart=secretref:db-connection" "ASPNETCORE_ENVIRONMENT=Staging" \
    --output none
else
  az containerapp job secret set -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB" --secrets "db-connection=${CONNECTION_STRING}" --output none
fi

step "6c. Container Apps job ${TICK_JOB}: the same image with the 'tick' argument, every 5 minutes"
# Runs `dotnet Quart.Api.dll tick` and exits (docs/runbooks/background-jobs.md, decision 0009): the web app
# stays asleep. No retries: the next tick comes 5 minutes later anyway. The timeout stays under the jobs'
# 10-minute lock. The deploy sets the real image; until then the placeholder exits straight away.
if ! az containerapp job show -g "$RESOURCE_GROUP" -n "$TICK_JOB" --output none 2>/dev/null; then
  az containerapp job create --resource-group "$RESOURCE_GROUP" --name "$TICK_JOB" --environment "$ENVIRONMENT" \
    --trigger-type Schedule --cron-expression "*/5 * * * *" \
    --replica-timeout 300 --replica-retry-limit 0 --parallelism 1 --replica-completion-count 1 \
    --image "$PLACEHOLDER_JOB_IMAGE" --args "tick" --cpu 0.25 --memory 0.5Gi \
    --secrets "db-connection=${CONNECTION_STRING}" \
    --env-vars "ConnectionStrings__Quart=secretref:db-connection" "ASPNETCORE_ENVIRONMENT=Staging" \
    --output none
else
  az containerapp job secret set -g "$RESOURCE_GROUP" -n "$TICK_JOB" --secrets "db-connection=${CONNECTION_STRING}" --output none
fi
unset DB_PASSWORD CONNECTION_STRING
FQDN=$(az containerapp show -g "$RESOURCE_GROUP" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)

step "7. Entra app ${ENTRA_APP}: GitHub's staging environment signs in without a password (AD-061)"
CLIENT_ID=$(az ad app list --display-name "$ENTRA_APP" --query '[0].appId' -o tsv)
if [[ -z "$CLIENT_ID" ]]; then
  CLIENT_ID=$(az ad app create --display-name "$ENTRA_APP" --query appId -o tsv)
fi
az ad sp show --id "$CLIENT_ID" --output none 2>/dev/null || az ad sp create --id "$CLIENT_ID" --output none
# The subject must match GitHub's token exactly. Newer repositories use an ID-based prefix
# (repo:Owner@<id>/Repo@<id>), so ask GitHub for the prefix instead of assuming one.
SUBJECT_PREFIX=$(gh api "repos/${REPO}/actions/oidc/customization/sub" --jq '.sub_claim_prefix // empty')
SUBJECT="${SUBJECT_PREFIX:-repo:${REPO}}:environment:staging"
CREDENTIAL="{
  \"name\": \"github-staging\",
  \"issuer\": \"https://token.actions.githubusercontent.com\",
  \"subject\": \"${SUBJECT}\",
  \"audiences\": [\"api://AzureADTokenExchange\"]
}"
if [[ -z "$(az ad app federated-credential list --id "$CLIENT_ID" --query "[?name=='github-staging'].name" -o tsv)" ]]; then
  az ad app federated-credential create --id "$CLIENT_ID" --parameters "$CREDENTIAL" --output none
else
  az ad app federated-credential update --id "$CLIENT_ID" --federated-credential-id github-staging \
    --parameters "$CREDENTIAL" --output none
fi
echo "Federated credential subject: ${SUBJECT}"
PRINCIPAL_ID=$(az ad sp show --id "$CLIENT_ID" --query id -o tsv)
# Contributor on the staging resource group only, never the whole subscription.
az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role Contributor --scope "$(az group show -n "$RESOURCE_GROUP" --query id -o tsv)" --output none

step "8. GitHub environment 'staging' with the three Azure IDs"
gh api --method PUT "repos/${REPO}/environments/staging" --silent
gh secret set AZURE_CLIENT_ID --env staging --repo "$REPO" --body "$CLIENT_ID"
gh secret set AZURE_TENANT_ID --env staging --repo "$REPO" --body "$TENANT_ID"
gh secret set AZURE_SUBSCRIPTION_ID --env staging --repo "$REPO" --body "$SUBSCRIPTION_ID"

step "Done"
echo "Staging answers at: https://${FQDN}"
echo "The first request can take ~20 seconds while the app wakes from zero replicas."
