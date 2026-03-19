# Release Notes -- 2026-03-19

**Databricks Forge v0.39.0**

---

## v0.39.0 -- Migrate Genie Benchmarks to Official Eval API

### New Features
#### Genie Eval API Integration
Replaced the entire custom Genie benchmark system (SQL similarity, result-set comparison, LLM judge) with the official Databricks Genie Eval API (Beta). The five new endpoints (`createEvalRun`, `getEvalRun`, `listEvalRuns`, `listEvalResults`, `getEvalResultDetails`) handle execution, comparison, and scoring server-side. All benchmark runs now produce `GOOD/BAD/NEEDS_REVIEW` assessments with 25+ `ScoreReason` categories from Databricks LLM judge + result-set comparison.

### Improvements
#### Simplified Benchmark Architecture
Removed ~430 lines of custom comparison logic from the benchmark API route, replacing it with a thin proxy to the Eval API (~160 lines). Deleted all client-side SQL similarity, result-set matching, and LLM judge code. The Genie API is now the single source of truth for run state -- no more in-memory job trackers.

#### Richer Failure Categorization
The old `FailureCategory` enum (10 values) is replaced by `ScoreReason` (25+ values) from the Eval API, providing much more precise failure diagnoses. Each ScoreReason maps to specific health check fix strategies for targeted improvement.

#### Enhanced Benchmark UI
The benchmarks page now displays GOOD/BAD/NEEDS_REVIEW assessment badges, ScoreReason chips with human-readable labels, side-by-side SQL comparison (expected vs actual), and execution result tables. History tab fetches directly from the Eval API with Lakebase enrichments.

#### Eval-Aware Auto-Improve Loop
The auto-improve loop now uses `runEval()` instead of the old `runBenchmarks()`, polling the Eval API for completion. Three-space architecture, stagnation detection, and sequential fix evaluation all work with the new async eval flow.

### Other Changes
- New `lib/genie/eval-types.ts` with all Genie Eval API types (1:1 with REST API)
- Updated `ForgeSpaceBenchmarkRun` Prisma model: added `evalRunId`, `status`, `numCorrect`, `numNeedsReview`, `accuracy`; removed `totalQuestions`, `passedCount`, `failedCount`, `errorCount`
- Updated `AGENTS.md` and `docs/GENIE_HEALTHCHECK_ENGINE.md` to document new eval API architecture
- Rewrote all benchmark-feedback tests for ScoreReason-based mapping (30 tests)

---

## All Commits

| Hash | Summary |
|---|---|
| `d671224` | feat: migrate Genie benchmarks to official Databricks Eval API |
