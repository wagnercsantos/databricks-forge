/**
 * Retail & Consumer Goods (legacy collapsed id) -- Master Repository Enrichment
 *
 * Post Master Repo v2 split, `rcg` aliases to the canonical `retail` industry.
 * Retained for backwards compatibility with existing `ForgeRun.config.industry`
 * rows. New code should use `retail.enrichment` or `consumer-goods.enrichment`
 * directly.
 */

import { RETAIL_USE_CASES, RETAIL_DATA_ASSETS } from "./retail.enrichment";

export const RCG_USE_CASES = RETAIL_USE_CASES;
export const RCG_DATA_ASSETS = RETAIL_DATA_ASSETS;
