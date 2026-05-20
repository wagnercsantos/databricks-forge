/**
 * Economic value-at-risk aggregator for the Data Gap engine.
 *
 * Given the per-use-case Business Value estimates and the per-asset use-case
 * mapping from the master repo, compute the dollar value blocked or reduced
 * by every missing Reference Data Asset.
 *
 * MC vs VA semantics:
 *   - Missing MC asset      -> the use case is **blocked** (full value at risk)
 *   - Missing VA asset only -> the use case is **reduced** (partial value loss)
 *     We model the partial loss as 30% of the full estimate; this is a
 *     conservative heuristic until we have stronger empirical anchors.
 */

import type { EconomicImpactCategory } from "@/lib/domain/economic-patterns";
import type { AssetDescriptor, AssetValueAtRisk, DataGapInput } from "./types";

const VA_PARTIAL_LOSS_RATIO = 0.3;

interface UseCaseEstimate {
  useCaseId: string;
  name: string;
  valueLow: number;
  valueMid: number;
  valueHigh: number;
  economicImpactCategory: EconomicImpactCategory | null;
}

export function computeValueAtRisk(
  assetDescriptors: AssetDescriptor[],
  missingAssetIds: Set<string>,
  presentAssetIds: Set<string>,
  estimates: NonNullable<DataGapInput["useCaseValueEstimates"]>,
): AssetValueAtRisk[] {
  const estByName = new Map<string, UseCaseEstimate>();
  for (const e of estimates) estByName.set(e.name.toLowerCase(), e);

  /**
   * For a use case to be "blocked" by a single missing MC asset, we want to
   * avoid double-counting: a UC with three MC assets all missing should not
   * appear three times. We attribute the loss to ONE asset -- the first one
   * processed in iteration order. To keep the attribution stable, we walk
   * assets sorted by id and only attribute to the first missing MC asset.
   *
   * However for the per-asset value-at-risk report (this function), it is
   * useful to surface the union: every missing MC asset shows the same UC.
   * Aggregating summaries by summing across assets would double-count, so
   * the summary computation does its own deduplication.
   */

  const out: AssetValueAtRisk[] = [];

  for (const descriptor of assetDescriptors) {
    if (!missingAssetIds.has(descriptor.asset.id)) continue;

    const blockedUcs = new Set<string>();
    const reducedUcs = new Set<string>();

    for (const link of descriptor.useCases) {
      const isMC = link.criticality === "MC";
      const ucName = link.uc.name;

      if (isMC) {
        // The use case is blocked only if at least one MC asset is missing
        // (which we know is true -- this descriptor is missing). Add to set.
        blockedUcs.add(ucName);
      } else {
        // VA-only link: reduced impact unless any MC is also missing for the
        // same UC (in which case it's already counted as blocked). Compute by
        // checking the UC's full MC set.
        const ucMcAssets = link.uc.dataAssetIds?.filter(
          (id) => link.uc.dataAssetCriticality?.[id] === "MC",
        ) ?? [];
        const anyMcMissing = ucMcAssets.some((id) => missingAssetIds.has(id));
        if (!anyMcMissing) reducedUcs.add(ucName);
      }
    }

    // Aggregate dollar values
    const byCat: AssetValueAtRisk["byImpactCategory"] = {};
    let lo = 0;
    let mi = 0;
    let hi = 0;

    function add(name: string, ratio: number) {
      const est = estByName.get(name.toLowerCase());
      if (!est) return;
      const category = est.economicImpactCategory ?? "Cost";
      const bucket =
        byCat[category] ?? { low: 0, mid: 0, high: 0 };
      bucket.low += est.valueLow * ratio;
      bucket.mid += est.valueMid * ratio;
      bucket.high += est.valueHigh * ratio;
      byCat[category] = bucket;
      lo += est.valueLow * ratio;
      mi += est.valueMid * ratio;
      hi += est.valueHigh * ratio;
    }

    for (const ucName of blockedUcs) add(ucName, 1.0);
    for (const ucName of reducedUcs) add(ucName, VA_PARTIAL_LOSS_RATIO);

    out.push({
      assetId: descriptor.asset.id,
      assetName: descriptor.asset.name,
      blockedUseCases: [...blockedUcs].sort(),
      reducedUseCases: [...reducedUcs].sort(),
      byImpactCategory: byCat,
      totalLow: lo,
      totalMid: mi,
      totalHigh: hi,
    });
  }

  // Sort assets by descending mid value-at-risk
  out.sort((a, b) => b.totalMid - a.totalMid);
  // Ensure presentAssetIds is referenced so callers cannot accidentally pass
  // stale data; not strictly used here but documents the API surface.
  void presentAssetIds;
  return out;
}

/**
 * Compute the deduplicated total value-at-risk across all missing assets.
 * Each UC's full or reduced value contributes exactly once even when many
 * of its assets are missing.
 */
export function computeSummaryValueAtRisk(
  assetDescriptors: AssetDescriptor[],
  missingAssetIds: Set<string>,
  estimates: NonNullable<DataGapInput["useCaseValueEstimates"]>,
): { low: number; mid: number; high: number } {
  const estByName = new Map<string, UseCaseEstimate>();
  for (const e of estimates) estByName.set(e.name.toLowerCase(), e);

  // For each UC, determine if it is blocked (any MC missing) or reduced.
  const blockedUcs = new Set<string>();
  const reducedUcs = new Set<string>();

  for (const descriptor of assetDescriptors) {
    for (const link of descriptor.useCases) {
      const ucName = link.uc.name;
      const mcIds = link.uc.dataAssetIds?.filter(
        (id) => link.uc.dataAssetCriticality?.[id] === "MC",
      ) ?? [];
      const vaIds = link.uc.dataAssetIds?.filter(
        (id) => link.uc.dataAssetCriticality?.[id] === "VA",
      ) ?? [];
      const anyMcMissing = mcIds.some((id) => missingAssetIds.has(id));
      const anyVaMissing = vaIds.some((id) => missingAssetIds.has(id));

      if (anyMcMissing) blockedUcs.add(ucName);
      else if (anyVaMissing) reducedUcs.add(ucName);
    }
  }

  let lo = 0;
  let mi = 0;
  let hi = 0;
  for (const ucName of blockedUcs) {
    const est = estByName.get(ucName.toLowerCase());
    if (!est) continue;
    lo += est.valueLow;
    mi += est.valueMid;
    hi += est.valueHigh;
  }
  for (const ucName of reducedUcs) {
    if (blockedUcs.has(ucName)) continue;
    const est = estByName.get(ucName.toLowerCase());
    if (!est) continue;
    lo += est.valueLow * VA_PARTIAL_LOSS_RATIO;
    mi += est.valueMid * VA_PARTIAL_LOSS_RATIO;
    hi += est.valueHigh * VA_PARTIAL_LOSS_RATIO;
  }
  return { low: lo, mid: mi, high: hi };
}
