#!/usr/bin/env bash
# =========================================================================
# Databricks Forge — One-command deployment
#
# Usage:
#   ./deploy.sh                          Interactive (pick a warehouse)
#   ./deploy.sh --warehouse "Name"       Non-interactive
#   ./deploy.sh --zero-egress             Build locally, package as split archive (no npm install on target)
#   ./deploy.sh --full                   Full sync (default: diff sync — only changed files)
#   ./deploy.sh --profile "my-profile"   Use a specific CLI profile
#   ./deploy.sh --app-name "forge-demo"  Deploy as a separate named instance
#   ./deploy.sh --destroy                Remove the app
#
# Override model endpoints (advanced):
#   ./deploy.sh --endpoint "model" --fast-endpoint "fast-model" --review-endpoint "review-model"
#   ./deploy.sh --reasoning-endpoint-2 "model" --generation-endpoint "model" --sql-endpoint "model"
#   ./deploy.sh --allowed-models "model1,model2"
# Optional Lakebase bootstrap grants:
#   ./deploy.sh --lakebase-bootstrap-user "user@company.com"
# Optional Lakebase runtime auth mode:
#   ./deploy.sh --lakebase-auth-mode "oauth|native_password"
#               --lakebase-native-user "forge_app_runtime"
#               --lakebase-native-password "..."
#               --rotate-lakebase-native-password
# Optional Lakebase OAuth runtime behavior:
#   ./deploy.sh --lakebase-runtime-mode "oauth_direct_only|pooler_preferred"
#               --lakebase-enable-pooler-experiment
# Optional Lakebase scale-to-zero (enabled by default, 300s timeout):
#   ./deploy.sh --lakebase-scale-to-zero-timeout 600
#               --lakebase-no-scale-to-zero
# Optional benchmark seeding behavior:
#   ./deploy.sh --seed-benchmarks --seed-benchmarks-all-industries
#               --seed-benchmark-industries "banking,hls,rcg"
# Optional benchmark admin restriction:
#   ./deploy.sh --benchmark-admins "alice@company.com,bob@company.com"
# Optional metric views (disabled by default):
#   ./deploy.sh --enable-metric-views
# Optional Fabric / Power BI features (disabled by default):
#   ./deploy.sh --enable-fabric
# Optional Demo Mode for Field Engineering / Sales (disabled by default):
#   ./deploy.sh --enable-demo-mode
# Optional cost governance (both fields are optional; applied only when set):
#   ./deploy.sh --budget-policy-id "<policy-id>"
#               --tag team=data-eng --tag cost-center=1234
# =========================================================================

set -euo pipefail

# -------------------------------------------------------------------------
# Defaults
# -------------------------------------------------------------------------
APP_NAME="databricks-forge"
APP_DESC="Discover AI-powered use cases from Unity Catalog metadata"
DEFAULT_ENDPOINT="databricks-claude-opus-4-6"
DEFAULT_FAST_ENDPOINT="databricks-claude-sonnet-4-6"
DEFAULT_EMBEDDING_ENDPOINT="databricks-qwen3-embedding-0-6b"
DEFAULT_REVIEW_ENDPOINT="databricks-gpt-5-4"
DEFAULT_REASONING_ENDPOINT_2="databricks-gemini-3-flash"
DEFAULT_GENERATION_ENDPOINT="databricks-llama-4-maverick"
DEFAULT_SQL_ENDPOINT=""
DEFAULT_LIGHTWEIGHT_ENDPOINT="databricks-gemini-3-1-flash-lite"

# -------------------------------------------------------------------------
# State (populated during execution)
# -------------------------------------------------------------------------
USER_EMAIL=""
DATABRICKS_HOST=""
WAREHOUSE_ID=""
WAREHOUSE_NAME=""
WORKSPACE_PATH=""

# -------------------------------------------------------------------------
# Parse arguments
# -------------------------------------------------------------------------
ARG_APP_NAME=""
ARG_WAREHOUSE=""
ARG_PROFILE=""
ARG_ENDPOINT=""
ARG_FAST_ENDPOINT=""
ARG_EMBEDDING_ENDPOINT=""
ARG_REVIEW_ENDPOINT=""
ARG_REASONING_ENDPOINT_2=""
ARG_GENERATION_ENDPOINT=""
ARG_SQL_ENDPOINT=""
ARG_LIGHTWEIGHT_ENDPOINT=""
ARG_ALLOWED_MODELS=""
ARG_LAKEBASE_BOOTSTRAP_USER=""
ARG_LAKEBASE_AUTH_MODE=""
ARG_LAKEBASE_NATIVE_USER=""
ARG_LAKEBASE_NATIVE_PASSWORD=""
ARG_ROTATE_LAKEBASE_NATIVE_PASSWORD=false
ARG_PRINT_GENERATED_NATIVE_PASSWORD=false
ARG_LAKEBASE_RUNTIME_MODE=""
ARG_LAKEBASE_ENABLE_POOLER_EXPERIMENT=false
ARG_LAKEBASE_SCALE_TO_ZERO_TIMEOUT=""
ARG_LAKEBASE_NO_SCALE_TO_ZERO=false
ARG_SEED_BENCHMARKS=false
ARG_SEED_BENCHMARKS_ALL_INDUSTRIES=false
ARG_SEED_BENCHMARK_INDUSTRIES=""
ARG_BENCHMARK_ADMINS=""
ARG_ENABLE_METRIC_VIEWS=false
ARG_ENABLE_FABRIC=false
ARG_ENABLE_DEMO_MODE=false
ARG_SKIP_PROBE=false
ARG_ZERO_EGRESS=false
ARG_FULL_SYNC=false
ARG_DESTROY=false
ARG_BUDGET_POLICY_ID=""
ARG_TAGS=()

