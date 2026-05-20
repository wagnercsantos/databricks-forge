/**
 * API: /api/runs/[runId]/data-gap
 *
 * GET  -- Return the latest persisted Data Gap analysis for the run, computing
 *         it on the fly when missing. Requires the run to be completed and to
 *         carry a configured industry outcome map.
 * POST -- Force-recompute the Data Gap analysis (overwrites any persisted row).
 *
 * The engine reads:
 *   1. Per-use-case `dataAssetId` classification from `ForgeUseCase.tablesInvolved`
 *      via the classifier-output on the run's environment scan, OR if no scan
 *      is attached, from any tables embedded in use case rows. (Read-only.)
 *   2. Per-use-case dollar estimates from `ForgeValueEstimate` so the Data Gap
 *      summary surfaces economic value-at-risk.
 *
 * Returns: { result: DataGapResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { loadRunOrRespond } from "@/lib/auth/route-guards";
import { isValidUUID } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { getValueEstimatesForRun } from "@/lib/lakebase/value-estimates";
import {
  getLatestDataGapAnalysisForRun,
  saveDataGapAnalysis,
} from "@/lib/lakebase/data-gap-analyses";
import { runDataGapAnalysis } from "@/lib/engines/data-gap-analysis/engine";
import { attributeTablesToAssets } from "@/lib/engines/data-gap-analysis/use-case-attribution";
import { getMasterRepoEnrichment } from "@/lib/domain/industry-outcomes/master-repo-registry";
import { resolveIndustryId } from "@/lib/domain/industry-outcomes";
import type { EconomicImpactCategory } from "@/lib/domain/economic-patterns";
import { isEconomicImpactCategory, LEGACY_VALUE_TYPE_MAP } from "@/lib/domain/economic-patterns";
async function compute(
  runId: string,
  industryId: string,
): Promise<ReturnType<typeof runDataGapAnalysis>> {
  // Resolve catalog tables. Use case rows carry `tablesInvolved` (FQNs). We
  // pair each table with its best-guess dataAssetId by reusing the industry's
  // enrichment use-case-to-data-asset mapping. The matcher is fuzzy because
  // the use-case-generation prompt explicitly tells the LLM not to copy
  // master-repo titles verbatim -- exact-name matching would silently miss
  // on the vast majority of real runs. See `use-case-attribution.ts` for
  // the three-tier matching algorithm and multi-MC propagation.
  //
  // A follow-up could refine this further by persisting per-table
  // `dataAssetId` classifications on `ForgeTableDetail` (today the
  // schema-context layer computes them in-memory but never writes them).
  const resolvedId = resolveIndustryId(industryId) ?? industryId;
  const enrichment = getMasterRepoEnrichment(resolvedId);
  if (!enrichment) return null;

  const useCases = await getUseCasesByRunId(runId);
  const estimates = await getValueEstimatesForRun(runId);

  const classifiedTables = attributeTablesToAssets({
    useCases,
    enrichment,
  });

  // Map estimates -> use-case-name + economic impact category.
  const ucNameById = new Map(useCases.map((u) => [u.id, u.name]));
  const ucValueEstimates = estimates.map((e) => {
    const cat: EconomicImpactCategory | null = e.economicImpactCategory
      && isEconomicImpactCategory(e.economicImpactCategory)
      ? e.economicImpactCategory
      : (LEGACY_VALUE_TYPE_MAP[e.valueType] ?? null);
    return {
      useCaseId: e.useCaseId,
      name: ucNameById.get(e.useCaseId) ?? "",
      valueLow: e.valueLow,
      valueMid: e.valueMid,
      valueHigh: e.valueHigh,
      economicImpactCategory: cat,
    };
  });

  return runDataGapAnalysis({
    industryId: resolvedId,
    classifiedTables,
    useCaseValueEstimates: ucValueEstimates.length ? ucValueEstimates : undefined,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    await ensureMigrated();
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }

    const guard = await loadRunOrRespond(request, runId, "read");
    if (!guard.ok) return guard.response;
    const run = guard.value.run;
    const user = guard.user;

    if (!run.config.industry) {
      return NextResponse.json(
        { error: "No industry outcome map configured for this run" },
        { status: 400 },
      );
    }

    const cached = await getLatestDataGapAnalysisForRun(runId, user.email);
    if (cached) return NextResponse.json({ result: cached, cached: true });

    const result = await compute(runId, run.config.industry);
    if (!result) {
      return NextResponse.json(
        { error: "No master repository enrichment for this industry" },
        { status: 404 },
      );
    }
    await saveDataGapAnalysis({ result, runId, ownerEmail: user.email });
    return NextResponse.json({ result, cached: false });
  } catch (err) {
    logger.error("[data-gap GET] failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    await ensureMigrated();
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }

    const guard = await loadRunOrRespond(request, runId, "edit");
    if (!guard.ok) return guard.response;
    const run = guard.value.run;
    const user = guard.user;

    if (!run.config.industry) {
      return NextResponse.json(
        { error: "No industry outcome map configured for this run" },
        { status: 400 },
      );
    }

    const result = await compute(runId, run.config.industry);
    if (!result) {
      return NextResponse.json(
        { error: "No master repository enrichment for this industry" },
        { status: 404 },
      );
    }
    await saveDataGapAnalysis({ result, runId, ownerEmail: user.email });
    return NextResponse.json({ result, cached: false });
  } catch (err) {
    logger.error("[data-gap POST] failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
