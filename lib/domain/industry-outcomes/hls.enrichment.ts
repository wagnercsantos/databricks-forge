/**
 * Healthcare & Life Sciences (legacy collapsed id) -- Master Repository Enrichment
 *
 * Post Master Repo v2 split, `hls` aliases to the canonical `life-sciences`
 * industry. Retained for backwards compatibility with existing
 * `ForgeRun.config.industry` rows. New code should use
 * `life-sciences.enrichment` or `healthcare.enrichment` directly.
 */

import { LIFE_SCIENCES_USE_CASES, LIFE_SCIENCES_DATA_ASSETS } from "./life-sciences.enrichment";

export const HLS_USE_CASES = LIFE_SCIENCES_USE_CASES;
export const HLS_DATA_ASSETS = LIFE_SCIENCES_DATA_ASSETS;