print_usage() {
  cat <<'USAGE'
Databricks Forge — One-command deployment

Usage:
  ./deploy.sh                                  Interactive deployment
  ./deploy.sh --warehouse "My Warehouse"       Skip warehouse prompt
  ./deploy.sh --profile "my-profile"           Use a specific CLI profile
  ./deploy.sh --destroy                        Remove the app

Options:
  --app-name NAME        Custom app name for multi-instance deployments.
                         Isolates the Databricks App and Lakebase database.
                         (default: databricks-forge)
  --warehouse NAME        SQL Warehouse name (skips interactive prompt)
  --profile NAME         Databricks CLI profile name
  --endpoint NAME             Premium model endpoint    (default: databricks-claude-opus-4-6)
  --fast-endpoint NAME        Fast model endpoint       (default: databricks-claude-sonnet-4-6)
  --embedding-endpoint NAME   Embedding model endpoint  (default: databricks-qwen3-embedding-0-6b)
  --review-endpoint NAME      Review model endpoint     (default: databricks-gpt-5-4)
  --reasoning-endpoint-2 NAME Optional second reasoning model for parallel routing
  --generation-endpoint NAME  Optional generation model endpoint
  --sql-endpoint NAME         Optional SQL/codex model endpoint
  --lightweight-endpoint NAME Optional lightweight/fast-classification model endpoint
  --allowed-models CSV        Comma-separated list of models the app may use
  --lakebase-bootstrap-user EMAIL
                             Optional Databricks user email to bootstrap
                             Lakebase OAuth role/grants during startup
  --lakebase-auth-mode MODE
                             Optional auth mode override:
                             native_password or oauth
  --lakebase-native-user USER
                             Optional native runtime DB user override
  --lakebase-native-password PASSWORD
                             Optional native runtime DB password override
  --rotate-lakebase-native-password
                             Generate and rotate native DB password at deploy time
  --print-generated-native-password
                             Print generated native password (use with caution)
  --lakebase-runtime-mode MODE
                             Lakebase runtime mode:
                             oauth_direct_only (default), pooler_preferred
  --lakebase-enable-pooler-experiment
                             Enables pooler attempts for future testing
  --lakebase-scale-to-zero-timeout SECONDS
                             Scale-to-zero inactivity timeout in seconds
                             (default: 300, minimum: 60)
  --lakebase-no-scale-to-zero
                             Explicitly disable scale-to-zero (always-on compute)
  --seed-benchmarks          Seed benchmark catalog during app startup
  --seed-benchmarks-all-industries
                             Include generated baseline records for every
                             industry in lib/domain/industry-outcomes/
  --seed-benchmark-industries CSV
                             Seed only these industry ids (e.g. banking,hls).
                             Applies to curated packs and generated baselines.
  --benchmark-admins CSV     Comma-separated emails allowed to manage benchmarks.
                             If unset, all authenticated users can manage them.
  --enable-metric-views      Enable metric view generation (off by default)
  --enable-fabric            Enable Fabric / Power BI features (off by default)
  --enable-demo-mode         Enable Demo Mode for FE/Sales (off by default)
  --budget-policy-id ID      Optional serverless budget policy ID to attach
                             to the Databricks App and the Lakebase project
                             for cost attribution. Applied at create time
                             and reconciled on every subsequent deploy.
  --tag KEY=VALUE             Optional custom tag (repeatable) applied to the
                             Databricks App and the Lakebase project for
                             cost attribution. Example:
                             --tag team=data-eng --tag cost-center=1234
                             Passing --tag at least once opts in to tag
                             management. In that case, two default tags
                             are injected unless overridden with --tag
                             <same-key>=<value>:
                               project=databricks_forge
                               owner=<user running the deploy>
                             To opt out of a specific default (e.g. when a
                             workspace tag policy rejects its value), pass
                             an empty value: --tag project=
                             When --tag is not passed at all, no tags are
                             applied and existing tags on either the App or
                             the Lakebase project are left untouched.
                             App tags are written via the workspace
                             tag-assignments endpoint; Lakebase project tags
                             via FORGE_CUSTOM_TAGS at runtime.
  --skip-probe                Skip model availability probing (use defaults without checking).
                             Useful for air-gapped workspaces or when probing is slow.
  --zero-egress               Build locally and package as a split archive.
                             Zero npm install required on the platform -- ideal for
                             workspaces that block serverless egress.
  --full                      Full sync: upload all files (slower, but guarantees clean state).
                             Default is diff sync: only upload changed files since last deploy.
  --destroy                   Remove the app and clean up workspace files
  -h, --help              Show this help message

Prerequisites:
  - Databricks CLI installed  (https://docs.databricks.com/dev-tools/cli/install.html)
  - Authenticated CLI profile (run: databricks auth login)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-name)       ARG_APP_NAME="$2"; shift 2 ;;
    --warehouse)      ARG_WAREHOUSE="$2"; shift 2 ;;
    --profile)        ARG_PROFILE="$2"; shift 2 ;;
    --endpoint)            ARG_ENDPOINT="$2"; shift 2 ;;
    --fast-endpoint)       ARG_FAST_ENDPOINT="$2"; shift 2 ;;
    --embedding-endpoint)  ARG_EMBEDDING_ENDPOINT="$2"; shift 2 ;;
    --review-endpoint)     ARG_REVIEW_ENDPOINT="$2"; shift 2 ;;
    --reasoning-endpoint-2) ARG_REASONING_ENDPOINT_2="$2"; shift 2 ;;
    --generation-endpoint) ARG_GENERATION_ENDPOINT="$2"; shift 2 ;;
    --sql-endpoint)        ARG_SQL_ENDPOINT="$2"; shift 2 ;;
    --lightweight-endpoint) ARG_LIGHTWEIGHT_ENDPOINT="$2"; shift 2 ;;
    --allowed-models)      ARG_ALLOWED_MODELS="$2"; shift 2 ;;
    --lakebase-bootstrap-user) ARG_LAKEBASE_BOOTSTRAP_USER="$2"; shift 2 ;;
    --lakebase-auth-mode) ARG_LAKEBASE_AUTH_MODE="$2"; shift 2 ;;
    --lakebase-native-user) ARG_LAKEBASE_NATIVE_USER="$2"; shift 2 ;;
    --lakebase-native-password) ARG_LAKEBASE_NATIVE_PASSWORD="$2"; shift 2 ;;
    --rotate-lakebase-native-password) ARG_ROTATE_LAKEBASE_NATIVE_PASSWORD=true; shift ;;
    --print-generated-native-password) ARG_PRINT_GENERATED_NATIVE_PASSWORD=true; shift ;;
    --lakebase-runtime-mode) ARG_LAKEBASE_RUNTIME_MODE="$2"; shift 2 ;;
    --lakebase-enable-pooler-experiment) ARG_LAKEBASE_ENABLE_POOLER_EXPERIMENT=true; shift ;;
    --lakebase-scale-to-zero-timeout) ARG_LAKEBASE_SCALE_TO_ZERO_TIMEOUT="$2"; shift 2 ;;
    --lakebase-no-scale-to-zero) ARG_LAKEBASE_NO_SCALE_TO_ZERO=true; shift ;;
    --seed-benchmarks) ARG_SEED_BENCHMARKS=true; shift ;;
    --seed-benchmarks-all-industries) ARG_SEED_BENCHMARKS_ALL_INDUSTRIES=true; shift ;;
    --seed-benchmark-industries) ARG_SEED_BENCHMARK_INDUSTRIES="$2"; shift 2 ;;
    --benchmark-admins) ARG_BENCHMARK_ADMINS="$2"; shift 2 ;;
    --enable-metric-views) ARG_ENABLE_METRIC_VIEWS=true; shift ;;
    --enable-fabric)       ARG_ENABLE_FABRIC=true; shift ;;
    --enable-demo-mode)    ARG_ENABLE_DEMO_MODE=true; shift ;;
    --budget-policy-id)    ARG_BUDGET_POLICY_ID="$2"; shift 2 ;;
    --tag)                 ARG_TAGS+=("$2"); shift 2 ;;
    --skip-probe)          ARG_SKIP_PROBE=true; shift ;;
    --zero-egress)         ARG_ZERO_EGRESS=true; shift ;;
    --full)                ARG_FULL_SYNC=true; shift ;;
    --destroy)             ARG_DESTROY=true; shift ;;
    -h|--help)        print_usage; exit 0 ;;
    *)                printf "\n  ERROR: Unknown flag: %s\n  Run ./deploy.sh --help\n\n" "$1" >&2; exit 1 ;;
  esac
done

if [[ -n "$ARG_APP_NAME" ]]; then
  APP_NAME="$ARG_APP_NAME"
fi

if [[ -n "$ARG_PROFILE" ]]; then
  export DATABRICKS_CONFIG_PROFILE="$ARG_PROFILE"
fi

ENDPOINT="${ARG_ENDPOINT:-$DEFAULT_ENDPOINT}"
FAST_ENDPOINT="${ARG_FAST_ENDPOINT:-$DEFAULT_FAST_ENDPOINT}"
EMBEDDING_ENDPOINT="${ARG_EMBEDDING_ENDPOINT:-$DEFAULT_EMBEDDING_ENDPOINT}"
REVIEW_ENDPOINT="${ARG_REVIEW_ENDPOINT:-$DEFAULT_REVIEW_ENDPOINT}"
REASONING_ENDPOINT_2="${ARG_REASONING_ENDPOINT_2:-$DEFAULT_REASONING_ENDPOINT_2}"
GENERATION_ENDPOINT="${ARG_GENERATION_ENDPOINT:-$DEFAULT_GENERATION_ENDPOINT}"
SQL_ENDPOINT="${ARG_SQL_ENDPOINT:-$DEFAULT_SQL_ENDPOINT}"
LIGHTWEIGHT_ENDPOINT="${ARG_LIGHTWEIGHT_ENDPOINT:-$DEFAULT_LIGHTWEIGHT_ENDPOINT}"
ALLOWED_MODELS="${ARG_ALLOWED_MODELS:-}"
LAKEBASE_BOOTSTRAP_USER="${ARG_LAKEBASE_BOOTSTRAP_USER:-}"
LAKEBASE_AUTH_MODE="${ARG_LAKEBASE_AUTH_MODE:-}"
LAKEBASE_NATIVE_USER="${ARG_LAKEBASE_NATIVE_USER:-}"
LAKEBASE_NATIVE_PASSWORD="${ARG_LAKEBASE_NATIVE_PASSWORD:-}"
ROTATE_LAKEBASE_NATIVE_PASSWORD="${ARG_ROTATE_LAKEBASE_NATIVE_PASSWORD}"
PRINT_GENERATED_NATIVE_PASSWORD="${ARG_PRINT_GENERATED_NATIVE_PASSWORD}"
GENERATED_NATIVE_PASSWORD=false
LAKEBASE_RUNTIME_MODE="${ARG_LAKEBASE_RUNTIME_MODE:-}"
LAKEBASE_ENABLE_POOLER_EXPERIMENT="${ARG_LAKEBASE_ENABLE_POOLER_EXPERIMENT}"
LAKEBASE_SCALE_TO_ZERO_TIMEOUT="${ARG_LAKEBASE_SCALE_TO_ZERO_TIMEOUT:-}"
LAKEBASE_NO_SCALE_TO_ZERO="${ARG_LAKEBASE_NO_SCALE_TO_ZERO}"
SEED_BENCHMARKS="${ARG_SEED_BENCHMARKS}"
SEED_BENCHMARKS_ALL_INDUSTRIES="${ARG_SEED_BENCHMARKS_ALL_INDUSTRIES}"
SEED_BENCHMARK_INDUSTRIES="${ARG_SEED_BENCHMARK_INDUSTRIES:-}"
BENCHMARK_ADMINS="${ARG_BENCHMARK_ADMINS:-}"
ENABLE_METRIC_VIEWS="${ARG_ENABLE_METRIC_VIEWS}"
ENABLE_FABRIC="${ARG_ENABLE_FABRIC}"
ENABLE_DEMO_MODE="${ARG_ENABLE_DEMO_MODE}"

