# Deployment Guide

## Quick Deploy (Recommended)

The supported deployment path is the interactive deploy script. It discovers
your resources, creates the app, uploads code, and deploys -- all in one
command with a single prompt (which SQL Warehouse to use).

```bash
./deploy.sh
```

Models default to `databricks-claude-sonnet-4-6` for both premium and fast
endpoints. Override with flags if needed:

```bash
./deploy.sh --warehouse "My Warehouse" --endpoint "my-model" --fast-endpoint "my-fast-model"
```

Native password auth and rotation examples:

```bash
# Default deployment path (repo startup default is native_password)
./deploy.sh

# Rotate native DB password during deploy
./deploy.sh --rotate-lakebase-native-password

# Provide explicit native password (non-rotating)
./deploy.sh --lakebase-auth-mode native_password --lakebase-native-user forge_app_runtime --lakebase-native-password "<password>"

# Emergency rollback to OAuth runtime mode
./deploy.sh --lakebase-auth-mode oauth
```

To remove the app:

```bash
./deploy.sh --destroy
```

See [QUICKSTART.md](../QUICKSTART.md) for the full three-step setup.

---

## How It Works

Databricks Forge is deployed as a **Databricks App** -- a containerised web
application that runs inside a Databricks workspace with automatic
authentication.

### What `deploy.sh` does

1. Validates the Databricks CLI is installed and authenticated
2. Lists SQL Warehouses and lets you pick one
3. Creates the app (or detects an existing one)
4. Binds resources (SQL warehouse, serving endpoints) and sets user
   authorization scopes via the Apps API `create-update` endpoint
5. Syncs the project source code to a workspace folder
6. Deploys the app from that workspace folder

No manual UI configuration is needed. The script handles everything.

### Lakebase auth/secret controls

Use `deploy.sh` to keep auth and password lifecycle auditable:

- `--lakebase-auth-mode native_password|oauth` (optional override)
- `--lakebase-native-user <user>` (requires native mode)
- `--lakebase-native-password <password>` (requires native mode)
- `--rotate-lakebase-native-password` (native mode only; generates and applies a new password)
- `--print-generated-native-password` (only with rotate; use with caution)

Validation rules enforced by the script:

- Native user/password flags require `native_password` mode.
- Rotate cannot be combined with explicit `--lakebase-native-password`.
- Print-generated-password requires rotate.

### Resource bindings

The script binds three resources to the app via the API. The `app.yaml`
references these using `valueFrom:` keys, which the platform resolves to
environment variables at runtime.

| Resource key | Type | Default | Permission |
|---|---|---|---|
| `sql-warehouse` | SQL Warehouse | Customer-selected | CAN_USE |
| `serving-endpoint` | Serving Endpoint | `databricks-claude-sonnet-4-6` | CAN_QUERY |
| `serving-endpoint-fast` | Serving Endpoint | `databricks-claude-sonnet-4-6` | CAN_QUERY |

### User authorization scopes

The script configures these OAuth scopes so the app can act on behalf of the
logged-in user, enforcing their Unity Catalog permissions:

| Scope | Purpose |
|---|---|
| `sql` | Execute SQL via warehouse |
| `catalog.tables:read` | Read tables in Unity Catalog |
| `catalog.schemas:read` | Read schemas in Unity Catalog |
| `catalog.catalogs:read` | Read catalogs in Unity Catalog |
| `files.files` | Manage files and directories |
| `dashboards.genie` | Manage Genie Spaces (create, update, trash as user) |

### Platform-injected variables

These are set automatically by the Databricks Apps platform at runtime:

| Variable | Description |
|---|---|
| `DATABRICKS_HOST` | Workspace URL |
| `DATABRICKS_CLIENT_ID` | OAuth client ID (app service principal) |
| `DATABRICKS_CLIENT_SECRET` | OAuth client secret |
| `DATABRICKS_APP_PORT` | Port the app must listen on |

---

## Build and Start Sequence

Databricks Apps builds the application from `package.json`. No Dockerfile is
needed -- the platform handles containerisation.

