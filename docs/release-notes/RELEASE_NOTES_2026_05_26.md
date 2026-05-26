# Release Notes -- 2026-05-26

**Databricks Forge v1.0.2**

---

## v1.0.2 -- `deploy.sh`: zero-touch Lakebase + SP grant bootstrap + `--destroy` prompt

### Bug Fixes

- **Silent missing `postgres` binding.** `./deploy.sh` (no Lakebase flags)
  previously printed `Postgres binding: (not set - app must already have
  postgres resource)`, deployed an app with no `postgres` resource, and
  the app crashed on every startup with
  `FATAL: Lakebase resource binding env vars missing`. The deploy script
  now **auto-provisions** a per-app Lakebase project (named after
  `--app-name`, sanitized to `[a-z0-9-]{1,63}`), default
  `databricks_postgres` database, and waits for the endpoint to become
  `ACTIVE` before continuing. Re-deploys discover the existing `postgres`
  resource on the app and reuse the same binding. A hard pre-deploy
  guard now refuses to proceed if the binding can't be resolved.

- **App service principal lacked `public` schema permissions.** On a
  fresh Lakebase project, the `public` schema is owned by the deploying
  user, and the SP role minted by Lakebase on first bind had zero
  privileges. `prisma db push` in `scripts/start.sh` failed with
  `permission denied for schema public`. `deploy.sh` now runs a new
  `bootstrap_lakebase_sp_grants` step **as the project owner** which:
  - installs `pgvector` + `databricks_auth` extensions,
  - ensures the SP DB role exists (defensive; Lakebase mints it on
    first connect),
  - grants `CONNECT` + `USAGE`/`CREATE` on `public` + table/sequence
    privileges + `ALTER DEFAULT PRIVILEGES`,
  - transfers ownership of any pre-existing `public.*` tables to the SP
    so Prisma can `ALTER`/`DROP` them on schema migrations.

  Idempotent. If the deploying user isn't the project owner (a teammate
  re-deploying), the step skip-warns rather than failing — the original
  deploy already applied the grants. This also self-heals the
  cross-tool case where `.deploy_local.sh` previously created tables
  owned by `forge_local_dev`: re-running `./deploy.sh` reassigns
  ownership to the SP.

- **`--destroy` silently left Lakebase project + data in place.** The
  destroy flow now **prompts** about deleting the associated Lakebase
  project after the app is removed. Default answer is *keep* (data
  preservation wins). Non-interactive flags: `--destroy-database`
  (soft delete, recoverable), `--purge-database` (hard delete,
  immediate), `--keep-database` (skip the prompt, preserve — default
  when run in a non-TTY context like CI).

### Improvements

- **Deployer gets SQL Editor access by default.** When `deploy.sh`
  auto-provisions the project AND `--lakebase-bootstrap-user` is unset,
  the deploying user's email is used so they get a Databricks OAuth
  role on the new database immediately — no extra flag needed to
  inspect their own deploy. Opt out with `--lakebase-bootstrap-user ""`.

- **Scale-to-zero is now configured at the management plane.** Lakebase
  Autoscaling treats scale-to-zero (`suspend_timeout_duration` in the
  REST API) as an immutable project property, set only at project
  creation via `databricks postgres create-project ... --json
  '{"spec":{"default_endpoint_settings":{"suspend_timeout_duration":"300s"}}}'`.
  `deploy.sh` now bakes the value into the `create-project` payload
  when it auto-provisions a project (default `300s`), with operator
  override via `--lakebase-scale-to-zero-seconds N`. Re-deploys against
  an existing project leave the setting alone; passing
  `--lakebase-scale-to-zero-seconds` on a re-deploy emits a warning
  explaining the value is immutable post-creation (workaround:
  destroy + redeploy, or migrate to a fresh project via
  `--lakebase-project-id NEW`). The configure helper is now a
  reporting-only step that prints the project's actual configured
  value during every deploy.

  The legacy `LAKEBASE_SCALE_TO_ZERO_TIMEOUT` env var and
  `--lakebase-no-scale-to-zero` flag have been removed — they were
  runtime-side concepts that never took effect at the management plane
  (and surfaced as "unsupported parameter" errors when operators tried
  the equivalent CLI command).

- **New flags.**
  - `--lakebase-project-id ID` — override the auto-derived project ID.
  - `--lakebase-scale-to-zero-seconds N` — branch scale-to-zero timeout.
  - `--destroy-database` / `--purge-database` / `--keep-database` —
    non-interactive destroy choices.

- **Relaxed flags.** `--lakebase-branch` and `--lakebase-database` are
  now optional (still paired — both or neither). They remain available
  as power-user overrides to bind an existing, externally-managed
  project/branch/database. The script validates that they are not
  combined with `--lakebase-project-id`.

### Documentation

- Comprehensive cleanup of stale flag references across `README.md`,
  `QUICKSTART.md`, `docs/quickstart.md`, `docs/DEPLOYMENT.md`, and
  `AGENTS.md`. The retired flags — `--lakebase-auth-mode`,
  `--lakebase-native-user`, `--lakebase-native-password`,
  `--rotate-lakebase-native-password`, `--print-generated-native-password`,
  `--lakebase-runtime-mode`, `--lakebase-enable-pooler-experiment`,
  `--lakebase-scale-to-zero-timeout`, `--lakebase-no-scale-to-zero` —
  were documented as if still supported even though `deploy.sh` no
  longer accepts them.