# -------------------------------------------------------------------------
# Cost governance (all optional). BUDGET_POLICY_ID is applied to the
# Databricks App and propagated to the Lakebase project. CUSTOM_TAGS_JSON
# is a JSON array of {key, value} objects applied only to the Lakebase
# project (the Databricks Apps API does not accept tags on the App).
#
# Two default tags are injected unless overridden by --tag with the same
# key: project=databricks_forge and owner=<user running the deploy>.
# The owner tag is skipped when USER_EMAIL could not be resolved. The
# JSON is built inside build_custom_tags_json() after USER_EMAIL is
# populated by check_prerequisites; here we only validate the raw input.
# -------------------------------------------------------------------------
BUDGET_POLICY_ID="${ARG_BUDGET_POLICY_ID:-}"
CUSTOM_TAGS_JSON=""
if [[ ${#ARG_TAGS[@]} -gt 0 ]]; then
  ARG_TAGS_RAW="$(printf '%s\n' "${ARG_TAGS[@]}")" python3 - <<'PY'
import os, sys

raw = os.environ.get("ARG_TAGS_RAW", "").splitlines()
seen = set()
for entry in raw:
    entry = entry.strip()
    if not entry:
        continue
    if "=" not in entry:
        sys.stderr.write(f"ERROR: --tag expects KEY=VALUE, got: {entry!r}\n")
        sys.exit(1)
    key, _ = entry.split("=", 1)
    key = key.strip()
    if not key:
        sys.stderr.write(f"ERROR: --tag has empty key in: {entry!r}\n")
        sys.exit(1)
    if key in seen:
        sys.stderr.write(f"ERROR: duplicate --tag key: {key}\n")
        sys.exit(1)
    seen.add(key)
PY
  if [[ $? -ne 0 ]]; then
    printf "\n  ERROR: Failed to parse --tag arguments. Expected KEY=VALUE per flag.\n\n" >&2
    exit 1
  fi
fi

if [[ "$SEED_BENCHMARKS_ALL_INDUSTRIES" = "true" && "$SEED_BENCHMARKS" != "true" ]]; then
  SEED_BENCHMARKS=true
fi
if [[ -n "$SEED_BENCHMARK_INDUSTRIES" && "$SEED_BENCHMARKS" != "true" ]]; then
  SEED_BENCHMARKS=true
fi

if [[ -n "$LAKEBASE_AUTH_MODE" && "$LAKEBASE_AUTH_MODE" != "oauth" && "$LAKEBASE_AUTH_MODE" != "native_password" ]]; then
  die "Invalid --lakebase-auth-mode '$LAKEBASE_AUTH_MODE'. Expected oauth or native_password."
fi
if [[ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" && -z "$LAKEBASE_AUTH_MODE" ]]; then
  LAKEBASE_AUTH_MODE="native_password"
fi
if [[ -n "$LAKEBASE_NATIVE_USER" || -n "$LAKEBASE_NATIVE_PASSWORD" ]]; then
  if [[ "$LAKEBASE_AUTH_MODE" != "native_password" ]]; then
    die "--lakebase-native-user/--lakebase-native-password require --lakebase-auth-mode native_password."
  fi
fi
if [[ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" && "$LAKEBASE_AUTH_MODE" != "native_password" ]]; then
  die "--rotate-lakebase-native-password requires --lakebase-auth-mode native_password (or leave auth mode unset)."
fi
if [[ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" && -n "$LAKEBASE_NATIVE_PASSWORD" ]]; then
  die "Cannot combine --rotate-lakebase-native-password with --lakebase-native-password."
fi
if [[ "$PRINT_GENERATED_NATIVE_PASSWORD" = "true" && "$ROTATE_LAKEBASE_NATIVE_PASSWORD" != "true" ]]; then
  die "--print-generated-native-password is only valid with --rotate-lakebase-native-password."
fi
if [[ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" ]]; then
  LAKEBASE_NATIVE_PASSWORD="$(python3 - <<'PY'
import secrets
import string
alphabet = string.ascii_letters + string.digits + "-_@#%+=."
print("".join(secrets.choice(alphabet) for _ in range(48)))
PY
)"
  GENERATED_NATIVE_PASSWORD=true
fi

if [[ -n "$LAKEBASE_RUNTIME_MODE" && "$LAKEBASE_RUNTIME_MODE" != "oauth_direct_only" && "$LAKEBASE_RUNTIME_MODE" != "pooler_preferred" ]]; then
  die "Invalid --lakebase-runtime-mode '$LAKEBASE_RUNTIME_MODE'. Expected oauth_direct_only or pooler_preferred."
fi

if [[ "$LAKEBASE_NO_SCALE_TO_ZERO" = "true" && -n "$LAKEBASE_SCALE_TO_ZERO_TIMEOUT" ]]; then
  die "Cannot combine --lakebase-no-scale-to-zero with --lakebase-scale-to-zero-timeout."
fi

# -------------------------------------------------------------------------
# Output helpers
# -------------------------------------------------------------------------
die()  { printf "\n  ERROR: %s\n\n" "$1" >&2; exit 1; }
warn() { printf "\n  WARN: %s\n" "$1" >&2; }
info() { printf "  %-48s" "$1"; }
ok()   { if [ -n "${1:-}" ]; then printf "OK  (%s)\n" "$1"; else printf "OK\n"; fi; }

# Extract a value from JSON via Python 3.
# Usage: echo '{"k":"v"}' | json_val "['k']"
json_val() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

# -------------------------------------------------------------------------
# Model endpoint probing and fallback
#
# Before binding endpoints, verify each model exists in the workspace.
# If a preferred model is unavailable, walk a fallback chain of alternatives
# until one is found. This handles cross-region/cloud model availability
# differences silently.
# -------------------------------------------------------------------------

# Check if a serving endpoint exists. Returns 0 if available, 1 otherwise.
probe_endpoint() {
  local name="$1"
  if [ -z "$name" ]; then return 1; fi
  databricks serving-endpoints get "$name" --output json &>/dev/null
}

# Given a space-separated list of endpoint names, return the first available.
# If none are available (or probing fails), returns the first name as fallback.
# Usage: resolve_with_fallback "model-a model-b model-c"
resolve_with_fallback() {
  local chain="$1"
  local first=""
  for candidate in $chain; do
    if [ -z "$first" ]; then first="$candidate"; fi
    if probe_endpoint "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  echo "$first"
  return 1
}

# Probe all endpoint roles and resolve to best available.
# Skips probing for roles where the user provided an explicit --flag override.
# Sets the global ENDPOINT, FAST_ENDPOINT, etc. variables.
probe_and_resolve_endpoints() {
  if [ "$ARG_SKIP_PROBE" = "true" ]; then
    printf "\n  Model probing skipped (--skip-probe).\n"
    return
  fi

  printf "\n  Probing model availability...\n"

  local resolved="" preferred="" label="" did_fallback=false

  # Helper: probe a role and print status
  # Usage: probe_role "Label" "user_override" "fallback chain" VARNAME
  probe_role() {
    local role_label="$1"
    local user_override="$2"
    local chain="$3"
    local varname="$4"

    if [ -n "$user_override" ]; then
      printf "  %-20s %s (user override)\n" "$role_label:" "$user_override"
      eval "$varname=\"$user_override\""
      return
    fi

    preferred="${chain%% *}"
    if probe_endpoint "$preferred"; then
      printf "  %-20s %s\n" "$role_label:" "$preferred"
      eval "$varname=\"$preferred\""
    else
      resolved=$(resolve_with_fallback "$chain")
      if [ "$resolved" != "$preferred" ]; then
        printf "  %-20s %s → %s\n" "$role_label:" "$preferred" "$resolved"
        did_fallback=true
      else
        printf "  %-20s %s (probe failed, using default)\n" "$role_label:" "$preferred"
      fi
      eval "$varname=\"$resolved\""
    fi
  }

  probe_role "Primary" "$ARG_ENDPOINT" \
    "databricks-claude-opus-4-6 databricks-claude-opus-4-5 databricks-gpt-5-4 databricks-claude-sonnet-4-6" \
    ENDPOINT

  probe_role "Fast" "$ARG_FAST_ENDPOINT" \
    "databricks-claude-sonnet-4-6 databricks-claude-sonnet-4-5 databricks-gemini-3-flash databricks-gemini-3-1-flash-lite" \
    FAST_ENDPOINT

  probe_role "Review" "$ARG_REVIEW_ENDPOINT" \
    "databricks-gpt-5-4 databricks-claude-opus-4-6 databricks-claude-sonnet-4-6" \
    REVIEW_ENDPOINT

  probe_role "Embedding" "$ARG_EMBEDDING_ENDPOINT" \
    "databricks-qwen3-embedding-0-6b" \
    EMBEDDING_ENDPOINT

  probe_role "Reasoning2" "$ARG_REASONING_ENDPOINT_2" \
    "databricks-gemini-3-flash databricks-gemini-3-1-flash-lite databricks-llama-4-maverick" \
    REASONING_ENDPOINT_2

  probe_role "Generation" "$ARG_GENERATION_ENDPOINT" \
    "databricks-llama-4-maverick databricks-gemini-3-flash databricks-gemini-3-1-flash-lite databricks-claude-sonnet-4-6" \
    GENERATION_ENDPOINT

  probe_role "Lightweight" "$ARG_LIGHTWEIGHT_ENDPOINT" \
    "databricks-gemini-3-1-flash-lite databricks-gemini-3-flash databricks-claude-sonnet-4-5" \
    LIGHTWEIGHT_ENDPOINT

  if [ -n "$ARG_SQL_ENDPOINT" ]; then
    printf "  %-20s %s (user override)\n" "SQL:" "$ARG_SQL_ENDPOINT"
    SQL_ENDPOINT="$ARG_SQL_ENDPOINT"
  fi

  if [ "$did_fallback" = true ]; then
    printf "\n  Some models were substituted. The app adapts automatically.\n"
    printf "  Use explicit --endpoint flags to override selections.\n"
  fi
}

get_app_compute_state() {
  local app_json
  if ! app_json=$(databricks apps get "$APP_NAME" --output json 2>/dev/null); then
    echo "MISSING"
    return
  fi
  echo "$app_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN"
}

wait_for_app_absent() {
  local attempts=0
  local max_attempts=30
  local sleep_secs=10
  local state

  info "Waiting for app deletion..."
  while [ $attempts -lt $max_attempts ]; do
    state="$(get_app_compute_state)"
    if [ "$state" = "MISSING" ]; then
      ok "deleted"
      return 0
    fi
    sleep "$sleep_secs"
    attempts=$((attempts + 1))
  done

  printf "TIMEOUT\n"
  return 1
}

APP_YAML_BACKUP=""

# -------------------------------------------------------------------------
# Merge default tags (project, owner) with user-provided --tag values and
# serialize to CUSTOM_TAGS_JSON. User-provided tags override defaults on
# key collision. The owner tag is skipped when USER_EMAIL is empty.
#
# Opt-in contract: this function is a no-op unless the user passed at
# least one --tag flag. A plain `./deploy.sh` run (or one with only
# --budget-policy-id) leaves CUSTOM_TAGS_JSON empty, which keeps
# FORGE_CUSTOM_TAGS unset in app.yaml and tells the Lakebase runtime
# to skip both create-time and reconcile-time tag operations.
# Call order: after check_prerequisites (which sets USER_EMAIL) and
# before prepare_app_yaml (which consumes CUSTOM_TAGS_JSON).
# -------------------------------------------------------------------------
build_custom_tags_json() {
  CUSTOM_TAGS_JSON=""
  if [[ ${#ARG_TAGS[@]} -eq 0 ]]; then
    return
  fi

  CUSTOM_TAGS_JSON=$(USER_EMAIL="$USER_EMAIL" \
    ARG_TAGS_RAW="$(printf '%s\n' "${ARG_TAGS[@]}")" python3 - <<'PY'
import json, os

user_email = os.environ.get("USER_EMAIL", "").strip()
raw = os.environ.get("ARG_TAGS_RAW", "").splitlines()

# Defaults are inserted first so user --tag with the same key overrides them.
defaults = [{"key": "project", "value": "databricks_forge"}]
if user_email:
    defaults.append({"key": "owner", "value": user_email})

merged = {t["key"]: t["value"] for t in defaults}
for entry in raw:
    entry = entry.strip()
    if not entry or "=" not in entry:
        continue
    key, value = entry.split("=", 1)
    key = key.strip()
    value = value.strip()
    # Empty value opts out of a default (or no-ops a user-provided key).
    if value == "":
        merged.pop(key, None)
        continue
    merged[key] = value

tags = [{"key": k, "value": v} for k, v in merged.items()]
print(json.dumps(tags, separators=(",", ":")))
PY
)
}

prepare_app_yaml() {
  # Back up and patch app.yaml with instance-specific env vars for syncing.
  # Reads from the ORIGINAL repo file (git version) to avoid contamination
  # from previous deploys that may have left managed vars in the file.
  APP_YAML_BACKUP="$(mktemp)"
  cp "app.yaml" "$APP_YAML_BACKUP"

  # Restore the clean git version first, then patch from that baseline
  git checkout -- app.yaml 2>/dev/null || true

  export APP_NAME
  export LAKEBASE_BOOTSTRAP_USER
  export LAKEBASE_AUTH_MODE
  export LAKEBASE_NATIVE_USER
  export LAKEBASE_NATIVE_PASSWORD
  export LAKEBASE_RUNTIME_MODE
  export LAKEBASE_ENABLE_POOLER_EXPERIMENT
  export LAKEBASE_SCALE_TO_ZERO_TIMEOUT
  export LAKEBASE_NO_SCALE_TO_ZERO
  export SEED_BENCHMARKS
  export SEED_BENCHMARKS_ALL_INDUSTRIES
  export SEED_BENCHMARK_INDUSTRIES
  export BENCHMARK_ADMINS
  export ENABLE_METRIC_VIEWS
  export ENABLE_FABRIC
  export ENABLE_DEMO_MODE
  export REASONING_ENDPOINT_2
  export GENERATION_ENDPOINT
  export SQL_ENDPOINT
  export LIGHTWEIGHT_ENDPOINT
  export ALLOWED_MODELS
  export BUDGET_POLICY_ID
  export CUSTOM_TAGS_JSON
  python3 - <<'PY'
import os
from pathlib import Path

app_name = os.environ.get("APP_NAME", "databricks-forge").strip()
bootstrap_user = os.environ.get("LAKEBASE_BOOTSTRAP_USER", "").strip()
auth_mode = os.environ.get("LAKEBASE_AUTH_MODE", "").strip()
native_user = os.environ.get("LAKEBASE_NATIVE_USER", "").strip()
native_password = os.environ.get("LAKEBASE_NATIVE_PASSWORD", "")
runtime_mode = os.environ.get("LAKEBASE_RUNTIME_MODE", "").strip()
pooler_experiment = os.environ.get("LAKEBASE_ENABLE_POOLER_EXPERIMENT", "").strip().lower() == "true"
scale_to_zero_timeout = os.environ.get("LAKEBASE_SCALE_TO_ZERO_TIMEOUT", "").strip()
no_scale_to_zero = os.environ.get("LAKEBASE_NO_SCALE_TO_ZERO", "").strip().lower() == "true"
seed_benchmarks = os.environ.get("SEED_BENCHMARKS", "").strip().lower() == "true"
seed_benchmarks_all = os.environ.get("SEED_BENCHMARKS_ALL_INDUSTRIES", "").strip().lower() == "true"
seed_benchmark_industries = os.environ.get("SEED_BENCHMARK_INDUSTRIES", "").strip()
benchmark_admins = os.environ.get("BENCHMARK_ADMINS", "").strip()
enable_metric_views = os.environ.get("ENABLE_METRIC_VIEWS", "").strip().lower() == "true"
enable_fabric = os.environ.get("ENABLE_FABRIC", "").strip().lower() == "true"
enable_demo_mode = os.environ.get("ENABLE_DEMO_MODE", "").strip().lower() == "true"
reasoning_endpoint_2 = os.environ.get("REASONING_ENDPOINT_2", "").strip()
generation_endpoint = os.environ.get("GENERATION_ENDPOINT", "").strip()
sql_endpoint = os.environ.get("SQL_ENDPOINT", "").strip()
lightweight_endpoint = os.environ.get("LIGHTWEIGHT_ENDPOINT", "").strip()
allowed_models = os.environ.get("ALLOWED_MODELS", "").strip()
budget_policy_id = os.environ.get("BUDGET_POLICY_ID", "").strip()
custom_tags_json = os.environ.get("CUSTOM_TAGS_JSON", "").strip()

path = Path("app.yaml")
lines = path.read_text().splitlines()
out: list[str] = []
i = 0

def is_managed_name_line(s: str) -> bool:
    t = s.strip()
    if not t.startswith("- name:"):
        return False
    return (
        "FORGE_APP_NAME" in t
        or "LAKEBASE_BOOTSTRAP_USER" in t
        or "LAKEBASE_AUTH_MODE" in t
        or "LAKEBASE_NATIVE_USER" in t
        or "LAKEBASE_NATIVE_PASSWORD" in t
        or "LAKEBASE_RUNTIME_MODE" in t
        or "LAKEBASE_ENABLE_POOLER_EXPERIMENT" in t
        or "LAKEBASE_SCALE_TO_ZERO_TIMEOUT" in t
        or "FORGE_SEED_BENCHMARKS" in t
        or "FORGE_SEED_BENCHMARKS_ALL_INDUSTRIES" in t
        or "FORGE_SEED_BENCHMARK_INDUSTRIES" in t
        or "FORGE_BENCHMARK_ADMINS" in t
        or "FORGE_METRIC_VIEWS_ENABLED" in t
        or "FORGE_FABRIC_ENABLED" in t
        or "FORGE_DEMO_MODE_ENABLED" in t
        or "DATABRICKS_SERVING_ENDPOINT_REASONING_2" in t
        or "DATABRICKS_SERVING_ENDPOINT_GENERATION" in t
        or "DATABRICKS_SERVING_ENDPOINT_SQL" in t
        or "DATABRICKS_SERVING_ENDPOINT_LIGHTWEIGHT" in t
        or "DATABRICKS_ALLOWED_MODELS" in t
        or "FORGE_BUDGET_POLICY_ID" in t
        or "FORGE_CUSTOM_TAGS" in t
    )

while i < len(lines):
    line = lines[i]
    if is_managed_name_line(line):
        i += 1
        while i < len(lines):
            nxt = lines[i]
            if nxt.startswith("  - name:"):
                break
            i += 1
        continue
    out.append(line)
    i += 1

if app_name != "databricks-forge":
    out.append("  - name: FORGE_APP_NAME")
    out.append(f'    value: "{app_name}"')
if bootstrap_user:
    out.append("  - name: LAKEBASE_BOOTSTRAP_USER")
    out.append(f'    value: "{bootstrap_user}"')
if auth_mode:
    out.append("  - name: LAKEBASE_AUTH_MODE")
    out.append(f'    value: "{auth_mode}"')
if auth_mode == "native_password" and native_user:
    out.append("  - name: LAKEBASE_NATIVE_USER")
    out.append(f'    value: "{native_user}"')
if auth_mode == "native_password" and native_password:
    out.append("  - name: LAKEBASE_NATIVE_PASSWORD")
    out.append(f'    value: "{native_password}"')
if runtime_mode:
    out.append("  - name: LAKEBASE_RUNTIME_MODE")
    out.append(f'    value: "{runtime_mode}"')
out.append("  - name: LAKEBASE_ENABLE_POOLER_EXPERIMENT")
out.append(f'    value: "{"true" if pooler_experiment else "false"}"')
if no_scale_to_zero:
    out.append("  - name: LAKEBASE_SCALE_TO_ZERO_TIMEOUT")
    out.append('    value: "disabled"')
elif scale_to_zero_timeout:
    out.append("  - name: LAKEBASE_SCALE_TO_ZERO_TIMEOUT")
    out.append(f'    value: "{scale_to_zero_timeout}"')
out.append("  - name: FORGE_SEED_BENCHMARKS")
out.append(f'    value: "{"true" if seed_benchmarks else "false"}"')
out.append("  - name: FORGE_SEED_BENCHMARKS_ALL_INDUSTRIES")
out.append(f'    value: "{"true" if seed_benchmarks_all else "false"}"')
if seed_benchmark_industries:
    out.append("  - name: FORGE_SEED_BENCHMARK_INDUSTRIES")
    out.append(f'    value: "{seed_benchmark_industries}"')
if benchmark_admins:
    out.append("  - name: FORGE_BENCHMARK_ADMINS")
    out.append(f'    value: "{benchmark_admins}"')
if enable_metric_views:
    out.append("  - name: FORGE_METRIC_VIEWS_ENABLED")
    out.append('    value: "true"')
if enable_fabric:
    out.append("  - name: FORGE_FABRIC_ENABLED")
    out.append('    value: "true"')
if enable_demo_mode:
    out.append("  - name: FORGE_DEMO_MODE_ENABLED")
    out.append('    value: "true"')
if reasoning_endpoint_2:
    out.append("  - name: DATABRICKS_SERVING_ENDPOINT_REASONING_2")
    out.append("    valueFrom: serving-endpoint-reasoning-2")
if generation_endpoint:
    out.append("  - name: DATABRICKS_SERVING_ENDPOINT_GENERATION")
    out.append("    valueFrom: serving-endpoint-generation")
if sql_endpoint:
    out.append("  - name: DATABRICKS_SERVING_ENDPOINT_SQL")
    out.append("    valueFrom: serving-endpoint-sql")
if lightweight_endpoint:
    out.append("  - name: DATABRICKS_SERVING_ENDPOINT_LIGHTWEIGHT")
    out.append("    valueFrom: serving-endpoint-lightweight")
if allowed_models:
    out.append("  - name: DATABRICKS_ALLOWED_MODELS")
    out.append(f'    value: "{allowed_models}"')
if budget_policy_id:
    out.append("  - name: FORGE_BUDGET_POLICY_ID")
    out.append(f'    value: "{budget_policy_id}"')
if custom_tags_json:
    # Serialize as a single-line JSON value; escape any embedded double quotes
    # so the YAML remains valid. Consumed at runtime by provision.ts.
    escaped = custom_tags_json.replace('"', '\\"')
    out.append("  - name: FORGE_CUSTOM_TAGS")
    out.append(f'    value: "{escaped}"')
path.write_text("\n".join(out) + "\n")
PY
}

restore_app_yaml() {
  if [ -n "$APP_YAML_BACKUP" ] && [ -f "$APP_YAML_BACKUP" ]; then
    mv "$APP_YAML_BACKUP" "app.yaml"
    APP_YAML_BACKUP=""
  fi
}

# -------------------------------------------------------------------------
# Zero-egress package assembly
#
# Builds the Next.js standalone bundle locally, then packages it as a
# split tar.gz archive that requires ZERO npm install on the platform.
# Designed for workspaces that block serverless egress.
#
# The deploy wrapper contains only:
#   - app.yaml (command: sh bootstrap.sh)
#   - bootstrap.sh (reassembles archive, extracts, delegates to start.sh)
#   - bundle.tar.gz.part-* (split archive chunks, each <10MB)
#   - .prebuilt marker file
#
# Inside the archive:
#   - server.js + .next/ (Next.js standalone app)
#   - node_modules/ (pruned runtime deps + prisma CLI with linux engine)
#   - public/ + .next/static/ (static assets)
#   - scripts/ (start.sh, provision-lakebase.mjs, etc.)
#   - prisma/ + prisma.config.ts
#   - data/benchmark/*.json (optional)
# -------------------------------------------------------------------------
DEPLOY_PKG=".deploy-pkg"
DEPLOY_WRAPPER=".deploy-pkg-ze"
CHUNK_SIZE_MB=9

assemble_zero_egress() {
  printf "\n  Assembling zero-egress deploy package...\n"

  # -- Install Linux sharp binaries for cross-platform build ---------------
  info "Installing Linux sharp binaries..."
  if npm install --no-save --no-audit --no-fund --force \
       @img/sharp-linux-x64 @img/sharp-libvips-linux-x64 2>/dev/null; then
    ok
  else
    ok "skipped (non-critical)"
  fi

  # -- Local build ---------------------------------------------------------
  info "Building locally (prisma generate + next build)..."
  if ! npm run build 2>&1 | tail -3; then
    die "Local build failed. Fix errors and retry."
  fi
  ok

  # -- Locate standalone root (Next.js nests it under the project path) ----
  local standalone_root=".next/standalone"
  local nested
  nested=$(find "$standalone_root" -name "server.js" -maxdepth 6 -not -path "*/node_modules/*" | head -1)
  if [ -z "$nested" ]; then
    die "server.js not found in $standalone_root. Build may have failed."
  fi
  local standalone_app_dir
  standalone_app_dir=$(dirname "$nested")

  # -- Clean and create deploy package directory ---------------------------
  info "Assembling $DEPLOY_PKG/..."
  rm -rf "$DEPLOY_PKG" "$DEPLOY_WRAPPER"
  mkdir -p "$DEPLOY_PKG"

  cp -a "$standalone_app_dir/." "$DEPLOY_PKG/"

  rm -rf "$DEPLOY_PKG/public"
  if [ -d "$standalone_root/public" ]; then
    cp -a "$standalone_root/public" "$DEPLOY_PKG/public"
  fi

  if [ -d "$standalone_root/.next/static" ]; then
    mkdir -p "$DEPLOY_PKG/.next"
    cp -a "$standalone_root/.next/static" "$DEPLOY_PKG/.next/static"
  fi

  # -- Resolve Turbopack hashed external modules ----------------------------
  # Turbopack creates .next/node_modules/ with symlinks like:
  #   pg-61d4919a4f0d7081 -> ../../node_modules/pg
  # These are hashed package names used in server chunks. We must:
  # 1. Copy the hashed entries as real directories (dereference symlinks)
  # 2. Copy their transitive deps into the root node_modules/
  if [ -d ".next/node_modules" ]; then
    info "Resolving Turbopack externals..."
    # Remove the standalone's copy (contains broken symlinks to dev machine)
    rm -rf "$DEPLOY_PKG/.next/node_modules"
    # Re-copy with -L to dereference symlinks into real directories
    cp -aL ".next/node_modules" "$DEPLOY_PKG/.next/node_modules"
    # Trace real package names from symlinks and collect their transitive deps
    local turbo_real_pkgs=""
    while IFS= read -r link; do
      local target
      target=$(readlink "$link" 2>/dev/null) || continue
      local real_pkg
      real_pkg=$(echo "$target" | sed -E 's|.*/node_modules/||; s|/$||')
      turbo_real_pkgs="${turbo_real_pkgs}${real_pkg}\n"
    done < <(find ".next/node_modules" -maxdepth 3 -type l)
    # Use node to trace transitive deps of all external packages
    if [ -n "$turbo_real_pkgs" ]; then
      local ext_deps
      ext_deps=$(echo -e "$turbo_real_pkgs" | sort -u | node -e "
const fs=require('fs'),path=require('path'),rl=require('readline');
const nm=path.join(process.cwd(),'node_modules');
const seen=new Set();
function trace(pkg){
  if(seen.has(pkg))return;
  seen.add(pkg);
  try{
    const p=JSON.parse(fs.readFileSync(path.join(nm,pkg,'package.json'),'utf8'));
    for(const d of Object.keys(p.dependencies||{}))trace(d);
  }catch{}
}
const lines=[];
const r=rl.createInterface({input:process.stdin});
r.on('line',l=>{if(l.trim())trace(l.trim())});
r.on('close',()=>console.log([...seen].join('\n')));
")
      local ext_count=0
      while IFS= read -r dep; do
        [ -z "$dep" ] && continue
        [ -d "$DEPLOY_PKG/node_modules/$dep" ] && continue
        [ ! -d "node_modules/$dep" ] && continue
        mkdir -p "$(dirname "$DEPLOY_PKG/node_modules/$dep")"
        cp -a "node_modules/$dep" "$DEPLOY_PKG/node_modules/$dep"
        ext_count=$((ext_count + 1))
      done <<< "$ext_deps"
      ok "${ext_count} deps"
    else
      ok "none"
    fi
  fi

  # -- Strip macOS-only sharp binaries -------------------------------------
  rm -rf "$DEPLOY_PKG/node_modules/@img/sharp-darwin-arm64" \
         "$DEPLOY_PKG/node_modules/@img/sharp-libvips-darwin-arm64" \
         "$DEPLOY_PKG/node_modules/@img/sharp-darwin-x64" \
         "$DEPLOY_PKG/node_modules/@img/sharp-libvips-darwin-x64" \
         2>/dev/null || true

  # -- Strip typescript (bundled prisma handles its own TS needs) ----------
  rm -rf "$DEPLOY_PKG/node_modules/typescript" 2>/dev/null || true

  # -- Strip non-PostgreSQL Prisma WASM compilers (saves ~35M) -------------
  find "$DEPLOY_PKG" -path "*/@prisma/client*/runtime/*" \
    \( -name "*mysql*" -o -name "*sqlite*" -o -name "*sqlserver*" -o -name "*cockroachdb*" \) \
    -type f -delete 2>/dev/null || true
  # Also strip .d.ts and .d.mts files from @prisma/client runtime
  find "$DEPLOY_PKG" -path "*/@prisma/client*/runtime/*" \
    \( -name "*.d.ts" -o -name "*.d.mts" \) -type f -delete 2>/dev/null || true

  # -- Aggressive pruning: remove non-runtime files from node_modules ------
  info "Pruning non-runtime files..."
  find "$DEPLOY_PKG" -name "*.map" -type f -delete 2>/dev/null || true
  find "$DEPLOY_PKG" -name "*.nft.json" -type f -delete 2>/dev/null || true
  find "$DEPLOY_PKG/node_modules" \( \
    -name "README*" -o -name "LICENSE*" -o -name "CHANGELOG*" \
    -o -name "HISTORY*" -o -name "*.md" \
  \) -type f -delete 2>/dev/null || true
  ok

  # -- Copy runtime scripts ------------------------------------------------
  mkdir -p "$DEPLOY_PKG/scripts"
  cp scripts/start.sh "$DEPLOY_PKG/scripts/"
  cp scripts/provision-lakebase.mjs "$DEPLOY_PKG/scripts/"
  cp scripts/seed-benchmarks.mjs "$DEPLOY_PKG/scripts/"
  cp scripts/validate-endpoints.mjs "$DEPLOY_PKG/scripts/"

  # -- Copy prisma schema + write production config -------------------------
  mkdir -p "$DEPLOY_PKG/prisma"
  cp prisma/schema.prisma "$DEPLOY_PKG/prisma/"
  # Production config without dotenv dependency (env vars set by start.sh)
  cat > "$DEPLOY_PKG/prisma.config.ts" <<'PRISMACONF'
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env["DATABASE_URL"] },
});
PRISMACONF

  # -- Bundle prisma CLI + all transitive deps ------------------------------
  info "Bundling Prisma CLI..."
  if [ ! -d "node_modules/prisma" ]; then
    die "node_modules/prisma not found. Run npm install first."
  fi
  # Trace the full transitive dependency tree from local node_modules.
  # This avoids npm registry calls and uses the exact installed versions.
  local prisma_deps
  prisma_deps=$(node -e "
const fs=require('fs'),path=require('path');
const nm=path.join(process.cwd(),'node_modules');
const seen=new Set();
function trace(pkg){
  if(seen.has(pkg))return;
  seen.add(pkg);
  try{
    const p=JSON.parse(fs.readFileSync(path.join(nm,pkg,'package.json'),'utf8'));
    for(const d of Object.keys(p.dependencies||{}))trace(d);
  }catch{}
}
trace('prisma');
console.log([...seen].join('\n'));
")
  if [ -z "$prisma_deps" ]; then
    die "Could not resolve prisma dependency tree."
  fi
  local dep_count=0
  while IFS= read -r dep; do
    [ -z "$dep" ] && continue
    [ ! -d "node_modules/$dep" ] && continue
    local dest_dir="$DEPLOY_PKG/node_modules/$dep"
    mkdir -p "$(dirname "$dest_dir")"
    cp -a "node_modules/$dep" "$dest_dir"
    dep_count=$((dep_count + 1))
  done <<< "$prisma_deps"
  # Prune non-runtime files from prisma deps
  find "$DEPLOY_PKG/node_modules/prisma" "$DEPLOY_PKG/node_modules/@prisma" \
    \( -name "*.map" -o -name "*.nft.json" -o -name "README*" -o -name "LICENSE*" \
    -o -name "CHANGELOG*" -o -name "HISTORY*" -o -name "*.md" \) \
    -type f -delete 2>/dev/null || true
  mkdir -p "$DEPLOY_PKG/node_modules/.bin"
  cat > "$DEPLOY_PKG/node_modules/.bin/prisma" <<'PRISMABIN'
#!/bin/sh
exec node "$(dirname "$0")/../prisma/build/index.js" "$@"
PRISMABIN
  chmod +x "$DEPLOY_PKG/node_modules/.bin/prisma"
  ok "${dep_count} packages"

  info "Downloading Linux schema engine..."
  local engine_hash
  engine_hash=$(npx prisma version 2>/dev/null | grep "Engines Hash" | awk '{print $NF}')
  if [ -z "$engine_hash" ]; then
    engine_hash=$(npx prisma version 2>/dev/null | grep "Default Engines Hash" | awk '{print $NF}')
  fi

  if [ -n "$engine_hash" ]; then
    local engine_url="https://binaries.prisma.sh/all_commits/${engine_hash}/debian-openssl-3.0.x/schema-engine.gz"
    local engine_dest="$DEPLOY_PKG/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x"
    if curl -sSfL "$engine_url" | gunzip > "$engine_dest" 2>/dev/null; then
      chmod +x "$engine_dest"
      ok "$(du -h "$engine_dest" | cut -f1 | tr -d ' ')"
    else
      warn "Could not download Linux schema engine. prisma db push may fail on the target."
      ok "skipped"
    fi
  else
    warn "Could not determine Prisma engine hash. Linux engine not bundled."
    ok "skipped"
  fi

  # -- Copy benchmark data (for optional seed) -----------------------------
  if [ -d "data/benchmark" ]; then
    mkdir -p "$DEPLOY_PKG/data/benchmark"
    cp data/benchmark/*.json "$DEPLOY_PKG/data/benchmark/" 2>/dev/null || true
  fi

  # -- NO package.json -- prevents platform from running npm install -------

  # -- Write .prebuilt marker file -----------------------------------------
  echo "assembled=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DEPLOY_PKG/.prebuilt"
  echo "zero-egress=true" >> "$DEPLOY_PKG/.prebuilt"

  # -- Report pre-compression size -----------------------------------------
  local pkg_size pkg_files
  pkg_size=$(du -sh "$DEPLOY_PKG" | cut -f1)
  pkg_files=$(find "$DEPLOY_PKG" -type f | wc -l | tr -d ' ')
  printf "  %-48s" "Pre-compression:"
  printf "%s / %s files\n" "$pkg_size" "$pkg_files"

  # -- Compress into tar.gz ------------------------------------------------
  info "Compressing bundle..."
  local bundle_path="$DEPLOY_WRAPPER/bundle.tar.gz"
  mkdir -p "$DEPLOY_WRAPPER"
  COPYFILE_DISABLE=1 tar czf "$bundle_path" -C "$DEPLOY_PKG" .
  local bundle_size
  bundle_size=$(du -h "$bundle_path" | cut -f1 | tr -d ' ')
  ok "$bundle_size"

  # -- Split into <10MB chunks (Databricks Apps per-file limit) ------------
  info "Splitting into ${CHUNK_SIZE_MB}MB chunks..."
  split -b "${CHUNK_SIZE_MB}m" "$bundle_path" "${bundle_path}.part-"
  rm -f "$bundle_path"
  local chunk_count
  chunk_count=$(find "$DEPLOY_WRAPPER" -name "bundle.tar.gz.part-*" | wc -l | tr -d ' ')
  ok "${chunk_count} chunks"

  # -- Copy bootstrap.sh and app.yaml into wrapper -------------------------
  cp scripts/bootstrap.sh "$DEPLOY_WRAPPER/bootstrap.sh"
  # app.yaml is copied later by the caller after prepare_app_yaml

  # -- Write .prebuilt marker in wrapper -----------------------------------
  echo "assembled=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DEPLOY_WRAPPER/.prebuilt"
  echo "zero-egress=true" >> "$DEPLOY_WRAPPER/.prebuilt"

  # -- Report final wrapper size -------------------------------------------
  local wrapper_size wrapper_files
  wrapper_size=$(du -sh "$DEPLOY_WRAPPER" | cut -f1)
  wrapper_files=$(find "$DEPLOY_WRAPPER" -type f | wc -l | tr -d ' ')
  printf "\n  %-48s" "Zero-egress package:"
  printf "%s / %s files\n" "$wrapper_size" "$wrapper_files"
}

# -------------------------------------------------------------------------
# Step 1: Check prerequisites
# -------------------------------------------------------------------------
check_prerequisites() {
  printf "\n  Checking prerequisites...\n"

  info "Databricks CLI..."
  if ! command -v databricks &>/dev/null; then
    printf "MISSING\n"
    die "Databricks CLI not found.\n  Install: https://docs.databricks.com/dev-tools/cli/install.html"
  fi
  local cli_ver
  cli_ver=$(databricks version 2>/dev/null || databricks --version 2>/dev/null || echo "unknown")
  ok "$cli_ver"

  info "CLI profile..."
  ok "${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"

  info "Authentication..."
  local user_json
  if ! user_json=$(databricks current-user me --output json 2>/dev/null); then
    printf "FAILED\n"
    die "Not authenticated. Run:\n  databricks auth login --host https://your-workspace.cloud.databricks.com"
  fi
  USER_EMAIL=$(echo "$user_json" | json_val "['userName']")
  ok "$USER_EMAIL"

  info "Workspace host..."
  DATABRICKS_HOST=""
  if command -v databricks &>/dev/null; then
    DATABRICKS_HOST=$(databricks auth describe --output json 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('host',''))" 2>/dev/null || true)
  fi
  if [ -z "$DATABRICKS_HOST" ]; then
    DATABRICKS_HOST=$(databricks auth describe 2>/dev/null \
      | grep -i "Host:" | head -1 | awk '{print $NF}' || echo "")
  fi
  if [ -z "$DATABRICKS_HOST" ]; then
    die "Could not determine workspace host. Check your CLI profile."
  fi
  DATABRICKS_HOST="${DATABRICKS_HOST%/}"
  ok "$DATABRICKS_HOST"
}

# -------------------------------------------------------------------------
# Step 2: Select a SQL Warehouse
# -------------------------------------------------------------------------
select_warehouse() {
  printf "\n  Discovering SQL Warehouses...\n"

  local wh_json
  if ! wh_json=$(databricks warehouses list --output json 2>/dev/null); then
    die "Failed to list SQL Warehouses. Check your permissions."
  fi

  local wh_count
  wh_count=$(echo "$wh_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wh = data if isinstance(data, list) else data.get('warehouses', [])
print(len(wh))
")

  if [ "$wh_count" -eq 0 ]; then
    die "No SQL Warehouses found in this workspace. Create one first."
  fi

  echo "$wh_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wh = data if isinstance(data, list) else data.get('warehouses', [])
for i, w in enumerate(wh, 1):
    state = w.get('state', 'UNKNOWN')
    name  = w.get('name', 'Unnamed')
    print(f'    {i}) {name} ({state})')
"

  if [ -n "$ARG_WAREHOUSE" ]; then
    local result
    result=$(echo "$wh_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wh = data if isinstance(data, list) else data.get('warehouses', [])
target = '''$ARG_WAREHOUSE'''
for w in wh:
    if w.get('name','') == target:
        print(w['id'] + '|' + w.get('name',''))
        sys.exit(0)
print('')
")
    if [ -z "$result" ]; then
      die "Warehouse '$ARG_WAREHOUSE' not found."
    fi
    WAREHOUSE_ID="${result%%|*}"
    WAREHOUSE_NAME="${result#*|}"
    printf "  -> %s (via --warehouse flag)\n" "$WAREHOUSE_NAME"
  else
    printf "  Enter number [1]: "
    read -r choice
    choice="${choice:-1}"

    local result
    result=$(echo "$wh_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wh = data if isinstance(data, list) else data.get('warehouses', [])
idx = int('''$choice''') - 1
if 0 <= idx < len(wh):
    w = wh[idx]
    print(w['id'] + '|' + w.get('name','Unnamed'))
else:
    print('')
")
    if [ -z "$result" ]; then
      die "Invalid selection. Enter a number from the list."
    fi
    WAREHOUSE_ID="${result%%|*}"
    WAREHOUSE_NAME="${result#*|}"
    printf "  -> %s\n" "$WAREHOUSE_NAME"
  fi
}

# -------------------------------------------------------------------------
# Step 3: Create the app (if it doesn't exist) and configure it
#
# New apps: created with user_api_scopes via the create endpoint, then
# resources are bound via create-update.
#
# Existing apps: create-update sets both resources and scopes idempotently.
#
# The app.yaml references resources via valueFrom: keys, which the platform
# resolves to environment variables at runtime.
# -------------------------------------------------------------------------
APP_SCOPES='["sql","catalog.tables:read","catalog.schemas:read","catalog.catalogs:read","files.files","dashboards.genie"]'

create_app() {
  printf "\n"
  info "App \"$APP_NAME\"..."

  local existing_state
  existing_state="$(get_app_compute_state)"

  if [ "$existing_state" = "DELETING" ]; then
    printf "WAIT  (currently deleting)\n"
    if ! wait_for_app_absent; then
      die "App is still deleting and could not be recreated yet. Wait a few minutes and retry."
    fi
    info "App \"$APP_NAME\"..."
  fi

  if [ "$existing_state" = "MISSING" ] || [ "$existing_state" = "DELETING" ]; then
    local create_json
    create_json=$(APP_NAME="$APP_NAME" APP_DESC="$APP_DESC" BUDGET_POLICY_ID="$BUDGET_POLICY_ID" python3 -c "
import json, os
body = {
    'name': os.environ['APP_NAME'],
    'description': os.environ['APP_DESC'],
    'user_api_scopes': ['sql','catalog.tables:read','catalog.schemas:read','catalog.catalogs:read','files.files','dashboards.genie'],
}
budget_policy_id = os.environ.get('BUDGET_POLICY_ID', '').strip()
if budget_policy_id:
    body['budget_policy_id'] = budget_policy_id
print(json.dumps(body))
")
    local create_err
    if ! create_err=$(databricks apps create --json "$create_json" --no-compute --no-wait 2>&1); then
      if echo "$create_err" | grep -q "unknown flag.*--no-compute"; then
        if ! create_err=$(databricks apps create --json "$create_json" --no-wait 2>&1); then
          printf "FAILED\n"
          die "Failed to create app.\n  $create_err"
        fi
      else
        printf "FAILED\n"
        die "Failed to create app.\n  $create_err"
      fi
    fi
    ok "created with scopes"
  else
    ok "already exists"
  fi
}

wait_for_stable_state() {
  local state
  state=$(databricks apps get "$APP_NAME" --output json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

  if [ "$state" = "ACTIVE" ] || [ "$state" = "STOPPED" ]; then
    return
  fi

  info "Waiting for compute to stabilise..."
  local attempts=0
  while [ $attempts -lt 30 ]; do
    sleep 10
    state=$(databricks apps get "$APP_NAME" --output json 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
    if [ "$state" = "ACTIVE" ] || [ "$state" = "STOPPED" ]; then
      ok "$state"
      return
    fi
    attempts=$((attempts + 1))
  done
  ok "proceeding ($state)"
}

configure_app() {
  info "Configuring resources and scopes..."

  local update_json
  update_json=$(WAREHOUSE_ID="$WAREHOUSE_ID" \
    ENDPOINT="$ENDPOINT" FAST_ENDPOINT="$FAST_ENDPOINT" \
    EMBEDDING_ENDPOINT="$EMBEDDING_ENDPOINT" REVIEW_ENDPOINT="$REVIEW_ENDPOINT" \
    REASONING_ENDPOINT_2="$REASONING_ENDPOINT_2" GENERATION_ENDPOINT="$GENERATION_ENDPOINT" \
    SQL_ENDPOINT="$SQL_ENDPOINT" LIGHTWEIGHT_ENDPOINT="$LIGHTWEIGHT_ENDPOINT" \
    BUDGET_POLICY_ID="$BUDGET_POLICY_ID" \
    python3 -c "
import json, os
resources = [
    {'name': 'sql-warehouse', 'sql_warehouse': {'id': os.environ['WAREHOUSE_ID'], 'permission': 'CAN_USE'}},
    {'name': 'serving-endpoint', 'serving_endpoint': {'name': os.environ['ENDPOINT'], 'permission': 'CAN_QUERY'}},
    {'name': 'serving-endpoint-fast', 'serving_endpoint': {'name': os.environ['FAST_ENDPOINT'], 'permission': 'CAN_QUERY'}},
    {'name': 'serving-endpoint-embedding', 'serving_endpoint': {'name': os.environ['EMBEDDING_ENDPOINT'], 'permission': 'CAN_QUERY'}},
    {'name': 'serving-endpoint-review', 'serving_endpoint': {'name': os.environ['REVIEW_ENDPOINT'], 'permission': 'CAN_QUERY'}},
]
if os.environ.get('REASONING_ENDPOINT_2', ''):
    resources.append({'name': 'serving-endpoint-reasoning-2', 'serving_endpoint': {'name': os.environ['REASONING_ENDPOINT_2'], 'permission': 'CAN_QUERY'}})
if os.environ.get('GENERATION_ENDPOINT', ''):
    resources.append({'name': 'serving-endpoint-generation', 'serving_endpoint': {'name': os.environ['GENERATION_ENDPOINT'], 'permission': 'CAN_QUERY'}})
if os.environ.get('SQL_ENDPOINT', ''):
    resources.append({'name': 'serving-endpoint-sql', 'serving_endpoint': {'name': os.environ['SQL_ENDPOINT'], 'permission': 'CAN_QUERY'}})
if os.environ.get('LIGHTWEIGHT_ENDPOINT', ''):
    resources.append({'name': 'serving-endpoint-lightweight', 'serving_endpoint': {'name': os.environ['LIGHTWEIGHT_ENDPOINT'], 'permission': 'CAN_QUERY'}})
body = {'resources': resources, 'user_api_scopes': ['sql','catalog.tables:read','catalog.schemas:read','catalog.catalogs:read','files.files','dashboards.genie']}
budget_policy_id = os.environ.get('BUDGET_POLICY_ID', '').strip()
if budget_policy_id:
    body['budget_policy_id'] = budget_policy_id
print(json.dumps(body))
")

  local update_err
  if ! update_err=$(databricks apps update "$APP_NAME" \
       --json "$update_json" 2>&1); then
    printf "FAILED\n"
    die "Failed to configure app resources and scopes.\n  $update_err"
  fi
  ok
}

# -------------------------------------------------------------------------
# Apply tag assignments to the Databricks App
#
# The Apps create/update API does not expose a "tags" field, so tags are
# applied through the workspace tag-assignments endpoint. The PUT call is
# a full replace of the entity's tags, mirroring how CUSTOM_TAGS_JSON is
# treated for the Lakebase project.
# -------------------------------------------------------------------------
apply_app_tags() {
  if [ -z "$CUSTOM_TAGS_JSON" ]; then
    return
  fi

  info "Tagging app..."

  local tag_body
  tag_body=$(CUSTOM_TAGS_JSON="$CUSTOM_TAGS_JSON" python3 -c "
import json, os
src = json.loads(os.environ['CUSTOM_TAGS_JSON'])
out = [{'tag_key': t['key'], 'tag_value': t['value']} for t in src]
print(json.dumps({'tag_assignments': out}))
")

  local tag_err
  if ! tag_err=$(databricks api put \
       "/api/2.0/tags/tag-assignments/app/${APP_NAME}" \
       --json "$tag_body" 2>&1); then
    warn "Failed to apply app tags (continuing)."
    printf "  %s\n" "$tag_err"
    return
  fi

  local tag_count
  tag_count=$(echo "$CUSTOM_TAGS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  ok "${tag_count} tags"
}

# -------------------------------------------------------------------------
# Step 5: Upload source code (or zero-egress package)
# -------------------------------------------------------------------------
upload_code() {
  WORKSPACE_PATH="/Workspace/Users/${USER_EMAIL}/${APP_NAME}"

  local sync_source="."
  local sync_flags=""
  local sync_label="diff"

  if [ "$ARG_ZERO_EGRESS" = "true" ]; then
    info "Uploading zero-egress package..."
    # Upload each file individually via workspace import (RAW format).
    # databricks sync respects .gitignore/.databricksignore from the CWD
    # which excludes .deploy-pkg-ze/ and silently uploads nothing.
    # workspace import --format RAW bypasses all ignore-file logic and
    # treats every file as a raw binary, avoiding notebook interpretation.
    databricks workspace mkdirs "$WORKSPACE_PATH" 2>/dev/null || true
    local ze_count=0
    for f in "$DEPLOY_WRAPPER"/* "$DEPLOY_WRAPPER"/.*; do
      [ -f "$f" ] || continue
      local fname
      fname=$(basename "$f")
      case "$fname" in .|..) continue ;; esac
      if ! databricks workspace import "$WORKSPACE_PATH/$fname" \
             --file "$f" --format RAW --overwrite 2>/dev/null; then
        die "Failed to upload $fname"
      fi
      ze_count=$((ze_count + 1))
    done
    ok "${ze_count} files"
    return
  elif [ "$ARG_FULL_SYNC" = "true" ]; then
    # Explicit --full: clear snapshots and do a complete upload
    rm -rf .databricks/sync-snapshots 2>/dev/null || true
    sync_flags="--full"
    sync_label="full"
    if [ -f ".databricksignore" ]; then
      sync_flags="--full --exclude-from .databricksignore"
    fi
    info "Uploading source code (full sync)..."
  else
    # Default: diff sync — only changed files since last deploy
    if [ -f ".databricksignore" ]; then
      sync_flags="--exclude-from .databricksignore"
    fi
    info "Uploading source code (diff sync — only changed files)..."
  fi

  if ! databricks sync $sync_flags "$sync_source" "$WORKSPACE_PATH"; then
    if [ "$sync_label" = "diff" ]; then
      warn "Diff sync failed. Retrying with full sync..."
      rm -rf .databricks/sync-snapshots 2>/dev/null || true
      sync_flags="--full"
      if [ -f ".databricksignore" ]; then
        sync_flags="--full --exclude-from .databricksignore"
      fi
      if ! databricks sync $sync_flags "$sync_source" "$WORKSPACE_PATH"; then
        die "Full sync also failed.\n  Try manually: databricks sync $sync_flags $sync_source $WORKSPACE_PATH"
      fi
    else
      die "Failed to upload code.\n  Try manually: databricks sync $sync_flags $sync_source $WORKSPACE_PATH"
    fi
  fi
  ok
}

# -------------------------------------------------------------------------
# Step 6: Start compute (must be active before deploying)
# -------------------------------------------------------------------------
start_compute() {
  info "App compute..."

  local state
  state=$(databricks apps get "$APP_NAME" --output json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

  if [ "$state" = "ACTIVE" ]; then
    ok "already running"
    return
  fi

  databricks apps start "$APP_NAME" --no-wait &>/dev/null || true
  printf "starting"

  local attempts=0
  while [ $attempts -lt 30 ]; do
    sleep 10
    state=$(databricks apps get "$APP_NAME" --output json 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
    if [ "$state" = "ACTIVE" ]; then
      printf "\r  %-48s" "App compute..."
      ok "running"
      return
    fi
    printf "."
    attempts=$((attempts + 1))
  done

  printf "\r  %-48s" "App compute..."
  printf "TIMEOUT\n"
  die "Compute did not start within 5 minutes.\n  Check the Databricks Apps UI for details."
}

# -------------------------------------------------------------------------
# Step 7: Deploy
# -------------------------------------------------------------------------
deploy_app() {
  info "Deploying..."

  local deploy_err
  if ! deploy_err=$(databricks apps deploy "$APP_NAME" \
       --source-code-path "$WORKSPACE_PATH" --mode SNAPSHOT --no-wait 2>&1); then
    printf "FAILED\n"
    die "Deployment failed.\n  $deploy_err"
  fi
  ok "deployment started"
}

# -------------------------------------------------------------------------
# Print success banner
# -------------------------------------------------------------------------
print_success() {
  local app_url="${DATABRICKS_HOST}/apps/${APP_NAME}"

  printf "\n"
  printf "  ==========================================================\n"
  printf "    Databricks Forge is live!\n"
  printf "    URL: %s\n" "$app_url"
  printf "\n"
  printf "    App name:     %s\n" "$APP_NAME"
  printf "    Deploy mode:  %s\n" "$( [ "$ARG_ZERO_EGRESS" = "true" ] && echo "zero-egress (split archive)" || echo "source (remote build)" )"
  printf "\n"
  printf "    Resources:\n"
  printf "      SQL Warehouse:    %s\n" "$WAREHOUSE_NAME"
  printf "      Premium model:    %s\n" "$ENDPOINT"
  printf "      Fast model:       %s\n" "$FAST_ENDPOINT"
  printf "      Embedding model:  %s\n" "$EMBEDDING_ENDPOINT"
  printf "      Review model:     %s\n" "$REVIEW_ENDPOINT"
  if [ -n "$REASONING_ENDPOINT_2" ]; then
    printf "      Reasoning 2:      %s\n" "$REASONING_ENDPOINT_2"
  fi
  if [ -n "$GENERATION_ENDPOINT" ]; then
    printf "      Generation:       %s\n" "$GENERATION_ENDPOINT"
  fi
  if [ -n "$SQL_ENDPOINT" ]; then
    printf "      SQL/Codex:        %s\n" "$SQL_ENDPOINT"
  fi
  if [ -n "$LIGHTWEIGHT_ENDPOINT" ]; then
    printf "      Lightweight:      %s\n" "$LIGHTWEIGHT_ENDPOINT"
  fi
  if [ -n "$ALLOWED_MODELS" ]; then
    printf "      Allowed models:   %s\n" "$ALLOWED_MODELS"
  fi
  if [ -n "$LAKEBASE_BOOTSTRAP_USER" ]; then
    printf "      Bootstrap user:   %s\n" "$LAKEBASE_BOOTSTRAP_USER"
  fi
  printf "      Auth mode:        %s\n" "${LAKEBASE_AUTH_MODE:-repo default (start.sh)}"
  if [ "$LAKEBASE_AUTH_MODE" = "native_password" ] && [ -n "$LAKEBASE_NATIVE_USER" ]; then
    printf "      Native db user:   %s\n" "$LAKEBASE_NATIVE_USER"
  fi
  if [ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" ]; then
    printf "      Native password:  rotated\n"
  fi
  printf "      Runtime mode:     %s\n" "${LAKEBASE_RUNTIME_MODE:-oauth_direct_only (default)}"
  printf "      Pooler experiment:%s\n" "$( [ "$LAKEBASE_ENABLE_POOLER_EXPERIMENT" = "true" ] && echo " enabled" || echo " disabled" )"
  printf "      Seed benchmarks:  %s\n" "$( [ "$SEED_BENCHMARKS" = "true" ] && echo "enabled" || echo "disabled" )"
  printf "      Seed all industries: %s\n" "$( [ "$SEED_BENCHMARKS_ALL_INDUSTRIES" = "true" ] && echo "enabled" || echo "disabled" )"
  printf "      Seed industry filter: %s\n" "${SEED_BENCHMARK_INDUSTRIES:-none}"
  printf "      Metric views:     %s\n" "$( [ "$ENABLE_METRIC_VIEWS" = "true" ] && echo "enabled" || echo "disabled" )"
  printf "      Fabric / PBI:    %s\n" "$( [ "$ENABLE_FABRIC" = "true" ] && echo "enabled" || echo "disabled" )"
  printf "      Demo mode:       %s\n" "$( [ "$ENABLE_DEMO_MODE" = "true" ] && echo "enabled" || echo "disabled" )"
  printf "      Benchmark admins: %s\n" "${BENCHMARK_ADMINS:-all authenticated users}"
  printf "      Budget policy:    %s\n" "${BUDGET_POLICY_ID:-none}"
  if [ -n "$CUSTOM_TAGS_JSON" ]; then
    printf "      Custom tags:      %s\n" "$CUSTOM_TAGS_JSON"
  else
    printf "      Custom tags:      none\n"
  fi
  if [ "$GENERATED_NATIVE_PASSWORD" = "true" ] && [ "$PRINT_GENERATED_NATIVE_PASSWORD" = "true" ]; then
    printf "      Generated native password: %s\n" "$LAKEBASE_NATIVE_PASSWORD"
  fi
  printf "\n"
  printf "    User scopes:\n"
  printf "      sql, catalog.tables:read, catalog.schemas:read,\n"
  printf "      catalog.catalogs:read, files.files, dashboards.genie\n"
  printf "  ==========================================================\n"
  printf "\n"
}

# -------------------------------------------------------------------------
# Destroy
# -------------------------------------------------------------------------
destroy() {
  printf "\n  Removing Databricks Forge...\n"

  info "Stopping app..."
  local stop_err
  if ! stop_err=$(databricks apps stop "$APP_NAME" --no-wait 2>&1); then
    case "$stop_err" in
      *"does not exist"*|*"RESOURCE_DOES_NOT_EXIST"*|*"not found"*)
        ok "already stopped"
        ;;
      *)
        ok "stop skipped"
        ;;
    esac
  else
    ok
  fi

  info "Deleting app..."
  local delete_err
  if ! delete_err=$(databricks apps delete "$APP_NAME" 2>&1); then
    case "$delete_err" in
      *"does not exist"*|*"RESOURCE_DOES_NOT_EXIST"*|*"not found"*)
        ok "already deleted"
        ;;
      *"state DELETING"*|*"updated less than 20 minutes ago"*)
        ok "already deleting"
        ;;
      *)
        printf "FAILED\n"
        die "Failed to delete app.\n  $delete_err"
        ;;
    esac
  else
    ok
  fi

  if [ "$(get_app_compute_state)" != "MISSING" ]; then
    if ! wait_for_app_absent; then
      die "Delete requested but app still exists after waiting. Retry destroy in a few minutes."
    fi
  fi

  WORKSPACE_PATH="/Workspace/Users/${USER_EMAIL}/${APP_NAME}"
  info "Cleaning workspace files..."
  if databricks workspace delete --recursive "$WORKSPACE_PATH" 2>/dev/null; then ok; else ok "already clean"; fi

  printf "\n  App removed successfully.\n\n"
}

# -------------------------------------------------------------------------
# Main
# -------------------------------------------------------------------------
main() {
  trap restore_app_yaml EXIT

  printf "\n"
  printf "  Databricks Forge -- Deployment\n"
  printf "  ==================================\n"

  check_prerequisites

  if [ "$ARG_DESTROY" = true ]; then
    destroy
    exit 0
  fi

  build_custom_tags_json
  probe_and_resolve_endpoints
  select_warehouse
  create_app
  wait_for_stable_state
  configure_app
  apply_app_tags
  prepare_app_yaml

  if [ "$ARG_ZERO_EGRESS" = "true" ]; then
    assemble_zero_egress
    # Patch app.yaml command from scripts/start.sh to bootstrap.sh
    python3 -c "
from pathlib import Path
text = Path('app.yaml').read_text()
text = text.replace('scripts/start.sh', 'bootstrap.sh')
Path('app.yaml').write_text(text)
"
    cp app.yaml "$DEPLOY_WRAPPER/app.yaml"
  fi

  upload_code
  start_compute
  deploy_app
  print_success
}

main
