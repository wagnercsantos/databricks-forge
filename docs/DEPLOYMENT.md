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

Lakebase is **auto-provisioned by default** — no flags required:

```bash
# Zero-touch: deploy.sh creates a per-app Lakebase project, default
# branch, databricks_postgres database, pgvector + databricks_auth
# extensions, and grants the app SP the right public schema privileges.
./deploy.sh

# Bind an existing Lakebase project instead of auto-provisioning
./deploy.sh \
  --lakebase-branch   "projects/my-project/branches/production" \
  --lakebase-database "projects/my-project/branches/production/databases/databricks_postgres"

# Latency-critical deploy: disable scale-to-zero (keeps the DB warm)
./deploy.sh --lakebase-scale-to-zero-seconds 0
```

To remove the app (prompts about the Lakebase project):

```bash
./deploy.sh --destroy
```

Non-interactive cleanup:

```bash
./deploy.sh --destroy --keep-database     # preserve the project (default in CI)
./deploy.sh --destroy --destroy-database  # soft-delete (recoverable)
./deploy.sh --destroy --purge-database    # hard-delete (immediate, unrecoverable)
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
3. Creates the Databricks App (or detects an existing one)
4. **Resolves the Lakebase binding**: discovers an existing `postgres`
   resource on the app, else auto-provisions a per-app Lakebase project,
   default `databricks_postgres` database, and waits for the endpoint to
   become `ACTIVE`
5. Configures scale-to-zero on the branch (`300s` default on
   auto-provisioned projects)
6. Binds resources (SQL warehouse, serving endpoints, Postgres) and
   user authorization scopes via the Apps API `create-update` endpoint
7. **Bootstraps Postgres grants** for the app's service principal:
   installs `pgvector` + `databricks_auth` as the project owner, ensures
   the SP role exists, grants `CONNECT`/`USAGE`/`CREATE`/table/sequence
   privileges + default privileges, and transfers ownership of any
   pre-existing `public.*` tables to the SP so Prisma can ALTER/DROP them
8. Optionally grants the deploying user the same Postgres role (default
   on auto-provisioned deploys) so they get SQL Editor access immediately
9. Syncs the project source code to a workspace folder
10. Deploys the app from that workspace folder

No manual UI configuration is needed. The script handles everything.

### Lakebase auto-provisioning

By default, `./deploy.sh` is **zero-touch** for Lakebase: it derives a
per-app project ID from `--app-name` (sanitized to `[a-z0-9-]{1,63}`),
auto-creates the project, default branch, and `databricks_postgres`
database, then re-uses the same binding on every subsequent re-deploy.

Power-user overrides (rarely needed):

- `--lakebase-project-id ID` — override the auto-derived project ID
  (still auto-creates if missing). Useful when running multiple apps
  against the same project (not recommended; see "Per-app isolation").
- `--lakebase-branch <path> --lakebase-database <path>` — bind an
  existing, externally-managed project/branch/database. Disables
  auto-provisioning.
- `--lakebase-scale-to-zero-seconds N` — branch inactivity timeout
  before scale-to-zero. Default `300` on auto-provisioned projects;
  `0` disables (always-on, latency-critical prod); minimum `60`.
  Re-deploys against an existing branch leave the value alone unless
  this flag is explicitly passed.
- `--lakebase-bootstrap-user EMAIL` — grant a specific Databricks user
  the same Postgres role as the app SP. Defaults to the deploying user
  when `deploy.sh` auto-provisions the project. Pass `""` to opt out.

### Destroy / cleanup

`./deploy.sh --destroy` removes the Databricks App, then **prompts**
about deleting the associated Lakebase project. Default is *keep*
(data preservation wins over convenience).

Non-interactive flags:

- `--destroy-database` — soft-delete the Lakebase project (recoverable).
- `--purge-database` — hard-delete (immediate, unrecoverable). Implies
  `--destroy-database`.
- `--keep-database` — skip the prompt, preserve the project (default in
  non-interactive contexts like CI without a TTY).

### Per-app isolation

Each `--app-name` deploys to its own Databricks App AND its own
auto-provisioned Lakebase project (named after the app). Demos and dev
instances are completely isolated from production:

```bash
./deploy.sh                              # → app: databricks-forge / project: databricks-forge
./deploy.sh --app-name forge-demo        # → app: forge-demo      / project: forge-demo
```

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

## Zero-Egress Deployment

For workspaces that **block serverless egress** (no `npm install` capability),
use the `--zero-egress` flag. This builds the app locally, compresses it into
a split archive, and uploads only ~6 files to the workspace.

```bash
./deploy.sh --zero-egress --warehouse "My Warehouse"
```

### How it works

1. `npm run build` runs locally (prisma generate + next build)
2. The Next.js standalone output is assembled with the Prisma CLI and Linux
   schema engine binary (downloaded from Prisma CDN)
3. Non-runtime files are aggressively pruned (.map, .nft.json, docs, macOS
   binaries)
4. No `package.json` is included -- prevents the platform from running
   `npm install`
5. The bundle is compressed (`tar.gz`) and split into <10MB chunks (Databricks
   Apps per-file limit)
6. A minimal wrapper is uploaded: `app.yaml`, `bootstrap.sh`, archive chunks,
   and a `.prebuilt` marker

At startup, `bootstrap.sh` reassembles the archive, extracts it, and hands
off to the normal `scripts/start.sh` flow.

| Metric | Source mode | Zero-egress mode |
|--------|-----------|-----------------|
| Files uploaded | ~4,400 | ~6 |
| Upload size | ~100 MB (uncompressed) | ~26 MB (compressed) |
| Requires egress | Yes (`npm install`) | No |
| Build location | Platform | Local machine |

---

## Build and Start Sequence (Source Mode)

Databricks Apps builds the application from `package.json`. No Dockerfile is
needed -- the platform handles containerisation.

1. `npm install` (runs `postinstall` which triggers `prisma generate`)
2. `npm run build` (runs `prisma generate && next build && sh scripts/postbuild.sh`)
3. `scripts/start.sh`:
   - Mints a short-lived Lakebase OAuth credential as the app SP
   - Runs `prisma db push` to sync the Postgres schema (the SP grants
     applied by `deploy.sh` make this succeed on first deploy)
   - Confirms `pgvector` is installed (no-op — `deploy.sh` already
     installed it as the project owner)
   - Optionally grants the `LAKEBASE_BOOTSTRAP_USER` the same Postgres
     role as the SP so they can open the SQL Editor against the database
   - Starts the Next.js standalone server on `DATABRICKS_APP_PORT`

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
