# Release Notes -- 2026-04-16

**Databricks Forge v0.39.5**

---

## v0.39.5 -- Large Schema Mode global scope fix

### Bug Fixes
- **Large Schema Mode now applies to standalone estate scans** -- Previously the setting only affected pipeline run steps (metadata extraction, use case generation, SQL generation) but was completely ignored by standalone estate scans. The column row cap is now enforced in both code paths.
- **Serialization gap in `generationOptions`** -- `largeSchemaMode` and `businessValueEnabled` were not persisted in the run's `generationOptions` JSON, causing the flags to default to `false` when a run was re-loaded from the database. Both flags are now serialized correctly.

### Improvements
- **"Schema Handling" settings card** -- The Large Schema Mode toggle has been extracted from the "Estate Scan" settings card into its own "Schema Handling" card, making it clear the setting applies globally to both pipeline runs and estate scans.
- **Corrected UI description** -- The toggle description previously stated "max 15 per table" but the actual budget constant is 25 columns per table. The UI and code comments are now aligned.

---

## All Commits

| Hash | Summary |
|---|---|
| `0279e96` | fix: make Large Schema Mode apply to both pipeline runs and estate scans |
