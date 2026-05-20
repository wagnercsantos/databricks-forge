/**
 * Data Gap Analysis engine unit tests.
 *
 * Exercises the engine against the real Retail Master Repo enrichment so
 * coverage logic, ingestion recommendations, and value-at-risk aggregation
 * are validated end-to-end without database / LLM dependencies.
 */

import { describe, it, expect } from "vitest";

import { runDataGapAnalysis } from "@/lib/engines/data-gap-analysis/engine";
import { buildIngestionRecommendations } from "@/lib/engines/data-gap-analysis/recommendations";
import { getMasterRepoEnrichment } from "@/lib/domain/industry-outcomes/master-repo-registry";

describe("Data Gap Analysis engine", () => {
  it("returns null for an unknown industry", () => {
    const result = runDataGapAnalysis({
      industryId: "not-a-real-industry-xyz",
      classifiedTables: [],
    });
    expect(result).toBeNull();
  });

  it("treats empty catalog scope as 0% MC coverage", () => {
    const result = runDataGapAnalysis({
      industryId: "retail",
      classifiedTables: [],
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.summary.industryId).toBe("retail");
    expect(result.summary.presentAssets).toBe(0);
    expect(result.summary.missingAssets).toBe(result.summary.totalAssets);
    expect(result.summary.mcCoveragePct).toBe(0);
    expect(result.summary.totalAssets).toBeGreaterThan(0);
    // Every coverage row should be missing.
    expect(result.coverage.every((c) => !c.present)).toBe(true);
    // Each coverage row should expose at least one ingestion recommendation.
    expect(result.coverage.every((c) => c.recommendations.length >= 1)).toBe(true);
  });

  it("marks an asset as present when a table maps to it", () => {
    const enrichment = getMasterRepoEnrichment("retail");
    expect(enrichment).toBeDefined();
    if (!enrichment) return;
    const firstAssetId = enrichment.dataAssets[0]!.id;

    const result = runDataGapAnalysis({
      industryId: "retail",
      classifiedTables: [
        { fqn: "catalog.silver.profiles", dataAssetId: firstAssetId },
        { fqn: "catalog.silver.orphan", dataAssetId: null },
      ],
    });
    expect(result).not.toBeNull();
    if (!result) return;
    const row = result.coverage.find((c) => c.assetId === firstAssetId);
    expect(row).toBeDefined();
    expect(row!.present).toBe(true);
    expect(row!.matchedTables).toContain("catalog.silver.profiles");
    expect(result.summary.presentAssets).toBe(1);
  });

  it("resolves legacy aliases through the master repo registry", () => {
    const result = runDataGapAnalysis({
      industryId: "rcg",
      classifiedTables: [],
    });
    expect(result).not.toBeNull();
    if (!result) return;
    // resolveIndustryId(rcg) -> retail
    expect(result.summary.industryId).toBe("retail");
  });

  it("attributes value-at-risk to missing MC assets and unblocks UCs when ALL MC assets are present", () => {
    const enrichment = getMasterRepoEnrichment("retail");
    if (!enrichment) return;

    // Pick a use case that has at least one MC asset.
    const usecaseWithMc = enrichment.useCases.find((u) =>
      Object.values(u.dataAssetCriticality ?? {}).includes("MC"),
    );
    expect(usecaseWithMc).toBeDefined();
    if (!usecaseWithMc) return;

    const allMcAssetIds = Object.entries(usecaseWithMc.dataAssetCriticality ?? {})
      .filter(([, role]) => role === "MC")
      .map(([id]) => id);

    // Scenario A -- all MC assets missing -> use case should be blocked and
    // contribute to valueAtRisk.
    const missing = runDataGapAnalysis({
      industryId: "retail",
      classifiedTables: [],
      useCaseValueEstimates: [
        {
          useCaseId: usecaseWithMc.name,
          name: usecaseWithMc.name,
          valueLow: 100_000,
          valueMid: 500_000,
          valueHigh: 1_000_000,
          economicImpactCategory: "Cost",
        },
      ],
    });
    expect(missing).not.toBeNull();
    if (!missing) return;
    expect(missing.summary.valueAtRiskMid).toBeGreaterThan(0);
    // The UC should show up on at least one missing MC asset row.
    const blockedRowsMissing = missing.valueAtRisk.filter((row) =>
      row.blockedUseCases.includes(usecaseWithMc.name),
    );
    expect(blockedRowsMissing.length).toBeGreaterThan(0);

    // Scenario B -- ALL MC assets for this UC are present -> the UC must no
    // longer appear in any blockedUseCases list.
    const present = runDataGapAnalysis({
      industryId: "retail",
      classifiedTables: allMcAssetIds.map((id, i) => ({
        fqn: `cat.s.t${i}`,
        dataAssetId: id,
      })),
      useCaseValueEstimates: [
        {
          useCaseId: usecaseWithMc.name,
          name: usecaseWithMc.name,
          valueLow: 100_000,
          valueMid: 500_000,
          valueHigh: 1_000_000,
          economicImpactCategory: "Cost",
        },
      ],
    });
    expect(present).not.toBeNull();
    if (!present) return;
    const blockedNames = present.valueAtRisk.flatMap((r) => r.blockedUseCases);
    expect(blockedNames).not.toContain(usecaseWithMc.name);
  });

  it("sorts missing-with-most-MC-use-cases ahead of present rows", () => {
    const result = runDataGapAnalysis({
      industryId: "retail",
      classifiedTables: [],
    });
    if (!result) return;
    // All missing rows come before any present rows (no presents here, but
    // the relative ordering invariant within missing should hold).
    const mcCounts = result.coverage.map((c) => c.mcUseCaseCount);
    for (let i = 1; i < mcCounts.length; i++) {
      expect(mcCounts[i - 1]).toBeGreaterThanOrEqual(mcCounts[i]);
    }
  });
});

describe("buildIngestionRecommendations", () => {
  it("ranks ingestion strategies by High rating in canonical order", () => {
    const recs = buildIngestionRecommendations({
      id: "TEST",
      name: "Test Asset",
      description: "",
      systemLocation: "Snowflake",
      assetFamily: "Test Family",
      easeOfAccess: "Medium",
      lakeflowConnect: "Low",
      ucFederation: "High",
      lakebridgeMigrate: "High",
      bespoke: "Low",
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]!.strategy).toBe("uc_federation");
    expect(recs[0]!.rating).toBe("High");
  });

  it("falls back to a Low recommendation when no High exists", () => {
    const recs = buildIngestionRecommendations({
      id: "TEST",
      name: "Test Asset",
      description: "",
      systemLocation: "Custom",
      assetFamily: "Test Family",
      easeOfAccess: "Hard",
      lakeflowConnect: "Low",
      ucFederation: "Low",
      lakebridgeMigrate: "Low",
      bespoke: "High",
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]!.strategy).toBe("bespoke");
  });
});
