# Staging environment

How the staging environment is built, so it can be rebuilt from this page alone (issue M0-07).
Staging is where Philippe tries the app, with fake data only (spec 11.2). Everything stays in Quebec
(12.1): the database in Montreal, the app in Quebec City.

| Piece              | Name                                       | Where                           |
| ------------------ | ------------------------------------------ | ------------------------------- |
| Database           | Supabase project `quart-staging`           | Canada (Central), Montreal      |
| Resource group     | `rg-quart-staging`                         | Azure `canadaeast`, Quebec City |
| Logs               | Log Analytics `log-quart-staging`          | same resource group             |
| Container Apps env | `cae-quart-staging`                        | same resource group             |
| The app            | Container app `quart-staging`              | same resource group             |
| Migrations         | Container Apps job `quart-staging-migrate` | same resource group             |
| Deploy identity    | Entra app `github-quart-staging`           | Contributor on the group only   |
| GitHub side        | Environment `staging`                      | repository settings             |

## Before you start

- Two-factor is on for GitHub, Azure and Supabase, and the $1 budget alert exists
  ([accounts.md](accounts.md)).
- The Azure CLI and GitHub CLI are installed and signed in:

  ```bash
  brew install azure-cli
  az login                     # use the account that owns Quart's subscription
  az account show -o table     # check the subscription is Quart's, not a work or school one
  gh auth status
  ```

## 1. Supabase project (in the dashboard)

1. <https://supabase.com/dashboard> → **New project**.
2. Name `quart-staging`, region **Canada (Central)**, free plan.
3. Generate a database password with letters and digits only (a `;` would break the connection
   string). Keep it in a password manager; you need it once more, in step 2.
4. When the project is ready: **Connect** → **Session pooler**. Note the **host**
   (`aws-0-ca-central-1.pooler.supabase.com` or similar) and the **user** (`postgres.<project-ref>`).

Use the **session pooler**, not the direct connection: on the free plan the direct connection is
IPv6 only, and Azure Container Apps reaches the internet over IPv4. Check both facts in the
dashboard's Connect panel before relying on them; they are Supabase's to change.

## 2. Azure and GitHub (one script)

From the repository root, in a normal terminal (it asks questions):

```bash
./scripts/azure/provision-staging.sh
```

`scripts/azure/provision-staging.sh` is the record of every command. It can be run again safely. What it
does, step by step:

| Step | What                                                                                                                                                 | Why                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0    | Shows the signed-in subscription and asks you to confirm it                                                                                          | Never create Quart's resources in someone else's subscription                              |
| 1    | Asks for the pooler host, user and password (hidden)                                                                                                 | Builds the connection string; it never touches a file or GitHub                            |
| 2    | Registers `Microsoft.App` and `Microsoft.OperationalInsights`                                                                                        | A new subscription must opt in to each service once                                        |
| 3    | Resource group `rg-quart-staging` in `canadaeast`                                                                                                    | Quebec City                                                                                |
| 4    | Log Analytics, **30-day retention, 0.1 GB/day cap**                                                                                                  | Default logging is the classic surprise bill (spec 10.3)                                   |
| 5    | Container Apps environment (Consumption)                                                                                                             | Billed only while running, inside the free monthly grant                                   |
| 6    | App `quart-staging`: external ingress on **8080**, **0–1 replica**, 0.25 vCPU / 0.5 GiB, placeholder image                                           | Sleeps when nobody uses it; M0-09 replaces the image                                       |
| 6    | Secret `db-connection` → `ConnectionStrings__Quart`; `ASPNETCORE_ENVIRONMENT=Staging`                                                                | The connection string lives only in Azure                                                  |
| 6b   | Job `quart-staging-migrate`: manual trigger, same image with the `migrate` argument, no retries, same secret                                         | Migrations run once, before the new version takes traffic ([migrations.md](migrations.md)) |
| 7    | Entra app `github-quart-staging` with a federated credential for `repo:HoangVuLuu/Quart:environment:staging`, Contributor on the resource group only | GitHub deploys without any stored password (AD-061)                                        |
| 8    | GitHub environment `staging` with secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`                                              | What the deploy workflow (M0-09) signs in with                                             |

It ends by printing the app's address. Staging's is
<https://quart-staging.blackdune-c9d0ed85.canadaeast.azurecontainerapps.io> (created 2026-10-01); a
rebuilt environment gets a new random part and this line must be updated.

## 3. Check it

- Open the printed address. The first request takes up to ~20 seconds while the app wakes from zero
  replicas; the placeholder page is Microsoft's ASP.NET sample.
- After 48 hours, Azure **Cost Management** → **Cost analysis** for `rg-quart-staging` shows **$0**.

## Changing things later

- **New database password:** reset it in Supabase, then run the script again; it updates the secret.
- **Turn logs up for a while:** add `Serilog__MinimumLevel__Default=Information` as an environment
  variable on the container app, and remove it when done (decision 0012).
- **Tear it all down:** `az group delete --name rg-quart-staging`, then delete the Entra app
  `github-quart-staging`, the GitHub environment `staging` and the Supabase project.
