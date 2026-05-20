/**
 * Data Gap Analysis -- engine entry point.
 *
 * Pure function. No DB, no LLM, no network. Takes a classified catalog
 * scope plus optional per-use-case dollar estimates and returns the full
 * coverage matrix + value-at-risk view.
 *
 * Designed to run synchronously after `classifySchema()` completes in an
 * estate scan or pipeline run. Production code path:
 *
 *   const tables = await classifySchema(...);
 *   const result = runDataGapAnalysis({
 *     industryId,
 *     classifiedTables: tables.map(t => ({ fqn: t.fqn, dataAssetId: t.dataAssetId })),
 *     useCaseValueEstimates: estimates,
 *   });
 *   await saveDataGapAnalysis(scanId, result);
 */

import { resolveIndustryId } from "@/lib/domain/industry-outcomes";
import { getMasterRepoEnrichment } from "@/lib/domain/industry-outcomes/master-repo-registry";
import { getIndustryOutcome } from "@/lib/domain/industry-outcomes";
import { buildIngestionRecommendations } from "./recommendations";
import { computeSummaryValueAtRisk, computeValueAtRisk } from "./economic-value";
import type {
  AssetCoverage,
  AssetDescriptor,
  DataGapInput,
  DataGapResult,
  DataGapSummary,
} from "./types";

export function runDataGapAnalysis(input: DataGapInput): DataGapResult | null {
  const resolvedId = resolveIndustryId(input.industryId) ?? input.industryId;
  const enrichment = getMasterRepoEnrichment(resolvedId);
  if (!enrichment) return null;
  const outcome = getIndustryOutcome(resolvedId);
  const industryName = outcome?.name ?? resolvedId;

  // Build per-asset descriptors with use-case linkage.
  const descriptors: AssetDescriptor[] = enrichment.dataAssets.map((asset) => ({
    asset,
    useCases: [],
  }));
  const descriptorById = new Map(descriptors.map((d) => [d.asset.id, d]));

  for (const uc of enrichment.useCases) {
    if (!uc.dataAssetIds) continue;
    for (const assetId of uc.dataAssetIds) {
      const descriptor = descriptorById.get(assetId);
      if (!descriptor) continue;
      const criticality = uc.dataAssetCriticality?.[assetId] ?? "VA";
      descriptor.useCases.push({ uc, criticality });
    }
  }

  // Determine which assets are present in the catalog scope.
  const tablesByAsset = new Map<string, string[]>();
  for (const t of input.classifiedTables) {
    if (!t.dataAssetId) continue;
    const arr = tablesByAsset.get(t.dataAssetId) ?? [];
    arr.push(t.fqn);
    tablesByAsset.set(t.dataAssetId, arr);
  }

  const presentAssetIds = new Set<string>();
  const missingAssetIds = new Set<string>();

  const coverage: AssetCoverage[] = descriptors.map((d) => {
    const matched = tablesByAsset.get(d.asset.id) ?? [];
    const present = matched.length > 0;
    if (present) presentAssetIds.add(d.asset.id);
    else missingAssetIds.add(d.asset.id);

    const mcLinks = d.useCases.filter((l) => l.criticality === "MC");
    const vaLinks = d.useCases.filter((l) => l.criticality === "VA");

    return {
      assetId: d.asset.id,
      assetName: d.asset.name,
      assetFamily: d.asset.assetFamily,
      systemLocation: d.asset.systemLocation,
      systemKind: d.asset.systemKind,
      present,
      matchedTables: matched,
      mcUseCaseCount: mcLinks.length,
      vaUseCaseCount: vaLinks.length,
      mcUseCaseNames: mcLinks.slice(0, 10).map((l) => l.uc.name),
      recommendations: buildIngestionRecommendations(d.asset),
    };
  });

  // Sort coverage: missing-with-most-MC-use-cases first, then present.
  coverage.sort((a, b) => {
    if (a.present !== b.present) return a.present ? 1 : -1;
    if (!a.present) return b.mcUseCaseCount - a.mcUseCaseCount;
    return a.assetId.localeCompare(b.assetId);
  });

  // Aggregate MC/VA coverage counters.
  let mcCovered = 0;
  let mcMissing = 0;
  let vaCovered = 0;
  let vaMissing = 0;
  for (const uc of enrichment.useCases) {
    for (const assetId of uc.dataAssetIds ?? []) {
      const isMC = uc.dataAssetCriticality?.[assetId] === "MC";
      const present = presentAssetIds.has(assetId);
      if (isMC) {
        if (present) mcCovered++;
        else mcMissing++;
      } else {
        if (present) vaCovered++;
        else vaMissing++;
      }
    }
  }

  // Value-at-risk
  const estimates = input.useCaseValueEstimates ?? [];
  const valueAtRisk = estimates.length
    ? computeValueAtRisk(descriptors, missingAssetIds, presentAssetIds, estimates)
    : [];
  const summaryVal = estimates.length
    ? computeSummaryValueAtRisk(descriptors, missingAssetIds, estimates)
    : { low: 0, mid: 0, high: 0 };

  const totalAssets = descriptors.length;
  const mcDenom = mcCovered + mcMissing;
  const summary: DataGapSummary = {
    industryId: resolvedId,
    industryName,
    totalAssets,
    presentAssets: presentAssetIds.size,
    missingAssets: missingAssetIds.size,
    mcCovered,
    mcMissing,
    vaCovered,
    vaMissing,
    mcCoveragePct: mcDenom > 0 ? mcCovered / mcDenom : 0,
    valueAtRiskLow: summaryVal.low,
    valueAtRiskMid: summaryVal.mid,
    valueAtRiskHigh: summaryVal.high,
  };

  return {
    industryId: resolvedId,
    industryName,
    generatedAt: new Date().toISOString(),
    summary,
    coverage,
    valueAtRisk,
  };
}
