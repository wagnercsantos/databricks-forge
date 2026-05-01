# Quick Start

Deploy Databricks Forge to your workspace in three steps.

## Prerequisites

- A Databricks workspace with a SQL Warehouse
- [Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html) installed and authenticated

```bash
# Install the CLI (if not already installed)
brew install databricks   # macOS
# or: curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh

# Authenticate
databricks auth login --host https://your-workspace.cloud.databricks.com
```

## Deploy

```bash
git clone https://github.com/althrussell/databricks-forge.git
cd databricks-forge
./deploy.sh
```

The script discovers your SQL Warehouses, lets you pick one, and handles
everything else automatically -- resource bindings, user authorization scopes,
code upload, and deployment. The premium model defaults to
`databricks-claude-opus-4-7` and the fast model to `databricks-claude-sonnet-4-6`.

No manual configuration steps. Zero UI clicks.

## Redeploy

Run `./deploy.sh` again. It detects the existing app and updates it.

## Remove

```bash
./deploy.sh --destroy
```

## Advanced options

All flags are optional. Combine as needed.

### Core

| Flag | Description |
|------|-------------|
| `--app-name "name"` | Custom app name for multi-instance deployments. Isolates the Databricks App and Lakebase database. Default: `databricks-forge` |
| `--warehouse "Name"` | Skip the interactive warehouse prompt |
| `--profile "name"` | Use a specific Databricks CLI profile |
| `--zero-egress` | Build locally, package as split archive (no npm install on target) |
| `--full` | Full sync: upload all files. Default is diff sync (only changed files since last deploy) |
| `--destroy` | Remove the app and clean up workspace files |

### Model endpoints

| Flag | Default |
|------|---------|
| `--endpoint "name"` | `databricks-claude-opus-4-7` (premium/reasoning) |
| `--fast-endpoint "name"` | `databricks-claude-sonnet-4-6` (fast/classification) |
| `--embedding-endpoint "name"` | `databricks-qwen3-embedding-0-6b` (1024-dim) |
| `--review-endpoint "name"` | `databricks-gpt-5-4` (SQL quality review) |
| `--reasoning-endpoint-2 "name"` | `databricks-gemini-3-flash` (secondary reasoning) |
| `--generation-endpoint "name"` | `databricks-llama-4-maverick` (dedicated generation) |
| `--sql-endpoint "name"` | *(none)* (optional SQL/codex endpoint) |
| `--lightweight-endpoint "name"` | `databricks-gemini-3-1-flash-lite` (lightweight/classification) |
| `--allowed-models "a,b,c"` | Restrict the model pool to only these models |
| `--skip-probe` | Skip deploy-time model availability probing (use defaults as-is) |

Models are automatically probed at deploy time. If a preferred model is unavailable
in your region/cloud, the script silently falls back to the best alternative.
Use `--skip-probe` to bypass this check.

### Lakebase (database)

| Flag | Description |
|------|-------------|
| `--lakebase-auth-mode "oauth\|native_password"` | Runtime DB auth mode |
| `--lakebase-native-user "user"` | Native DB user (requires `native_password` mode) |
| `--lakebase-native-password "pw"` | Native DB password (requires `native_password` mode) |
| `--rotate-lakebase-native-password` | Auto-generate and rotate a 48-char password |
| `--print-generated-native-password` | Print the generated password (use with caution) |
| `--lakebase-bootstrap-user "email"` | Bootstrap OAuth role/grants for this user at startup |
| `--lakebase-runtime-mode "oauth_direct_only\|pooler_preferred"` | Connection routing strategy |
| `--lakebase-enable-pooler-experiment` | Enable pooler for future testing |
| `--lakebase-scale-to-zero-timeout SECONDS` | Scale-to-zero inactivity timeout (default: 300, min: 60) |
| `--lakebase-no-scale-to-zero` | Disable scale-to-zero (always-on compute) |

### Feature flags