1. `npm install` (runs `postinstall` which triggers `prisma generate`)
2. `npm run build` (runs `prisma generate && next build && sh scripts/postbuild.sh`)
3. `scripts/start.sh`:
   - Auto-provisions Lakebase Autoscale (if `DATABRICKS_CLIENT_ID` is set)
   - Uses the direct endpoint for startup DDL/schema sync
   - Bootstraps native runtime DB role/password/grants in `native_password` mode
   - Passes pooler runtime metadata (`LAKEBASE_ENDPOINT_NAME`, `LAKEBASE_POOLER_HOST`, `LAKEBASE_USERNAME`) plus auth mode/runtime credentials to the server
   - Starts the Next.js standalone server on `DATABRICKS_APP_PORT`

### Rotation runbook

1. Rotate:
   - `./deploy.sh --rotate-lakebase-native-password`
2. Verify runtime mode and health:
   - `curl -s "$APP_URL/api/health" | jq '.authRuntime'`
3. Confirm logs show:
   - `Client created (native password mode)`
   - pooler host + `forge_app_runtime`
4. Rollback (if needed):
   - `./deploy.sh --lakebase-auth-mode oauth`

---

## Local Development

Local development is designed for two scenarios:

1. **No serverless egress** -- workspaces that restrict outbound traffic from
   Databricks Apps (e.g. private-link environments where you cannot deploy an
   app but can still reach the workspace APIs from your machine).
2. **Development and testing** -- iterate on UI, prompts, or pipeline logic
   locally before deploying.

### Prerequisites

