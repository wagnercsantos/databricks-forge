# Release Notes -- 2026-04-30

**Databricks Forge v0.40.1**

---

## v0.40.1 -- Opus 4.7 compatibility + max_tokens defaults

### Bug Fixes
- **Opus 4.7 temperature 400** -- `databricks-claude-opus-4-7` now rejects requests that include the `temperature` parameter with HTTP 400. Added a per-model `supportsTemperature` capability (only Opus 4.7 is `false`) and gated the wire body in `lib/dbx/model-serving.ts` so all callers can keep passing temperature without changes; the field is simply omitted for models that disallow it.
- **Claude Sonnet 4 silent 1K truncation** -- Databricks defaults `max_tokens` to 1,000 for Claude Sonnet 4 when the field is omitted, causing silent `finish_reason: length` truncation. The wire layer now always emits `max_tokens`, falling back to a per-model `defaultMaxTokens` when the caller doesn't specify one.

### Improvements
- **Gemini Flash output ceiling raised** -- `databricks-gemini-3-flash` and `databricks-gemini-3-1-flash-lite` `maxOutputTokens` raised from 8,192 to 32,768 to match Databricks' published per-request envelope.
- **Visible clamp warnings** -- The maxTokens clamp log was promoted from `info` to `warn` so unintended truncation (e.g. the 128K asks in `lib/pipeline/steps/scoring.ts` against a 32K Claude cap) surfaces in normal log views.
- **Per-model `defaultMaxTokens`** -- Added a sensible default per model: GPT-5.4 = 16,384; Claude Opus/Sonnet 4.x = 8,192; Gemini Flash + Llama Maverick = 4,096. Surfaced via `getModelCapabilities()` and logged in the pool startup summary.

### Other Changes
- Extended `ModelTemplate`, `ModelEndpoint`, `getModelCapabilities()`, and `UNKNOWN_CAPS` with the two new fields.
- Updated `__tests__/model-pool/model-registry.test.ts` (now 27 tests in the model-pool suite, 922 across the full repo) and the `__tests__/model-serving/content-parsing.test.ts` mock to match the new `getModelCapabilities` shape.

---

## All Commits

| Hash | Summary |
|---|---|
| `3447c1b` | fix(model-serving): make Opus 4.7 work + close Sonnet 4 max_tokens footgun |