- New "Lakebase auto-provisioning" section in `docs/DEPLOYMENT.md`
  explaining the full lifecycle (resolution → endpoint-active wait →
  scale-to-zero config → SP grant bootstrap → deployer-as-bootstrap
  default → destroy prompt).
- Updated env-var table in `README.md`: replaced retired runtime
  variables (`LAKEBASE_AUTH_MODE`, `LAKEBASE_NATIVE_USER`,
  `LAKEBASE_NATIVE_PASSWORD`, `LAKEBASE_POOLER_HOST`,
  `LAKEBASE_USERNAME`) with the current OAuth-only surface
  (`PGHOST` / `PGUSER` / `PGDATABASE` / `LAKEBASE_ENDPOINT` /
  `LAKEBASE_BOOTSTRAP_USER`).

### Behavior Changes

- `./deploy.sh` (no flags) now succeeds end-to-end on a clean
  workspace — no manual Lakebase pre-provisioning required.
- `./deploy.sh --destroy` is now interactive by default. Pass
  `--keep-database` or `--destroy-database` to silence the prompt in CI.
- The success banner always prints the Postgres branch/database/endpoint
  (no more "(not set)" branch) and adds an "Auto-provisioned project"
  line when the script created the project on this run.
- `--destroy --destroy-database` now finds projects auto-provisioned
  with a uniqueness suffix (e.g. `forge-demo-69aa11f1` when the bare
  `forge-demo` name was taken). Previously the destroy resolver only
  looked for the exact `sanitize_lakebase_project_id "$APP_NAME"`
  name and silently skipped suffixed projects.
- `--destroy` no longer exits early when the app is already absent.
  Previously, if `databricks apps delete` returned "does not exist"
  (e.g. the app was deleted out-of-band via the Databricks UI or a
  prior aborted run), the destroy flow returned before cleaning
  workspace files or processing `--destroy-database`. The Lakebase
  project would silently orphan and continue accruing cost. The
  branch now falls through to workspace + Lakebase cleanup.
- Lakebase branch discovery prefers the branch explicitly marked
  `status.default == true` (Lakebase guarantees exactly one),
  falling back to the canonical `production` / `main` name, then
  the first entry only as a last resort. Previously the picker
  blindly took the first item returned by `list-branches`, which
  could route the app to a developer sandbox branch on
  multi-branch projects and serve incorrect data.

### Known Limitations

- **`--destroy --keep-database` followed by re-deploy will leave the
  app in `CRASHED` state.** Each Databricks Apps deploy mints a new
  service-principal role. On a *preserved* Lakebase database, the
  pre-existing tables and indexes are owned by the previous SP (now
  gone). PostgreSQL requires the deploying user to be a member of the
  new SP role *with `ADMIN OPTION`* to transfer ownership; Lakebase
  does **not** grant that option to the deployer. The new SP can
  `SELECT`/`INSERT`/`UPDATE` existing tables but cannot `ALTER`/`DROP`
  them, so Prisma's startup `db push` fails with
  `must be owner of index idx_embeddings_hnsw` (or similar) and the
  app crashes on first request.

  `deploy.sh` now **detects** this gap, prints a clear `WARN` after
  the SP grant bootstrap reporting *N pre-existing tables not
  re-owned*, and surfaces the two workarounds:

  1. `./deploy.sh --destroy --destroy-database` to wipe and start
     fresh (preferred for non-production).
  2. Manually grant the deployer role membership on the new SP via
     the Postgres SQL editor:
     `GRANT "<new-sp-uuid>" TO "<deployer-email>" WITH ADMIN OPTION;`
     then re-run `./deploy.sh` to retry the ownership transfer.

  Long-term fix on the table: move `prisma db push` from
  `scripts/start.sh` (runs as SP) into `deploy.sh`'s management-plane
  step (runs as deployer, who already owns the schema). Tracked
  separately.

---

## All Commits

| Hash | Summary |
|---|---|
| _(pending)_ | feat(deploy): auto-provision Lakebase project + SP grant bootstrap (zero-flag deploy) |
| _(pending)_ | feat(deploy): `--destroy` prompts about Lakebase project + `--destroy-database` / `--purge-database` / `--keep-database` flags |
| _(pending)_ | feat(deploy): scale-to-zero baked into `create-project` payload (immutable post-creation, reporting on re-deploy) |
| _(pending)_ | feat(deploy): destroy resolver finds suffixed Lakebase projects (`<app>-<8hex>`) when the bare name is taken |
| _(pending)_ | feat(deploy): SP-grant bootstrap detects the `--keep-database` ownership gap and surfaces actionable workarounds |
| _(pending)_ | fix(deploy): destroy continues to workspace + Lakebase cleanup when the app is already absent |
| _(pending)_ | fix(deploy): pick the branch with `status.default == true` (fall back to `production`/`main`) instead of `list-branches[0]` |
| _(pending)_ | docs: clean up retired Lakebase flag references across README, QUICKSTART, docs/DEPLOYMENT, AGENTS |
