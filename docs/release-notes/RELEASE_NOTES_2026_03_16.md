# Release Notes -- 2026-03-16

**Databricks Forge v0.37.5**

---

## v0.37.5 -- Fix Genie build progress step indicators

### Bug Fixes
- **Genie build progress steps never marked complete in fast mode** -- The fast Genie engine (`runFastGenieEngine`) does not report explicit step identifiers via `onProgress`, so `currentStep` stayed `null` throughout the build. The `GenieBuildProgress` component relied entirely on `currentStep` to derive step completion, meaning all six steps remained in "pending" state while the progress bar advanced. Added a percentage-based fallback: when `currentStep` is null, step completion is derived from `progressPct` against each step's `pct` threshold, and the next pending step shows an active pulse animation.

### Other Changes
- **app.yaml deployment config** -- Updated app resource bindings (lightweight endpoint, demo mode, pooler experiment, seed benchmarks).

---

## All Commits

| Hash | Summary |
|---|---|
| *(uncommitted)* | fix: Genie build progress steps not marking complete in fast mode |
