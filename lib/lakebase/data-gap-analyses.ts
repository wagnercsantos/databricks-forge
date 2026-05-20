/**
 * Lakebase CRUD for ForgeDataGapAnalysis.
 *
 * Persists the output of `runDataGapAnalysis()` from
 * `lib/engines/data-gap-analysis/engine.ts`. One row per (scope, runId/scanId)
 * with `ownerEmail` populated for per-user isolation.
 */

import { withPrisma } from "@/lib/prisma";
import type { DataGapResult } from "@/lib/engines/data-gap-analysis/types";

export interface SaveDataGapInput {
  result: DataGapResult;
  runId?: string;
  scanId?: string;
  ownerEmail: string;
}

export async function saveDataGapAnalysis(input: SaveDataGapInput): Promise<string> {
  const { result, runId, scanId, ownerEmail } = input;
  if (!runId && !scanId) {
    throw new Error("saveDataGapAnalysis requires runId or scanId");
  }
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeDataGapAnalysis.create({
      data: {
        runId: runId ?? null,
        scanId: scanId ?? null,
        industryId: result.industryId,
        industryName: result.industryName,
        totalAssets: result.summary.totalAssets,
        presentAssets: result.summary.presentAssets,
        missingAssets: result.summary.missingAssets,
        mcCovered: result.summary.mcCovered,
        mcMissing: result.summary.mcMissing,
        vaCovered: result.summary.vaCovered,
        vaMissing: result.summary.vaMissing,
        mcCoveragePct: result.summary.mcCoveragePct,
        valueAtRiskLow: result.summary.valueAtRiskLow,
        valueAtRiskMid: result.summary.valueAtRiskMid,
        valueAtRiskHigh: result.summary.valueAtRiskHigh,
        coverageJson: JSON.stringify(result.coverage),
        valueAtRiskJson: JSON.stringify(result.valueAtRisk),
        ownerEmail,
      },
    });
    return row.id;
  });
}

export async function getLatestDataGapAnalysisForRun(
  runId: string,
  ownerEmail: string,
): Promise<DataGapResult | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeDataGapAnalysis.findFirst({
      where: { runId, ownerEmail },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return rowToResult(row);
  });
}

export async function getLatestDataGapAnalysisForScan(
  scanId: string,
  ownerEmail: string,
): Promise<DataGapResult | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeDataGapAnalysis.findFirst({
      where: { scanId, ownerEmail },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return rowToResult(row);
  });
}

export async function deleteDataGapAnalysesForRun(runId: string): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeDataGapAnalysis.deleteMany({ where: { runId } });
  });
}

export async function deleteDataGapAnalysesForScan(scanId: string): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeDataGapAnalysis.deleteMany({ where: { scanId } });
  });
}

function rowToResult(row: {
  industryId: string;
  industryName: string;
  totalAssets: number;
  presentAssets: number;
  missingAssets: number;
  mcCovered: number;
  mcMissing: number;
  vaCovered: number;
  vaMissing: number;
  mcCoveragePct: number;
  valueAtRiskLow: number;
  valueAtRiskMid: number;
  valueAtRiskHigh: number;
  coverageJson: string;
  valueAtRiskJson: string | null;
  createdAt: Date;
}): DataGapResult {
  return {
    industryId: row.industryId,
    industryName: row.industryName,
    generatedAt: row.createdAt.toISOString(),
    summary: {
      industryId: row.industryId,
      industryName: row.industryName,
      totalAssets: row.totalAssets,
      presentAssets: row.presentAssets,
      missingAssets: row.missingAssets,
      mcCovered: row.mcCovered,
      mcMissing: row.mcMissing,
      vaCovered: row.vaCovered,
      vaMissing: row.vaMissing,
      mcCoveragePct: row.mcCoveragePct,
      valueAtRiskLow: row.valueAtRiskLow,
      valueAtRiskMid: row.valueAtRiskMid,
      valueAtRiskHigh: row.valueAtRiskHigh,
    },
    coverage: JSON.parse(row.coverageJson),
    valueAtRisk: row.valueAtRiskJson ? JSON.parse(row.valueAtRiskJson) : [],
  };
}
