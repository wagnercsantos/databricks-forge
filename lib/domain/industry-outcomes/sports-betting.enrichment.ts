/**
 * Sports Betting (legacy collapsed id) -- Master Repository Enrichment
 *
 * Post Master Repo v2 split, `sports-betting` aliases to the canonical
 * `real-money-gaming` industry. Retained for backwards compatibility with
 * existing `ForgeRun.config.industry` rows. New code should use
 * `real-money-gaming.enrichment` or `casinos-resorts.enrichment` directly.
 */

import { REAL_MONEY_GAMING_USE_CASES, REAL_MONEY_GAMING_DATA_ASSETS } from "./real-money-gaming.enrichment";

export const SPORTS_BETTING_USE_CASES = REAL_MONEY_GAMING_USE_CASES;
export const SPORTS_BETTING_DATA_ASSETS = REAL_MONEY_GAMING_DATA_ASSETS;