- **[Node.js 20+](https://nodejs.org)** and npm -- if you've never installed
  Node, download the LTS installer from https://nodejs.org, or:
  ```bash
  # macOS
  brew install node@20
  # Any OS with nvm
  nvm install 20
  ```
  Verify: `node -v` should print `v20.x.x` or higher. `npm -v` should also work.
- **[Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html)** installed
- A **SQL Warehouse** (Serverless or Pro) in the target workspace
- Your workspace must support **Lakebase Autoscaling** (available in
  `us-east-1`, `us-east-2`, `us-west-2`, `ca-central-1`, `sa-east-1`,
  `eu-central-1`, `eu-west-1`, `eu-west-2`, `ap-south-1`, `ap-southeast-1`,
  `ap-southeast-2`)

### Quick Setup (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/althrussell/databricks-forge.git
cd databricks-forge

# 2. Install dependencies (downloads all required packages -- takes ~60s first time)
npm install

# 3. One-time: browser-based OAuth login (opens your browser, no PAT created)
databricks auth login --host https://your-workspace.cloud.databricks.com

# 4. Provision Lakebase, select warehouse, write .env.local
bash .deploy_local.sh

# 5. Start dev server (runs prisma generate + next dev with Turbopack)
npm run dev
```

Open **http://localhost:3000** in your browser. The first page load takes
10-15 seconds while Next.js compiles the app. You should see the Forge
dashboard with a sidebar and a "New Discovery Run" button.

### What `.deploy_local.sh` Does

The script is idempotent -- safe to re-run at any time.

1. **Verifies CLI authentication** via `databricks current-user me`
2. **Selects a SQL Warehouse** (interactive prompt or `--warehouse "Name"`)
3. **Provisions a Lakebase project** (`databricks postgres create-project`)
   with scale-to-zero enabled by default
4. **Discovers the branch and endpoint** for the project
5. **Generates a short-lived DB credential** to run initial setup SQL
6. **Creates the `vector` extension** (pgvector for embeddings)
7. **Pushes the Prisma schema** (`npx prisma db push`)
8. **Creates a native password role** (`forge_local_dev`) for stable
   credentials that do not expire during dev sessions
9. **Resolves your email** from the CLI session
10. **Writes `.env.local`** with all required config (no PAT or token stored)

**Flags:**

| Flag | Description |
|------|-------------|
| `--profile "name"` | Use a named Databricks CLI profile (multi-workspace setups) |
| `--warehouse "Name"` | Skip the interactive warehouse prompt |
| `--project-id "id"` | Custom Lakebase project ID (default: `forge-local`) |

### Authentication Architecture

Local dev uses a different auth model than the deployed Databricks App:

| Concern | Databricks App | Local Dev |
|---------|---------------|-----------|
| **Databricks API auth** | OBO user token (from proxy header) or SP OAuth | Databricks CLI OAuth U2M (`databricks auth token`) |
| **Auth credential storage** | Platform-injected, no files | None on disk -- CLI manages token cache |
| **User identity** | `x-forwarded-email` header | `FORGE_LOCAL_USER_EMAIL` env var |
| **Lakebase auth** | Auto-provisioned OAuth or native password with SP credential rotation | Native password (`forge_local_dev`) via `DATABASE_URL` |
| **Token refresh** | Automatic (platform / SP OAuth) | Automatic (CLI refreshes OAuth tokens; re-run `databricks auth login` if session expires) |

The auth priority chain in `lib/dbx/client.ts`:

1. **OBO header** -- `x-forwarded-access-token` (Databricks Apps only)
2. **PAT** -- `DATABRICKS_TOKEN` env var (optional explicit override)
3. **CLI OAuth U2M** -- `databricks auth token` (primary local dev path)
4. **SP OAuth M2M** -- `DATABRICKS_CLIENT_ID` / `SECRET` (Databricks Apps)

### Manual Setup (Without `.deploy_local.sh`)

If you prefer manual control or already have a Lakebase project:

1. **Authenticate:**
   ```bash
   databricks auth login --host https://your-workspace.cloud.databricks.com
   ```

2. **Create a Lakebase project** (skip if you have one):
   ```bash
   databricks postgres create-project forge-local \
     --json '{"spec": {"display_name": "Forge Local Dev"}}'
   ```

3. **Get your endpoint host:**
   ```bash
   databricks postgres list-branches projects/forge-local
   # Note the branch ID, then:
   databricks postgres list-endpoints projects/forge-local/branches/<branch_id>
   databricks postgres get-endpoint projects/forge-local/branches/<branch_id>/endpoints/<endpoint_id>
   ```

4. **Generate a credential and connect with psql** to create extensions and
   roles, or set up `DATABASE_URL` and run `npx prisma db push`.

5. **Create `.env.local`** (see `.env.local.example` for all options):
   ```env
   DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
   DATABRICKS_WAREHOUSE_ID=your_warehouse_id
   DATABASE_URL=postgresql://user:pass@host/databricks_postgres?sslmode=require&uselibpqcompat=true
   FORGE_LOCAL_USER_EMAIL=your.email@company.com
   DATABRICKS_APP_PORT=3000
   ```

6. **Start:**
   ```bash
   npm run dev
   ```

### Limitations vs Deployed App

| Feature | Deployed App | Local Dev |
|---------|-------------|-----------|
| Multi-user (OBO) | Each user runs queries as themselves | Single user context (your CLI identity) |
| Resource bindings | `app.yaml` `valueFrom:` | `.env.local` env vars |
| Credential rotation | Automatic (SP-managed, proactive refresh) | Native password (stable, no rotation) |
| Scale-to-zero management | `scripts/start.sh` manages endpoint lifecycle | Inherits default (endpoint auto-suspends) |
| HTTPS | Platform-provided | `http://localhost:3000` |

### Troubleshooting

**"No authentication credentials found"**
Your CLI session has expired. Run:
```bash
databricks auth login --host https://your-workspace.cloud.databricks.com
```

**Lakebase endpoint not ready / connection timeout**
After creating a new project or waking from scale-to-zero, the endpoint can
take 30-60 seconds to become available. Re-run `.deploy_local.sh` or wait and
retry `npm run dev`.

**`@/lib/generated/prisma/client` import errors**
The Prisma client was not generated. `npm run dev` runs `prisma generate`
automatically, but if you see this error from another command, run:
```bash
npx prisma generate
```

**Conversations show "not authenticated" / benchmark admin returns 403**
`FORGE_LOCAL_USER_EMAIL` is not set in `.env.local`. Run `.deploy_local.sh` or
add it manually.

**Embeddings / Ask Forge RAG not working**
Set `DATABRICKS_EMBEDDING_ENDPOINT` in `.env.local`:
```env
DATABRICKS_EMBEDDING_ENDPOINT=databricks-qwen3-embedding-0-6b
```

---

## CI/CD

Recommended pipeline:

1. **Lint** -- `npm run lint`
2. **Type check** -- `npm run typecheck`
3. **Test** -- `npm test`
4. **Build** -- `npm run build`
5. **Deploy** -- `./deploy.sh --warehouse "Production Warehouse"`
