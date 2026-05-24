# AGENTS.md -- Databricks Forge

> Single source of truth for any AI agent working on this codebase.

## Project Purpose

Databricks Forge is a web application that discovers data-driven use cases
from Unity Catalog metadata using LLM-powered analysis. Customers configure a
business context, point at their UC catalogs/schemas, and the app generates
scored, categorised use cases with optional SQL code, exported as Excel, PDF,
PowerPoint, or deployed as SQL notebooks.

## Tech Stack

| Layer          | Technology                                           |
| -------------- | ---------------------------------------------------- |
| Frontend       | Next.js 16 App Router, React 19, shadcn/ui, Tailwind CSS 4 |
| Language       | TypeScript (strict)                                  |
| SQL Execution  | Databricks SQL Statement Execution API via SQL Warehouse |
| LLM Calls      | Databricks Model Serving REST API (chat completions) |
| Embeddings     | Databricks Model Serving (databricks-qwen3-embedding-0-6b, 1024-dim) |
| Vector Search  | pgvector extension in Lakebase (HNSW index)          |
| Persistence    | Lakebase (Unity Catalog managed tables)              |
| Deployment     | Databricks Apps (auto-auth via env vars)             |
| Export         | exceljs, pdfkit, pptxgenjs, Workspace REST API       |

## Deployment Model

This app runs as a **Databricks App**. Authentication is automatic:

- `DATABRICKS_HOST` and token are injected by the platform.
- `DATABRICKS_APP_PORT` controls the listen port (fallback: 3000).
- SQL Warehouse is bound as an app resource (no hardcoded warehouse IDs).
- Embedding endpoint (`serving-endpoint-embedding`) defaults to `databricks-qwen3-embedding-0-6b`.
- Review endpoint (`serving-endpoint-review`) defaults to `databricks-gpt-5-4` for LLM-as-reviewer SQL quality checks.
- Extended model pool endpoints (`serving-endpoint-reasoning-2`, `serving-endpoint-generation`, `serving-endpoint-sql`, `serving-endpoint-lightweight`) are optional; when configured via deploy.sh, they enable multi-model parallel routing.
- `--lightweight-endpoint` binds a fast classification/lightweight model (e.g. `databricks-gemini-3-1-flash-lite` or `databricks-claude-sonnet-4-6`) for high-throughput tasks.
- `DATABRICKS_ALLOWED_MODELS` restricts the pool to customer-approved models only.
- Model availability failover: `deploy.sh` probes endpoints and selects the best available per role; `scripts/validate-endpoints.mjs` re-validates at startup; runtime 404s trigger automatic endpoint rotation. Use `--skip-probe` to bypass deploy-time probing.
- Lakebase scale-to-zero is enforced at every startup (default: 300s timeout). Override with `LAKEBASE_SCALE_TO_ZERO_TIMEOUT` or `--lakebase-no-scale-to-zero`.
- Demo Mode is a runtime toggle in Settings, persisted to Lakebase (`ForgeAppConfig` singleton). `FORGE_DEMO_MODE_ENABLED` (or `--enable-demo-mode`) only **seeds** the initial value on first boot; thereafter the UI is the source of truth. No redeploy needed to flip the gate.
- **Local dev** uses `.deploy_local.sh` which provisions Lakebase via `databricks postgres` CLI commands and writes `.env.local`. Auth uses the Databricks CLI OAuth U2M session (`databricks auth login`) -- no PAT or credentials stored on disk. The auth chain in `lib/dbx/client.ts` `getBearerToken()` checks: OBO header → `DATABRICKS_TOKEN` → CLI OAuth U2M (`databricks auth token`, cached 5min) → SP OAuth M2M. `getCurrentUserEmail()` falls back to `FORGE_LOCAL_USER_EMAIL` env var when OBO proxy headers are absent. Lakebase uses `getStaticPrisma()` with a `DATABASE_URL` pointing to a native password role (`forge_local_dev`).

## Folder Contract

```
/app          Routes + UI (pages, layouts, API routes)
/components   Shared UI components (shadcn primitives, pipeline-specific)
/lib          Data, auth, config, scoring, AI, pipeline logic
  /ports      Abstract interfaces for DI (LLMClient, SqlExecutor, SkillResolver, Logger, EngineProgress)
    /defaults Databricks wiring: concrete port implementations
  /toolkit    Shared cross-engine utilities (concurrency, parse-llm-json, llm-cache, sql-rules, token-budget, retry)
  /sql-engine Unified SQL generation + validation + review pipeline
  /dbx        Databricks SQL client, Model Serving client, Workspace API
  /queries    SQL text + row-to-type mappers
  /domain     TypeScript types + scoring logic
  /ai         Prompt template building + Model Serving execution
    /comment-engine  Multi-pass Comment Engine (table + column + consistency)
  /metadata   Shared schema context layer (reusable across features)
  /demo       Demo Mode: research engine, data engine, config, cleanup
  /pipeline   Pipeline engine + step modules
  /lakebase   Lakebase table schema + CRUD operations
  /embeddings Embedding client, pgvector store, text composition, RAG retriever
  /export     Excel, PDF, PPTX, notebook generators
/docs         Specs, references, and deployment docs
/__tests__    Unit and integration tests
```

## Domain Types

These are the core TypeScript types used throughout the app:

| Type               | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `PipelineRun`      | A single pipeline execution (config + status)    |
| `UseCase`          | A generated use case with scores and metadata    |
| `BusinessContext`   | LLM-generated business context (goals, priorities, value chain) |
| `MetadataSnapshot` | Cached UC metadata (tables, columns, FKs)        |
| `ExportRecord`     | Record of an export (format, path, timestamp)    |
| `PipelineStep`     | Enum of pipeline step identifiers                |
| `EnvironmentScan`  | A completed estate scan (scope, counts, scores)  |
| `TableDetail`      | Per-table structural + LLM metadata              |
| `TableHistorySummary` | Delta history insights per table              |
| `LineageEdge`      | Directed edge in the data lineage graph          |
| `ERDGraph`         | Entity-relationship graph (nodes + edges)        |
| `TableHealthInsight` | Health score + issues + recommendations        |
| `ValueEstimate`    | Per-use-case financial estimate (low/mid/high)   |
| `RoadmapPhaseAssignment` | Delivery phase + effort + dependencies     |
| `UseCaseTrackingEntry` | Lifecycle stage from discovered to measured   |
| `StakeholderProfile` | Role/department impact profile with champion flags |
| `ExecutiveSynthesis` | Board-ready findings, recommendations, risks   |
| `BusinessValuePortfolio` | Cross-run portfolio aggregation             |
| `StrategyDocument` | Uploaded strategy with parsed initiatives         |
| `SchemaContext`    | Enriched schema view: tables, columns, domains, roles, tiers, relationships, lineage, naming profile (`lib/metadata/types.ts`) |
| `EnrichedTable`    | Table with deterministic + LLM classifications (domain, role, tier, data asset mapping, write frequency) |
| `EnrichedColumn`   | Column with inferred role (pk, fk, timestamp, flag, measure, code) and FK target |
| `InferredRelationship` | Cross-table relationship from naming patterns, FK constraints, or LLM inference |
| `CommentEngineResult` | Output of the Comment Engine: table + column comments, schema context, consistency fixes, stats |
| `ForgeDemoSession` | A demo data generation run (customer, industry, scope, catalog, research result, status) |
| `ResearchEngineResult` | Company research output: priorities, assets, nomenclature, narratives |
| `DemoScope` | Division/department/objective filter narrowing demo to a business unit |
| `WafAssessmentSummary` | One WAF assessment run header (per-pillar scores, overall, status) |
| `WafAssessmentDetail` | Assessment summary + per-control results joined to the catalog |
| `WafControl` | A single WAF best practice (waf_id, pillar, threshold, fix-action engine binding) |
| `WafControlResult` | Per-run, per-control evaluation row (score %, threshold met flag) |
| `WafQualitativeResponse` | Workspace-shared answer to a qualitative control (yes/partial/no/n-a) |
| `WafIgnoredResource` | Workspace-shared exclusion of a control or resource from scoring |
| `ForgeAppConfig` | Workspace-shared runtime feature flags (singleton row, currently holds `demoModeEnabled`) |
| `Locale` | Supported UI locale: `"en" \| "pt-BR" \| "es"` (`i18n/config.ts`) |
| `CommentOutputLanguage` | Natural language for AI-generated comments + use cases (independent of UI locale) |