| Flag | Description |
|------|-------------|
| `--enable-demo-mode` | Enable Demo Mode for Field Engineering / Sales demos |
| `--enable-metric-views` | Enable metric view generation |
| `--enable-fabric` | Enable Fabric / Power BI features |

### Benchmark catalog

| Flag | Description |
|------|-------------|
| `--seed-benchmarks` | Seed benchmark catalog from `data/benchmark/*.json` at startup |
| `--seed-benchmarks-all-industries` | Also generate baseline records for all outcome-map industries |
| `--seed-benchmark-industries "banking,hls,rcg"` | Seed only these industry IDs |
| `--benchmark-admins "a@co.com,b@co.com"` | Restrict benchmark management to these emails. If unset, all authenticated users can manage benchmarks. |

### Examples

```bash
# Non-interactive deploy with a specific warehouse
./deploy.sh --warehouse "My SQL Warehouse"

# Custom model endpoints
./deploy.sh --endpoint "my-custom-model" --fast-endpoint "my-fast-model" --review-endpoint "my-review-model"

# Seed benchmarks for banking and healthcare
./deploy.sh --seed-benchmarks --seed-benchmark-industries "banking,hls"

# Lock benchmark admin to specific users
./deploy.sh --benchmark-admins "alice@company.com,bob@company.com"

# Full production deploy with native password auth + benchmarks
./deploy.sh \
  --warehouse "Production Warehouse" \
  --lakebase-auth-mode native_password \
  --rotate-lakebase-native-password \
  --seed-benchmarks-all-industries \
  --benchmark-admins "data-team@company.com"

# Deploy a separate demo instance (isolated app + database)
./deploy.sh --app-name "forge-demo" --warehouse "Demo Warehouse"

# Deploy multiple instances side by side
./deploy.sh --app-name "forge-banking-demo" --seed-benchmark-industries "banking"
./deploy.sh --app-name "forge-hls-demo" --seed-benchmark-industries "hls"

# Remove a named instance
./deploy.sh --app-name "forge-demo" --destroy
```

---

## Local Development (No Serverless Egress)

For environments that restrict serverless egress or when you want to test
locally before deploying, Forge can run on your machine pointing at a remote
Databricks workspace. No PAT or long-lived credentials are stored on disk.

### Prerequisites

- **[Node.js 20+](https://nodejs.org)** -- download the LTS installer for your
  OS, or use a version manager:
  ```bash
  # macOS (Homebrew)
  brew install node@20

  # Any OS (nvm -- recommended if you manage multiple Node versions)
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  nvm install 20
  ```
  Verify with `node -v` (should print `v20.x.x` or higher) and `npm -v`.

- **[Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html)** installed
- A **SQL Warehouse** (Serverless or Pro) in the target workspace

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/althrussell/databricks-forge.git
cd databricks-forge

# 2. Install dependencies (downloads all required packages -- takes ~60s first time)
npm install

# 3. One-time: browser-based OAuth login (opens your browser)
databricks auth login --host https://your-workspace.cloud.databricks.com

# 4. Provision Lakebase, select warehouse, write .env.local
bash .deploy_local.sh

# 5. Start dev server
npm run dev
```

Open **http://localhost:3000** in your browser. The first page load takes
10-15 seconds while Next.js compiles. You should see the Forge dashboard.

The app authenticates via the Databricks CLI's OAuth session -- tokens are
short-lived and auto-refresh. If your session expires, run
`databricks auth login` again.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full architecture details,
manual setup, and troubleshooting.

---

### Manual benchmark seeding (local dev)

```bash
# Seed curated packs from data/benchmark/*.json
npm run seed:benchmarks

# Seed all industries (generate missing baseline records)
npm run seed:benchmarks:all-industries

# Seed a specific set of industries
FORGE_SEED_BENCHMARK_INDUSTRIES="banking,hls" npm run seed:benchmarks:industries
```

For local development setup and architecture details, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