## Pipeline Steps (Discover Usecases)

The core pipeline runs these steps sequentially:

1. **business-context** -- Generate business context via Model Serving (goals, priorities, value chain) **[fast]**
2. **metadata-extraction** -- Query `information_schema` for catalogs, schemas, tables, columns
3. **table-filtering** -- Classify tables as business vs technical via Model Serving (JSON mode) **[fast]**
4. **usecase-generation** -- Generate use cases in parallel batches via Model Serving (JSON mode) **[premium]**
5. **domain-clustering** -- Assign domains and subdomains via Model Serving (JSON mode) **[fast]**
6. **scoring** -- Score **[premium]**, deduplicate **[fast]**, calibrate **[premium]**, and rank use cases. The run is marked **`completed` at 95% progress** here so users can explore use cases immediately; the remaining 5% covers the SQL background job and post-completion engines.

After scoring resolves, the engine fires four background jobs (see "SQL Engine
(Background)" and "Business Value Engine" below):

- **sql-engine** (sequential gate) -- bespoke SQL generated per use case via Model Serving (streaming) **[premium]**, streaming `sqlStatus` updates per row.
- **business-value-analysis** (parallel) -- Financial quantification, roadmap phasing, executive synthesis, stakeholder analysis via Model Serving (JSON mode) **[fast]**. No SQL dependency, runs in parallel with `sql-engine`.
- **genie-engine** (deferred) -- Fires only after `sql-engine` resolves so generated SQL grounds the Genie space recommendations.
- **dashboard-engine** (deferred) -- Fires only after `sql-engine` resolves so generated SQL grounds the Lakeview dashboard recommendations.

Each step updates progress in Lakebase. The frontend polls for status.

## SQL Engine (Background)

SQL generation moved off the blocking critical path in 2026 — it now runs as a
fire-and-forget background job after step 6 (Scoring) so users can explore use
cases immediately. The job streams `sqlStatus` per use case so the UI can show
per-row badges (`pending` → `generating` → `generated` / `failed`) as SQL
lands. See `docs/release-notes/RELEASE_NOTES_2026_05_23.md` (if present) and
the implementation files below.

Key modules:
- `lib/pipeline/steps/sql-generation.ts` -- `runSqlGeneration(ctx, runId, opts)` with `SqlGenerationOptions` (`signal`, `onProgress`, `streamPersistence`). Per-wave abort checks; per-row `updateUseCaseSql` writes when `streamPersistence` is enabled.
- `lib/pipeline/sql-engine-status.ts` -- in-memory job status + `AbortController` + write-through to `ForgeBackgroundJob` (mirrors `lib/genie/engine-status.ts`).
- `lib/pipeline/engine.ts` -- `startBackgroundJobs()` runs SQL first; only after SQL resolves do Genie + Dashboard fire; BV runs in parallel.
- `lib/lakebase/usecases.ts` -- `updateUseCaseSql`, `markUseCasesSqlPending`, `getSqlStatusCounts`.

`sqlStatus` value space on `ForgeUseCase`:
- `null` -- legacy row, not in scope
- `"pending"` -- queued for the SQL background job
- `"generating"` -- currently in flight
- `"generated"` -- success
- `"failed"` -- terminal failure (UI shows a per-run "Retry SQL generation" CTA)

API routes (`requireUser` via `proxy.ts`; `loadRunOrRespond("edit")` / `("read")`):
- `POST /api/runs/[runId]/sql-engine/generate` -- manual regenerate (409 if a job is already in flight); logs `sql_engine_regenerated`.
- `GET /api/runs/[runId]/sql-engine/generate/status` -- returns the engine status plus `getSqlStatusCounts(runId)` (pending/generating/generated/failed/total).
- `POST /api/runs/[runId]/sql-engine/generate/cancel` -- aborts the in-flight job; logs `sql_engine_cancelled`.

UI surfaces:
- `components/pipeline/sql-progress-banner.tsx` -- run-detail banner that polls the status endpoint and triggers `router.refresh()` on terminal transitions.
- `components/pipeline/sql-status-badge.tsx` -- per-use-case pill rendered on the use-case table.
- `components/pipeline/use-case-table.tsx` -- SQL Code section renders skeleton (pending/generating), retry CTA (failed), or the code block (generated).
- `lib/hooks/use-run-detail.ts` -- exposes `sqlGenerating` + a refresh loop that re-fetches the run every ~7s while the SQL job is active so badges update live.

Activity log additions: `sql_engine_started`, `sql_engine_completed`,
`sql_engine_failed`, `sql_engine_cancelled`, `sql_engine_regenerated`.

## Genie Studio

Genie Studio (`/genie`) is the unified hub for creating, managing, and improving
Databricks Genie Spaces. It provides multiple entry points for space creation
and an auto-improvement loop for existing spaces.

Entry points:
1. **Scan Schema** (`/genie/create/schema`) -- point at catalog.schema, auto-scan + AI table selection + data profiling, then generate via ad-hoc engine
2. **Upload Requirements** (`/genie/create/requirements`) -- upload PDF/MD/text, LLM extracts tables/questions/instructions, then generate
3. **Describe Your Space** (via Ask Forge) -- conversational ad-hoc Genie builder
4. **Improve Existing** -- result-based benchmarks with auto-fix loops until target score
5. **Import JSON** -- paste and analyze serialized space JSON
6. **Pipeline Run** -- full discovery pipeline with domain-based recommendations

Key modules:
- `lib/genie/schema-scanner.ts` -- schema scan, data profiling, LLM table selection for "Scan Schema" flow
- `lib/genie/requirements-parser.ts` -- PDF/MD/text parsing, LLM requirements extraction for "Upload Requirements" flow
- `lib/genie/auto-improve.ts` -- iterative benchmark -> fix -> re-benchmark loop until target score
- `lib/genie/eval-types.ts` -- Genie Eval API types (1:1 with Databricks REST API): `EvaluationStatusType`, `GenieEvalAssessment`, `ScoreReason`, response/result/run types
- `lib/genie/benchmark-runner.ts` -- eval run orchestrator: `runEval()` creates runs via Genie Eval API, polls, fetches results with `GOOD/BAD/NEEDS_REVIEW` assessments and `ScoreReason[]`
- `lib/genie/benchmark-feedback.ts` -- `ScoreReason`-to-check-ID mapping for targeted fix strategies (25 ScoreReason values)
- `lib/genie/sync-jobs.ts` -- in-memory job store for workspace sync (fire-and-forget pattern)
- `lib/lakebase/genie-space-cache.ts` -- CRUD for `ForgeGenieSpaceCache` (workspace listing cache)

Workspace space cache:
- On page load, the listing reads from `ForgeGenieSpaceCache` in Lakebase (fast, no Databricks API calls).
- User-triggered "Sync Spaces" fires a background job (`POST /api/genie-spaces/sync`) that paginates the Databricks `listGenieSpaces` API and upserts results into the cache. Client polls for progress.
- Individual space detail pages write metadata + health back to the cache on visit.

Data model: `ForgeGenieSpaceCache` (see Prisma schema).

API routes:
- `GET /api/genie-spaces` -- list from Lakebase cache + tracking data (fast)
- `POST /api/genie-spaces/sync` -- start background sync job (fire-and-forget)
- `GET /api/genie-spaces/sync?jobId=X` -- poll sync job status

## Genie Engine (Post-Pipeline)

The Genie Engine (`lib/genie/engine.ts`) generates Databricks Genie Space
recommendations from pipeline results. See `docs/GENIE_ENGINE.md` for full documentation.

Key modules:
- `lib/genie/engine.ts` -- orchestrator (table selection + up to 8 LLM passes)
- `lib/genie/assembler.ts` -- assembles pass outputs into `SerializedSpace` v2 payload (alias-based join SQL, relationship type encoding)
- `lib/genie/types.ts` -- all Genie types (`GenieEngineConfig`, `SerializedSpace`, etc.)
- `lib/genie/quality-presets.ts` -- `QualityPreset` type, `GenerationBudget` interface, Speed/Balanced/Premium budgets, `resolveBudget()`
- `lib/genie/time-periods.ts` -- auto-generated date filters/dimensions with fiscal year support
- `lib/genie/entity-extraction.ts` -- sample-data-driven entity matching
- `lib/genie/schema-allowlist.ts` -- grounded generation (only scraped columns/tables, CREATE DDL exclusion)
- `lib/genie/passes/` -- individual LLM pass modules (column intelligence, semantic expressions, trusted assets, benchmarks, metric views)
- `lib/genie/passes/semantic-expressions.ts` -- 3-worker parallel measure generation (foundation, ratio, filter/dimension)
- `lib/genie/passes/parse-llm-json.ts` -- robust LLM JSON parsing utility
- `lib/genie/recommend.ts` -- legacy (non-engine) Genie recommendation fallback
- `lib/genie/engine-status.ts` -- in-memory progress tracker
- `lib/genie/llm-cache.ts` -- in-memory LLM response cache with retry logic
- `lib/genie/concurrency.ts` -- bounded-concurrency execution utility
- `lib/ai/sql-rules.ts` -- shared Databricks SQL quality rules (`DATABRICKS_SQL_RULES`, `DATABRICKS_SQL_RULES_COMPACT`, `DATABRICKS_SQL_REVIEW_CHECKLIST`)
- `lib/ai/sql-reviewer.ts` -- LLM-as-reviewer SQL quality module (`reviewSql`, `reviewAndFixSql`, `reviewBatch`) using `serving-endpoint-review`
- `lib/dbx/genie.ts` -- Databricks Genie REST API client (create/update/trash spaces, payload sanitization)
- `lib/lakebase/genie-recommendations.ts` -- persistence for generated recommendations
- `lib/lakebase/genie-engine-config.ts` -- versioned engine config per run
- `lib/lakebase/genie-spaces.ts` -- deployed space tracking

Data model: `GenieEngineConfig`, `GenieEnginePassOutputs`, `SerializedSpace`,
`GenieSpaceRecommendation`, `GenieEngineRecommendation` (see `lib/genie/types.ts`).

## Business Value Engine (Post-Pipeline)

The Business Value Engine (`lib/pipeline/steps/business-value-analysis.ts`) runs
as pipeline step 8, producing financially-grounded deliverables from scored use
cases. See `docs/BUSINESS_VALUE.md` for full documentation.

Key modules:
- `lib/pipeline/steps/business-value-analysis.ts` -- orchestrator (4 LLM passes)
- `lib/ai/templates-business-value.ts` -- prompt templates (financial quantification, roadmap phasing, executive synthesis, stakeholder analysis)
- `lib/lakebase/value-estimates.ts` -- CRUD for `ForgeValueEstimate`
- `lib/lakebase/roadmap-phases.ts` -- CRUD for `ForgeRoadmapPhase`
- `lib/lakebase/use-case-tracking.ts` -- CRUD for `ForgeUseCaseTracking`
- `lib/lakebase/value-captures.ts` -- CRUD for `ForgeValueCapture`
- `lib/lakebase/strategy-documents.ts` -- CRUD for `ForgeStrategyDocument` + `ForgeStrategyAlignment`
- `lib/lakebase/stakeholder-profiles.ts` -- CRUD for `ForgeStakeholderProfile`
- `lib/lakebase/portfolio.ts` -- cross-run portfolio aggregation

Data model: `ForgeValueEstimate`, `ForgeRoadmapPhase`, `ForgeUseCaseTracking`,
`ForgeValueCapture`, `ForgeStrategyDocument`, `ForgeStrategyAlignment`,
`ForgeStakeholderProfile` (see Prisma schema). `ForgeRun.synthesisJson` stores
executive synthesis output.

Master Repository v2 grounding (financial-quantification pass):
- `FINANCIAL_QUANTIFICATION_PROMPT` is now grounded in the canonical
  `ECONOMIC_PATTERNS` table (`lib/domain/economic-patterns.ts`) and the
  per-industry Master Repo enrichment (`lib/domain/industry-outcomes/*.enrichment.ts`).
- The prompt asks the model to (1) pick one of 10 canonical economic patterns
  per use case, (2) substitute concrete formula variables, and (3) emit
  `economic_pattern_name`, `economic_impact_category`, and
  `economic_formula_vars` alongside the legacy `value_type` / low / mid / high.
- These three new fields are persisted on `ForgeValueEstimate`
  (`economicPatternName`, `economicImpactCategory`, `economicFormulaVars`) so
  downstream features (Data Gap value-at-risk, exports) can replay the
  formula without re-prompting.

## Data Gap Analysis Engine

The Data Gap engine (`lib/engines/data-gap-analysis/engine.ts`) evaluates a
catalog scope -- a pipeline run or estate scan -- against the industry's
Master Repository v2 Reference Data Assets and produces an asset-level
coverage matrix plus economic value-at-risk.

Key modules:
- `lib/engines/data-gap-analysis/engine.ts` -- pure `runDataGapAnalysis(input)`
  entry point (no DB / no LLM / no network)
- `lib/engines/data-gap-analysis/recommendations.ts` --
  `buildIngestionRecommendations(asset)` ranks the four ingestion paths
  (Lakeflow Connect, UC Federation, Lakebridge Migrate, Bespoke) using the
  master repo's `High` / `Low` ratings
- `lib/engines/data-gap-analysis/economic-value.ts` --
  `computeValueAtRisk` (per-asset attribution) and
  `computeSummaryValueAtRisk` (deduplicated portfolio total). VA-only links
  produce a 30% partial loss vs blocked MC links
- `lib/engines/data-gap-analysis/types.ts` -- `DataGapResult`,
  `AssetCoverage`, `AssetValueAtRisk`, `IngestionStrategy`
- `lib/lakebase/data-gap-analyses.ts` -- CRUD for `ForgeDataGapAnalysis`

Data model: `ForgeDataGapAnalysis` (per run or scan, owner-scoped, stores
`coverageJson` + `valueAtRiskJson` + summary metrics).

API routes:
- `GET /api/runs/[runId]/data-gap` -- read latest cached analysis, falling
  back to an on-demand compute if none exists
- `POST /api/runs/[runId]/data-gap` -- recompute and persist
- `GET /api/master-repo/[industryId]` -- serve the Master Repo enrichment
  (reference data assets + mapped use cases) used by the outcomes browser

UI surfaces:
- `components/pipeline/run-detail/data-gap-card.tsx` -- Run detail
  Outcome-Map tab card: per-asset coverage table, MC/VA tallies, ingestion
  recommendation, top-N missing-asset value-at-risk
- `components/outcomes/master-repo-section.tsx` -- Outcomes browser detail
  view: Reference Data Assets grouped by family + mapped Master Repo use
  cases with economic pattern badges

## Genie Health Check Engine

The Health Check Engine (`lib/genie/space-health-check.ts`) provides a deterministic
scoring system for any Genie Space, an automated Fix Workflow, and an iterative
Benchmark Feedback Loop. See `docs/GENIE_HEALTHCHECK_ENGINE.md` for full documentation.

Key modules:
- `lib/genie/health-checks/default-checks.yaml` -- built-in check definitions (YAML DSL, includes `instruction_quality` evaluator)
- `lib/genie/health-checks/evaluators.ts` -- deterministic evaluator functions (count, ratio, pattern, sql_quality, instruction_quality, etc.)
- `lib/genie/health-checks/registry.ts` -- YAML parser, merge defaults + user overrides
- `lib/genie/health-checks/types.ts` -- TypeScript types for the health check system
- `lib/genie/space-health-check.ts` -- scorer (pure function, no LLM calls)
- `lib/genie/space-fixer.ts` -- fix strategy router, metadata builder for off-platform spaces
- `lib/genie/space-cache.ts` -- in-memory serialized_space cache (5min TTL)
- `lib/genie/benchmark-feedback.ts` -- `ScoreReason`-to-check-ID mapping for targeted fix strategies
- `lib/genie/auto-improve.ts` -- iterative eval -> analyze -> fix -> re-eval loop with three-space architecture
- `lib/lakebase/space-health.ts` -- CRUD for health scores, benchmark runs, config
- `components/genie/health-detail-sheet.tsx` -- health report slide-out panel

Data model: `ForgeSpaceBenchmarkRun`, `ForgeSpaceHealthScore`, `ForgeHealthCheckConfig`
(see Prisma schema).

## Estate Scan Pipeline (Environment Intelligence)

The estate pipeline (`lib/pipeline/standalone-scan.ts`) scans Unity Catalog
metadata and applies LLM intelligence to produce a comprehensive view of the
data estate. See `ESTATE_ANALYSIS.md` for full documentation.

Key modules:
- `lib/queries/metadata.ts` -- table/column discovery from `information_schema`
- `lib/queries/metadata-detail.ts` -- DESCRIBE DETAIL/HISTORY/TBLPROPERTIES
- `lib/queries/lineage.ts` -- BFS lineage walking via `system.access.table_lineage`
- `lib/domain/health-score.ts` -- rule-based health scoring (10 rules)
- `lib/pipeline/environment-intelligence.ts` -- 8 LLM passes (domains, PII, descriptions, redundancy, relationships, tiers, data products, governance)
- `lib/export/erd-generator.ts` -- ERD graph builder + Mermaid export
- `lib/export/environment-excel.ts` -- 12-sheet Excel report
- `lib/lakebase/environment-scans.ts` -- persistence + aggregate estate view
- `lib/pipeline/scan-progress.ts` -- in-memory progress tracker

Data model: `ForgeEnvironmentScan`, `ForgeTableDetail`, `ForgeTableHistorySummary`,
`ForgeTableLineage`, `ForgeTableInsight` (see Prisma schema).

## Shared Metadata Context Layer

The `lib/metadata/` module provides a reusable, extractable schema understanding
layer. Any feature that needs to understand a Unity Catalog schema holistically
can call `buildSchemaContext()` to get a fully classified, relationship-aware,
lineage-enriched view. Zero Forge-specific dependencies -- could be extracted
as a standalone package.

Key modules:
- `lib/metadata/types.ts` -- `SchemaContext`, `EnrichedTable`, `EnrichedColumn`, `NamingSignals`, `InferredRelationship` (zero internal imports)
- `lib/metadata/deterministic.ts` -- pure functions: tier/role detection from naming prefixes, column role inference (`_id`→FK, `_at`→timestamp, `is_`→flag, `_amount`→measure), FK target inference, write frequency analysis, schema naming profile
- `lib/metadata/fetcher.ts` -- orchestrates `lib/queries/` modules to fetch tables, columns, FKs, comments, types, tags, lineage (`walkLineage`), and history (`enrichTablesInBatches`); all enrichments gracefully optional
- `lib/metadata/classifier.ts` -- LLM-based schema intelligence: domain, role, tier, and industry data asset mapping per table; token-aware batching for large schemas; deterministic fallback on LLM failure
- `lib/metadata/context-builder.ts` -- `buildSchemaContext(scope, options)` top-level orchestrator producing `SchemaContext`

Current consumer: Comment Engine. Future consumers: Genie Engine, Ask Forge,
data quality rules, documentation generation.

## AI Comments (Industry-Aware Catalog Documentation)

The Comment Engine (`lib/ai/comment-engine/engine.ts`) generates the highest-quality
table and column descriptions by building holistic schema understanding before
describing any individual table. Optimised for Genie Space discoverability.

Architecture (4 phases):
1. **Phase 0+1: Schema Context** -- `buildSchemaContext()` fetches all metadata, runs deterministic analysis (naming patterns, FK inference), then LLM classification (domain, role, tier, data asset mapping)
2. **Phase 2: Table Comments** -- batched table descriptions with full schema summary, industry Reference Data Assets, use case linkages, lineage, and write-frequency signals
3. **Phase 3: Column Comments** -- parallel per-table column descriptions with domain context, related tables, data asset descriptions, and deterministic role hints
4. **Phase 4: Consistency Review** -- terminology consistency, cross-table reference accuracy, and Genie-readiness audit (optional, on by default)

Comment Engine modules:
- `lib/ai/comment-engine/engine.ts` -- main orchestrator (wires schema context + industry knowledge through all passes)
- `lib/ai/comment-engine/prompts.ts` -- prompt templates for table, column, and consistency review passes (Genie-optimised)
- `lib/ai/comment-engine/table-pass.ts` -- Phase 2 implementation
- `lib/ai/comment-engine/column-pass.ts` -- Phase 3 implementation
- `lib/ai/comment-engine/consistency-pass.ts` -- Phase 4 implementation
- `lib/ai/comment-engine/types.ts` -- `CommentEngineConfig`, `CommentEngineResult`, `ConsistencyFix`

Industry knowledge (enriches all prompts):
- `lib/domain/industry-outcomes-server.ts` -- `buildDataAssetContext()` renders Reference Data Assets; `buildUseCaseLinkageContext()` maps assets to use cases with criticality and benchmark impacts

DDL + persistence layer:
- `lib/ai/comment-generator.ts` -- facade: delegates to Comment Engine, persists proposals to Lakebase
- `lib/ai/comment-applier.ts` -- DDL execution, permission checking, undo
- `lib/lakebase/comment-jobs.ts` -- CRUD for `ForgeCommentJob`
- `lib/lakebase/comment-proposals.ts` -- CRUD for `ForgeCommentProposal`

UI modules:
- `app/environment/comments/page.tsx` -- main AI Comments page (setup, review, apply)
- `components/environment/comment-table-nav.tsx` -- table navigator panel
- `components/environment/comment-review-panel.tsx` -- old-vs-new review with inline editing
- `components/environment/comment-action-bar.tsx` -- bulk apply/undo sticky bar

Data model: `ForgeCommentJob`, `ForgeCommentProposal` (see Prisma schema).

API routes:
- `POST /api/environment/comments` -- create job
- `GET /api/environment/comments` -- list jobs
- `POST /api/environment/comments/generate` -- SSE generation stream
- `GET /api/environment/comments/[jobId]` -- job detail + proposals
- `PATCH /api/environment/comments/[jobId]/proposals` -- accept/reject/edit
- `POST /api/environment/comments/[jobId]/apply` -- apply DDL to UC
- `POST /api/environment/comments/[jobId]/undo` -- restore original comments
- `POST /api/environment/comments/check-permissions` -- SHOW GRANTS pre-check

## Ask Forge (Conversational Assistant)

Ask Forge is a RAG-powered conversational AI assistant. See `ASK_FORGE.md`
for full documentation.

Key modules:
- `lib/assistant/engine.ts` -- orchestrator (intent → context → LLM → actions)
- `lib/assistant/intent.ts` -- LLM-based intent classification with heuristic fallback
- `lib/assistant/context-builder.ts` -- dual-strategy context pipeline (Lakebase + RAG)
- `lib/assistant/prompts.ts` -- system prompt, user template, message builder
- `lib/assistant/sql-proposer.ts` -- SQL extraction, validation (EXPLAIN)
- `lib/assistant/dashboard-proposer.ts` -- dashboard intent detection and proposal extraction
- `lib/lakebase/assistant-log.ts` -- CRUD for `ForgeAssistantLog` table
- `lib/lakebase/conversations.ts` -- CRUD for `ForgeConversation` (per-user chat history)
- `components/assistant/ask-forge-chat.tsx` -- main chat component (SSE streaming, actions)
- `components/assistant/ask-forge-context-panel.tsx` -- side panel (tables, sources, enrichments)
- `components/assistant/conversation-history.tsx` -- ChatGPT-like history sidebar
- `components/assistant/answer-stream.tsx` -- real-time markdown rendering (`react-markdown` + `remark-gfm`)
- `app/ask-forge/page.tsx` -- thin client shell with dynamic import (`ssr: false`)
- `app/ask-forge/ask-forge-content.tsx` -- main page content (history, chat, context panel)

Data model: `ForgeAssistantLog`, `ForgeConversation`, `ConversationMessage`,
`TableEnrichmentData`, `SourceData`, `ActionCardData` (see `lib/assistant/` and Prisma schema).

API routes:
- `POST /api/assistant` -- SSE streaming endpoint
- `POST /api/assistant/feedback` -- thumbs up/down feedback
- `GET /api/assistant/conversations` -- list user conversations
- `POST /api/assistant/conversations` -- create conversation
- `GET /api/assistant/conversations/[id]` -- load conversation with messages
- `PATCH /api/assistant/conversations/[id]` -- rename conversation
- `DELETE /api/assistant/conversations/[id]` -- delete conversation and logs

## Demo Mode (Synthetic Data Generator)

Demo Mode (`lib/demo/`) is an internal Field Engineering and Sales tool that
generates custom synthetic demo datasets for customer-specific demonstrations.
See `docs/DEMO_MODE.md` for the full team guide.

Architecture: two independent engines run sequentially via a 6-step wizard.

### Research Engine

`lib/demo/research-engine/engine.ts` -- LLM-powered company research with
configurable depth (Quick / Balanced / Full presets).

Key modules:
- `lib/demo/research-engine/engine.ts` -- `runResearchEngine()` orchestrator
- `lib/demo/research-engine/engine-status.ts` -- in-memory + Lakebase job status
- `lib/demo/research-engine/prompts.ts` -- prompt templates for all passes
- `lib/demo/research-engine/types.ts` -- `ResearchEngineInput`, `ResearchEngineResult`
- `lib/demo/research-engine/passes/` -- individual pass modules (website-scrape, ir-crawler, doc-parser, industry-classification, outcome-map-generation, quick-synthesis, industry-landscape, company-deep-dive, data-strategy-mapping, demo-narrative, **key-quotes-extraction**, **source-summaries**, **persona-talk-track**, **evidence-linking**)
- `lib/demo/research-engine/industry-cache.ts` -- in-memory LRU cache (24h TTL) keyed by `industryId::subVertical` for reusing `industry-landscape` outputs across sessions in the same segment
- `lib/demo/research-engine/recency.ts` -- `recencyWeight()` / `isStale()` / `publishedYearOf()` utilities; tunable constants `RECENT_YEARS`, `HARD_FLOOR_YEARS`, `STALE_YEARS`, `UNKNOWN_DATE_WEIGHT` (single source of truth for the recency bias curve)
- `lib/demo/research-engine/date-extraction.ts` -- detects `publishedAt` from sitemap `lastmod`, SEC filing dates, HTTP `Last-Modified`, HTML meta / JSON-LD, URL / filename year regex, and text-body scan; tags a `dateConfidence` of `high` | `medium` | `low` | `unknown`

Passes (vary by preset): source collection → industry classification → outcome map
generation (if needed) → Phase-1 fan-out (industry-landscape ∥ key-quotes-extraction ∥ source-summaries) → analysis passes (quick-synthesis for Quick; strategy-and-narrative for Balanced; company-deep-dive → data-strategy-mapping → demo-narrative for Full) → Phase-5 fan-out (persona-talk-track ∥ evidence-linking).

**Consultant-grade outputs** (Balanced + Full): every major assertion is
grounded via a tiered `Evidence` model -- `sourced` (verbatim quote + URL),
`benchmark` (industry-standard ranges), or `inferred` (explicit rationale).
The `evidence-linking` pass uses the pgvector `company_research` embeddings
(keyed by `customerName`) to attach verbatim quotes to `sourced` claims; any
claim that cannot be grounded is downgraded to `inferred`. New output fields
on `ResearchEngineResult`: `executiveBrief` (Who / What / What's Broken / Why
Now / Where We Win + Situation-Complication-Resolution), `personaTalkTracks`
(5 executive personas with provocative opening, 3 objections + responses,
discovery ladder, close signal), `sourceSummaries`, and `keyQuotes`.
Expanded `KillerMoment` includes `problemStatement`, `hypothesisTree`,
`quantifiedImpact` (low/mid/high + unit), `kpiDelta`, `riskOfInaction`,
`discoveryQuestions`, `measureOfSuccess`, `evidence[]`, `idealBuyerPersona`,
and `timeToValue`.

**Source recency bias**: every collected source is tagged with `publishedAt`,
`publishedYear`, and `dateConfidence`. `perSourceData` in the engine is sorted
by `recencyWeight(source) * volume` before LLM passes so token truncation drops
old material first. `company_research` embeddings carry `publishedAt` +
`ttlDays=365` in `metadataJson`, and `evidence-linking` runs retrieval with
`enforceSourcePriority: true`, activating the retriever's graded `freshnessMultiplier`
(full weight < 2 years, soft decay to 0.25 by year 5). Prompts include a
`Published: YYYY-MM-DD` line per source and are instructed to prefer recent
material; UI (`source-list.tsx`, `evidence-list.tsx`) shows publication year
and a "Stale: YYYY" badge for anything older than 3 years. See `docs/DEMO_MODE.md`
("Source Recency Bias") for the full layering.

### Data Engine

`lib/demo/data-engine/engine.ts` -- generates and writes synthetic Delta tables
directly to Unity Catalog using SQL-first approach (no Python/Faker dependencies).

Key modules:
- `lib/demo/data-engine/engine.ts` -- `runDataEngine()` orchestrator
- `lib/demo/data-engine/engine-status.ts` -- per-table phase tracking + Lakebase persistence
- `lib/demo/data-engine/prompts.ts` -- prompt templates for schema/SQL generation
- `lib/demo/data-engine/types.ts` -- `DataEngineInput`, `DataEngineResult`, `TableResult`
- `lib/demo/data-engine/date-window.ts` -- `computeDemoDateWindow()` anchors every generated row to a rolling last-completed-FY + YTD window so demos never drift into stale years; threaded through narrative / seed / fact prompts and the validation freshness check
- `lib/demo/data-engine/passes/` -- individual pass modules (narrative-design, schema-design, seed-generation, fact-generation, validation, **genie-deploy**)
- `components/demo/session/data-window-card.tsx` -- session-page chip + per-fact-table MIN→MAX date coverage with Stale badge

Passes: narrative design → schema design → seed generation (dimensions) → fact generation
(CTAS with EXPLODE/SEQUENCE) → validation (row counts, FK integrity, date freshness) →
single-shot fact-freshness auto-fix loop for any table flagged outside the window →
**Genie deploy (Genie Mode only)**.

**Genie Mode** (Pass 5 `genie-deploy`): when `DataEngineInput.genieMode=true`,
every preceding pass gets a Genie-biased prompt block (wider row counts 8K–50K,
12–18 tables, star-schema bias, extra measures/hierarchical dims) and after
validation the engine runs `runFastGenieEngine` + `createGenieSpace` using the
user's OBO token (`DataEngineInput.oboToken`), seeds `ForgeGenieSpaceCache` via
`upsertCachedSpaces` + `updateCachedSpaceDiscovery` so `/genie` shows the new
space immediately, and calls `trackGenieSpaceCreated`. Failure is non-fatal --
the surrounding engine records `genieDeployError` on the result and data
generation still succeeds. The Genie Space id/url flow through the session's
`dataModelJson` envelope and surface in the wizard Complete step and the
session detail page as a violet "Genie Space" card. Constants:
`DEMO_GENIE_ROW_BAND` / `DEMO_GENIE_TABLE_BAND` in `lib/demo/types.ts`.
Activity log: `demo_genie_space_deployed`.

### Shared Demo Modules

- `lib/demo/config.ts` -- async `isDemoModeEnabled()` feature gate reading the `ForgeAppConfig` singleton (cached 30s); `setDemoModeEnabled()` + `invalidateDemoModeCache()` for the UI toggle. `FORGE_DEMO_MODE_ENABLED` env var seeds the row on first read.
- `lib/demo/types.ts` -- shared types (`ResearchPreset`, `DemoScope`, `TableDesign`, etc.)
- `lib/demo/scope.ts` -- department-to-asset-family resolution, schema name builder
- `lib/demo/cleanup.ts` -- `cleanupDemoSession()` (DROP TABLE/SCHEMA + Lakebase delete)

### Persistence

Data model: `ForgeDemoSession` (Prisma schema), `ForgeOutcomeMap.enrichmentJson`
for custom LLM-generated industry outcome maps.

- `lib/lakebase/demo-sessions.ts` -- CRUD for `ForgeDemoSession`
- `lib/lakebase/outcome-maps.ts` -- `getCustomEnrichment()`, `setCustomEnrichment()`

### UI

- `components/demo/demo-wizard.tsx` -- 6-step wizard modal (root component)
- `components/demo/demo-settings.tsx` -- settings card with session list + launch button
- `components/demo/steps/` -- step components (company-info, research-results, catalog-selection, schema-review, generation-progress, complete)

### API Routes

- `POST /api/demo/research` -- start research engine (fire-and-forget)
- `GET /api/demo/research/status` -- poll research job status
- `POST /api/demo/generate` -- start data engine (fire-and-forget)
- `GET /api/demo/generate/status` -- poll generation job status
- `POST /api/demo/validate-catalog` -- pre-check UC permissions
- `POST /api/demo/upload` -- upload PDF/text for research context
- `GET /api/demo/sessions` -- list all demo sessions
- `GET /api/demo/sessions/:id` -- session detail + research result
- `DELETE /api/demo/sessions/:id` -- cleanup: DROP UC objects + delete session

## WAF Assessment (Self-Service Well-Architected Framework)

The WAF Assessment module (`/assessment`) runs deterministic SQL across
`system.*` tables (via the user's OBO token) to score the workspace
against the seven Databricks Well-Architected Framework pillars and
166 best practices. Each failing control links to either a Forge
"Fix with Forge" engine or the canonical Databricks doc.

Pillar coverage (automatic queries today):
- Data and AI Governance, Reliability, Cost Optimisation,
  Performance Efficiency, Interoperability and Usability,
  Operational Excellence, Security/Compliance/Privacy.

Six controls without a deterministic SQL signal are evaluated
qualitatively (workspace-shared yes/partial/no/n-a responses).

Key modules:
- `lib/engines/waf-assessment/engine.ts` -- pillar query runner; loads SQL
  files, executes via OBO, parses per-control rows
- `lib/engines/waf-assessment/service.ts` -- orchestrator: insert run,
  call `runAllPillars()`, materialize qualitative results, apply
  workspace ignore list, persist results, compute scores
- `lib/engines/waf-assessment/catalog.ts` -- seeds 166 controls from the
  bundled CSV on first boot (idempotent)
- `lib/engines/waf-assessment/queries/*.sql` -- one static SQL file per
  pillar, no user-input interpolation (system.* only)
- `lib/engines/waf-assessment/cross-references.ts` -- maps each `waf_id`
  to AWS WAF / Azure WAF cross-reference badges
- `lib/engines/waf-assessment/csv.ts` -- CSV export helper for the
  assessment + drift-compare pages
- `lib/engines/waf-assessment/dashboard/builder.ts` -- builds the WAF
  Lakeview dashboard JSON from the bundled `template.lvdash.json`
- `lib/engines/waf-assessment/genie/builder.ts` -- builds the WAF Genie
  space `serialized_space`; merge-on-update preserves user-curated
  joins / measures / filters
- `app/assessment/page.tsx` -- single-file dashboard: per-pillar tabs,
  failing-first sort, history, qualitative editor, ignored editor,
  CSV export, dashboard/Genie regenerate buttons
- `app/assessment/compare/page.tsx` -- drift compare between two runs

Data model: `ForgeWafControl` (catalog), `ForgeWafAssessment` (run
header with `ownerEmail` + per-pillar scores), `ForgeWafControlResult`
(per-run rows, cascades from assessment), `ForgeWafQualitativeResponse`
(workspace-shared, one row per `wafId`), `ForgeWafIgnoredResource`
(workspace-shared exclusions). See `prisma/schema.prisma`.

API routes (all enforce `requireUser` -- proxy.ts gates `/api/**`,
handlers also call `requireUser` for explicit `user.email` access):
- `GET /api/assessment` -- latest assessment, history, controls,
  qualitative responses, ignored list (scoped to owner ∪ shared)
- `POST /api/assessment/run` -- run a fresh assessment synchronously
  (10-30s on a warm warehouse); emits `waf_assessment_*` activity log
- `GET /api/assessment/[assessmentId]` -- single assessment detail
  (404 if caller is neither owner nor in ACL share list)
- `GET /api/assessment/controls` -- catalog browser
- `GET /api/assessment/assets` -- presence/URLs of the workspace
  dashboard + Genie space (drives Generate vs Open toggles)
- `POST /api/assessment/dashboard` -- create or update the
  `/Shared/Forge Dashboards/...` Lakeview dashboard; `parentPath` is
  hard-coded server-side (NEVER honors a client-supplied path)
- `POST /api/assessment/genie` -- create or update the
  `/Shared/Forge Genie Spaces/...` Genie space; same `parentPath`
  lockdown; merges live `serialized_space` to preserve user edits
- `GET / POST / DELETE /api/assessment/qualitative` -- workspace-shared
  qualitative answers; `respondedBy` server-derived from `requireUser`
- `GET / POST / DELETE /api/assessment/ignored` -- workspace-shared
  control exclusions; `ignoredBy` server-derived from `requireUser`

Workspace-shared vs per-user data:
- Per-user (filtered by `ownerEmail` + ACL): `ForgeWafAssessment` runs.
  Sharing via `/api/share` (resourceType=`waf_assessment`) is supported.
- Workspace-shared (visible to everyone): controls catalog, qualitative
  responses, ignored resources, the Lakeview dashboard, and the Genie
  space. This is intentional -- they are configuration, not run output.

Activity log additions: `waf_assessment_started`,
`waf_assessment_completed`, `waf_assessment_failed`,
`waf_dashboard_generated`, `waf_genie_generated`.

## Internationalization (i18n)

Forge ships UI translations in three locales: English (`en`),
Brazilian Portuguese (`pt-BR`), and Spanish (`es`). The AI Comment
Engine and Discovery use case generation accept an *independent*
output-language setting so a user reading the UI in English can
generate comments in pt-BR and vice versa.

Key modules:
- `i18n/config.ts` -- `SUPPORTED_LOCALES`, `Locale` type,
  `pickLocaleFromAcceptLanguage()` fallback, `LOCALE_COOKIE` constant
- `i18n/request.ts` -- `getRequestConfig` for next-intl: cookie
  (`NEXT_LOCALE`) → Accept-Language fallback; loads `messages/<locale>.json`
- `i18n/format.ts` -- `useL10n()` client hook bundling
  `date / dateTime / relative / number / integer / percent` formatters
- `messages/{en,pt-BR,es}.json` -- string catalogs (~1300 keys each)
- `components/language-toggle.tsx` -- header dropdown that writes
  `NEXT_LOCALE` cookie and reloads to apply RSC re-render

UI integration:
- `app/layout.tsx` wraps the tree in `NextIntlClientProvider` from
  `next-intl/server` `getMessages()`. Use `useTranslations("namespace")`
  in client components, `getTranslations("namespace")` in Server
  Components / route handlers.

AI output language (independent of UI locale):
- `CommentOutputLanguage` type (`"en" | "pt-BR" | "es"`) in
  `lib/ai/comment-engine/types.ts`
- Persisted in `AppSettings.aiCommentLanguage` (Settings UI card)
- Plumbed through Discovery: `loadSettings().aiCommentLanguage` →
  `ConfigForm` → `CreateRunSchema.outputLanguage` (default `"en"`) →
  `PipelineRunConfig.outputLanguage` → `ensureCommentEnrichment()`
  (cache key includes language so a fresh English job is not reused for
  a pt-BR/es run) → `{output_language_directive}` placeholder injected
  into use case generation prompts
- Comment Engine prompts (table / column / consistency review) all
  receive the `{language_directive}` placeholder; AI tests in
  `__tests__/ai/templates-comments.test.ts` whitelist it from the
  "all placeholders are replaceable" check
- `ForgeCommentJob.outputLanguage` records the language used so the
  Comments page can badge non-English jobs

WAF Assessment is fully translated, including all 166 control
"Best Practice" + "Principle" strings. Score formatting uses
`useL10n().number()` so commas/decimals follow the active locale.

## User Isolation & Sharing

Forge is multi-tenant by default. Every "root" resource (run, scan, Genie
space, demo session, comment job, strategy document, document, fabric scan,
fabric migration, WAF assessment, etc.) carries an `ownerEmail` column.
Lists and detail endpoints scope to `ownerEmail = $user OR id ∈ shared(user)`;
vector search filters by parent resource accessibility. Sharing is opt-in:

- `ForgeResourceAcl` records per-resource grants (`view` or `edit`).
- `lib/lakebase/acl.ts` -- `listAccessibleIds`, `share`, `unshare`,
  `canRead`, `canEdit`, `clearAclForResource`.
- `/api/share` (GET/POST/DELETE) -- owner-only mutations.
- `<ShareDialog>` -- reusable dialog rendered from the run-detail header
  (and any other surface that adopts it).
- `ResourceType` ∈ {`run`, `scan`, `genie_space`, `metadata_genie_space`,
  `demo_session`, `comment_job`, `strategy_document`, `connection`,
  `document`, `bv_portfolio`, `benchmark_run`, `health_score`,
  `metric_view_proposal`, `fabric_scan`, `fabric_migration`,
  `waf_assessment`}.

Auth foundation:

- `proxy.ts` (Next.js 16's renamed middleware convention) enforces
  `requireUser` on all `/api/**` routes, forwarding `x-forge-user` so
  handlers and Server Components share one identity model. Do NOT add a
  `middleware.ts` alongside it -- the build will fail.
- `lib/auth/route-user.ts` -- `requireUser(request)` resolves email +
  OBO token from proxy headers (`x-forwarded-email`,
  `x-forwarded-access-token`) with `?as_user=` and `FORGE_LOCAL_USER_EMAIL`
  fallbacks for local dev only.
- `lib/auth/route-guards.ts` -- `loadRunOrRespond`,
  `loadResourceOrRespond`, `loadScanOrRespond`,
  `loadGenieSpaceBySpaceIdOrRespond`, `loadDemoSessionOrRespond`,
  `loadCommentJobOrRespond` -- consolidated auth+ACL boilerplate.
- Server Components do NOT pass through middleware; pages call
  `requireUser()` directly.

Per-user fairness:

- `lib/quotas.ts` -- `checkQuota(kind, userEmail, behavior)` enforces
  per-user caps on active resources. Pipelines use behaviour `"queue"`
  (the run is persisted as `status='queued'` and the scheduler promotes
  it later); scans, Genie deploys, and demo sessions use `"reject"`.
  Caps come from env: `FORGE_MAX_ACTIVE_PIPELINE_RUNS_PER_USER` (1),
  `FORGE_MAX_ACTIVE_SCANS_PER_USER` (1),
  `FORGE_MAX_ACTIVE_GENIE_DEPLOYS_PER_USER` (2),
  `FORGE_MAX_ACTIVE_DEMO_ENGINES_PER_USER` (1).
- `lib/dbx/rate-limiter.ts` -- max-min weighted fair-share between users
  on every per-endpoint semaphore. `acquire(endpoint, userKey)` and
  `release(endpoint, userKey)` track per-user inflight; the queued
  waiter belonging to the user with the fewest inflight calls wakes
  first.
- `lib/lakebase/usage.ts` -- `recordUsage.{pipelineRun,scan,genieDeploy,
  demoEngine,llmCall,embedTokens}` writes to `ForgeUsage` (per-user,
  per-day rollups). Read-only in this round; sets the foundation for
  future budget enforcement.

Queue & load visibility:

- `lib/pipeline/scheduler.ts` -- in-process scheduler that polls Lakebase
  every 5s, atomically claims `queued` runs whose owners now have free
  capacity (`UPDATE ... WHERE status='queued'` returns 1 only for the
  winner), and starts them via the registered starter.
  `notifyScheduler()` is called on every run completion / new enqueue.
  `getQueuePosition(runId)` returns 1-based position in the user's queue.
- `lib/dbx/system-load.ts` + `/api/system-load` -- aggregate load
  snapshot (per-endpoint inflight/queued/blocked, system-wide active
  counts, your inflight/queued). Never returns other users' identities.
- `<SystemLoadBanner />` (in `app/layout.tsx`) -- thin strip that appears
  only when the system is busy or throttled. Polls every 10s.
- Activity-log additions: `pipeline_queued`, `pipeline_promoted`,
  `endpoint_throttled`, `resource_shared`, `resource_unshared`.

Feature flag:

- `FORGE_USER_ISOLATION` (default ON). When OFF, per-user caps are not
  enforced and the share button is hidden. Data-layer `ownerEmail`
  filters are ALWAYS applied because the schema migration is
  forward-only -- the flag does not roll back isolation.
  See `lib/config/isolation-flag.ts`.

Cutover note: `lib/lakebase/reset.ts` `deleteAllData()` extends to
`ForgeResourceAcl`, `ForgeUsage`, fabric migrations/connections,
strategy documents, quality metrics, space benchmark/health rows, and
all WAF Assessment tables (assessment runs + cascaded results,
qualitative responses, ignored resources, controls catalog).
Demo-mode UC objects (catalogs/schemas dropped via
`cleanupDemoSession()`) and deployed Genie spaces / Lakeview dashboards
(live in Databricks) survive a wipe; release notes call this out.

## Infrastructure

| Concern            | Implementation                                              |
| ------------------ | ----------------------------------------------------------- |
| Logging            | `lib/logger.ts` -- structured JSON in prod, formatted in dev |
| Validation         | `lib/validation.ts` -- Zod schemas, SQL identifier safety   |
| Fetch timeouts     | `lib/dbx/fetch-with-timeout.ts` -- AbortController wrappers |
| Error boundaries   | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` |
| Health check       | `GET /api/health` -- DB + warehouse connectivity            |
| Security headers   | Via `next.config.ts` `headers()` function                   |
| Versioning         | `package.json` version in `/api/health`, sidebar, run metadata |
| Model routing      | `resolveEndpoint(tier)` routes all LLM calls via `lib/dbx/task-router.ts`; 5 tiers (reasoning, generation, classification, sql, lightweight); queue-depth-aware routing across model pool |
| Model pool         | `lib/dbx/model-registry.ts` -- declares endpoints, capabilities, concurrency caps; auto-discovers from env vars; `DATABRICKS_ALLOWED_MODELS` restricts pool; performance bundle models: `databricks-gemini-3-1-flash-lite` (pri 0, classification+lightweight), `databricks-llama-4-maverick` (pri 0, generation+classification), `databricks-gemini-3-flash` (pri 1, generation+classification+lightweight) |
| Model failover     | Three-layer availability failover: (1) `deploy.sh` probes endpoints via CLI with per-role fallback chains (`--skip-probe` to bypass); (2) `scripts/validate-endpoints.mjs` probes at startup, sets `FORGE_VALIDATED_ENDPOINTS`; (3) runtime 404/RESOURCE_DOES_NOT_EXIST triggers `markEndpointUnavailable()` and immediate endpoint rotation via `lib/toolkit/llm-cache.ts`. `/api/health` exposes pool availability. |
| Quality presets    | `lib/genie/quality-presets.ts` -- Speed/Balanced/Premium presets controlling `GenerationBudget` (target counts, domain concurrency, review surfaces, maxTokens); wired into `engine.ts`, `adhoc-engine.ts`, settings UI |
| SQL review         | `getReviewEndpoint()` routes SQL quality review to dedicated review model (`databricks-gpt-5-4` via `serving-endpoint-review`); `lib/ai/sql-reviewer.ts` provides `reviewSql()`, `reviewAndFixSql()`, `reviewBatch()`; opt-in per surface via `isReviewEnabled()` |
| Embeddings         | `lib/embeddings/client.ts` -- `databricks-qwen3-embedding-0-6b` (1024-dim) via `getEmbeddingEndpoint()`; batched (16/req) with 429/5xx retry |
| Vector search      | `lib/embeddings/store.ts` -- pgvector in Lakebase; `forge_embeddings` table with HNSW index; 12 entity kinds covering all estate + pipeline data |
| LLM cache + retry  | `lib/toolkit/llm-cache.ts` -- in-memory SHA-256-keyed cache (10min TTL) with 429/5xx retry |
| Rate limiting      | `lib/dbx/rate-limiter.ts` -- per-endpoint semaphores + independent 429 circuit breakers + max-min user fair-share; optional global ceiling via `GLOBAL_LLM_MAX_CONCURRENT` |
| Per-user fairness  | `lib/quotas.ts` -- per-user caps on pipelines/scans/Genie deploys/demo engines; pipelines queue, others reject 429 |
| Run scheduler      | `lib/pipeline/scheduler.ts` -- promotes `queued` runs when their owner has free capacity (atomic claim, 5s tick) |
| System load        | `/api/system-load` + `<SystemLoadBanner />` -- privacy-respecting load snapshot (per-endpoint queues + your inflight/queued) |
| Usage tracking     | `lib/lakebase/usage.ts` -- per-user/per-day rollups in `ForgeUsage` (read-only foundation for future budgets) |
| Concurrency        | `lib/toolkit/concurrency.ts` -- bounded-concurrency utility for parallel domains and batches |
| Toolkit            | `lib/toolkit/` -- shared utilities relocated from engine-specific paths for cross-engine reuse |
| Port interfaces    | `lib/ports/` -- abstract DI interfaces (LLMClient, SqlExecutor, SkillResolver, Logger, EngineProgress) |
| SQL Engine         | `lib/sql-engine/` -- unified generate/validate/review/fix pipeline behind LLMClient port |

## Engine Portability Architecture

All four primary engines (Comment, Genie, Dashboard, Health Check) accept optional
`deps` objects for dependency injection:

- **`CommentEngineDeps`** -- LLM client, logger, pre-built schema context, industry context
- **`GenieEngineDeps`** -- LLM client, logger
- **`DashboardEngineDeps`** -- LLM client, logger, reviewAndFixSql, isReviewEnabled
- **Health Check** -- injectable `reviewBatch` and `isReviewEnabled` functions via setter

Default Databricks implementations live in `lib/ports/defaults/` and wire the
ports to the concrete infrastructure (`model-serving`, `sql.ts`, `logger`, `skills/resolver`).

Shared utilities live in `lib/toolkit/` with deprecated re-export stubs at the
original paths for backward compatibility.

## Key Constraints

- **No raw SQL in components** -- all SQL lives in `/lib/queries/` (rule 01)
- **No hardcoded credentials** -- use Databricks Apps env vars (rule 00)
- **Loading/empty/error states** on every page and async component (rule 00)
- **Primary CTA per page** must be visually dominant (rule 02, rule 06)
- **Prompt templates** must include business context, metadata scope, and output format spec
- **SQL quality rules** -- all SQL-generating prompts must import rules from `lib/ai/sql-rules.ts` (never inline ad-hoc rules)
- **Privacy** -- only metadata (schemas, table/column names) is read; no row-level data access
- **Model pool backward compat** -- if only legacy env vars are set (`DATABRICKS_SERVING_ENDPOINT`, `_FAST`, `_REVIEW`), the app runs with a single-to-three endpoint pool identical to pre-pool behavior
- **Model availability failover** -- three-layer defense: deploy-time probing in `deploy.sh` selects best available models per role; startup-time validation via `scripts/validate-endpoints.mjs` prunes unavailable endpoints from the pool; runtime 404/RESOURCE_DOES_NOT_EXIST from `model-serving.ts` calls `markEndpointUnavailable()` and triggers immediate endpoint rotation in `llm-cache.ts`. The `available` flag on `ModelEndpoint` is permanent per process; restart to re-probe.
- **Generation budgets** -- all Genie Engine passes respect the `GenerationBudget` from `lib/genie/quality-presets.ts`; target counts, maxTokens, and review surfaces are never hardcoded in pass code; `config.qualityPreset` (default: `"balanced"`) drives the budget
- **Genie Conversation API MUST use OBO tokens** -- `startConversation`, `pollMessageCompletion`, `sendFollowUp`, and any new Genie Conversation API call MUST authenticate as the logged-in user via OBO token, NEVER as the service principal (`getAppHeaders()`). The Genie API returns 404 `RESOURCE_DOES_NOT_EXIST` when called with SP credentials because the SP does not own the space. Every API route that calls these functions MUST capture the OBO token from `request.headers.get("x-forwarded-access-token")` and pass it through. Use `resolveHeaders(undefined, oboToken)` or pass `oboToken` as a parameter. If a function runs in a background task (fire-and-forget), capture the OBO token while still in request context and thread it through the entire call chain.
- **User isolation is mandatory** -- every list/read API route MUST resolve the user via `requireUser` (the `proxy.ts` edge entry point enforces this) AND scope the underlying Prisma query by `ownerEmail` ∪ `listAccessibleIds(user.email, "<resourceType>")`. Per-resource detail/mutation routes MUST go through one of the `loadXxxOrRespond` guards in `lib/auth/route-guards.ts` so authorization is consistent. New embedding kinds MUST register a scope mapping in `lib/embeddings/kind-scope.ts`. Background jobs MUST capture `ownerEmail` and `oboToken` in request context and thread them into the engine entrypoint -- never resolve identity from an injected service-principal context.

## New Feature Integration Checklist

Every new feature that adds Prisma models, Lakebase tables, API routes, or UI
pages **must** complete all items below before the work is considered done.

| # | Integration Point | What to Do |
|---|---|---|
| 1 | **Factory reset** (`lib/lakebase/reset.ts`) | Add `prisma.<model>.deleteMany()` to `deleteAllData()`. Child tables with `onDelete: Cascade` are handled automatically. |
| 2 | **Activity logging** (`lib/lakebase/activity-log.ts`) | Add new `ActivityAction` members for user actions (create, apply, delete, etc.) and call `logActivity()` from API routes. |
| 3 | **Navigation** (`components/pipeline/sidebar-nav.tsx`) | Add the page to the appropriate nav section. |
| 4 | **Documentation** (`AGENTS.md`) | Document key modules, data model, and API routes in this file. |
| 5 | **Prisma schema** (`prisma/schema.prisma`) | Define models with indexes, relations, `@@map`. Run `npx prisma generate` after changes. New root models MUST include `ownerEmail String?` + `@@index([ownerEmail])`. |
| 6 | **SQL injection protection** | Identifiers → `validateFqn()` / `validateIdentifier()`. String literals → `escapeComment()`. Destructive patterns → blocklist. Never interpolate user input into raw SQL. |
| 7 | **Reuse existing components** | Catalog selection → `CatalogBrowser`. Industry list → `GET /api/industries`. Never use `value=""` on Radix `<SelectItem>`. |
| 8 | **User isolation** | Set `ownerEmail` on insert from `requireUser()`. Scope every list query by owner ∪ shared IDs. Use `loadXxxOrRespond` guards on per-resource routes. Add a `ResourceType` entry + a `lookupOwner` branch in `/api/share` if the resource should be shareable. |
| 9 | **Embeddings scope** | If the feature stores vectors via `lib/embeddings/store.ts`, register the new `EmbeddingKind` in `lib/embeddings/kind-scope.ts` so RAG retrievers respect ACL. |

Optional (case-by-case):

| # | Integration Point | When Needed |
|---|---|---|
| 10 | **Stats** (`app/api/stats/route.ts`) | If the feature should show counts on the main dashboard. |
| 11 | **Embeddings** (`lib/embeddings/store.ts`) | If the data should be searchable via Ask Forge RAG. |
| 12 | **Quotas** (`lib/quotas.ts`) | If the feature spawns a background engine or long-running job that should respect per-user caps. |

## Testing Expectations

- Unit tests for prompt template building (snapshot tests)
- Unit tests for use case scoring logic
- Unit tests for SQL query mappers (row-to-type)
- Unit tests for input validation (identifiers, UUIDs, Zod schemas)
- Integration test stubs for each pipeline step
- CI: lint + typecheck + tests (GitHub Actions at `.github/workflows/ci.yml`)
- Test runner: Vitest (`npm test` / `npm run test:watch`)
- Type checking: `npm run typecheck`
