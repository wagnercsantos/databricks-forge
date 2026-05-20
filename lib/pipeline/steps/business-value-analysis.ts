/**
 * Pipeline Step: Business Value Analysis
 *
 * Runs 4 lightweight LLM passes after scoring to produce:
 * 1. Financial quantification (dollar-value estimates per use case)
 * 2. Roadmap phasing (Quick Wins / Foundation / Transformation)
 * 3. Executive synthesis (key findings, recommendations, risks)
 * 4. Stakeholder analysis (roles, departments, change management)
 *
 * All passes use the fast model endpoint by default.
 */

import type {
  PipelineContext,
  UseCase,
  ValueType,
  ValueConfidence,
  RoadmapPhase,
  EffortEstimate,
  ExecutiveSynthesis,
} from "@/lib/domain/types";
import { executeAIQuery } from "@/lib/ai/agent";
import { resolveEndpoint } from "@/lib/dbx/client";
import { logger as fallbackLogger } from "@/lib/logger";
import { upsertValueEstimates, getValueEstimatesForRun } from "@/lib/lakebase/value-estimates";
import {
  ECONOMIC_PATTERNS,
  isEconomicImpactCategory,
  isEconomicPatternName,
  LEGACY_VALUE_TYPE_MAP,
} from "@/lib/domain/economic-patterns";
import { getMasterRepoEnrichment } from "@/lib/domain/industry-outcomes/master-repo-registry";
import { resolveIndustryId } from "@/lib/domain/industry-outcomes";
import { upsertRoadmapPhases } from "@/lib/lakebase/roadmap-phases";
import { replaceStakeholderProfiles } from "@/lib/lakebase/stakeholder-profiles";
import { bulkInitTracking } from "@/lib/lakebase/use-case-tracking";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { withPrisma } from "@/lib/prisma";
import { buildStrategyAlignmentPrompt } from "@/lib/domain/strategy-alignment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summariseCasesForLLM(useCases: UseCase[]): string {
  return JSON.stringify(
    useCases.map((uc) => ({
      use_case_id: uc.id,
      name: uc.name,
      type: uc.type,
      domain: uc.domain,
      statement: uc.statement,
      business_value: uc.businessValue,
      beneficiary: uc.beneficiary,
      sponsor: uc.sponsor,
      analytics_technique: uc.analyticsTechnique,
      tables_involved: uc.tablesInvolved,
      priority_score: uc.priorityScore,
      feasibility_score: uc.feasibilityScore,
      impact_score: uc.impactScore,
      overall_score: uc.overallScore,
    })),
    null,
    2,
  );
}

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const cleaned = raw
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Pass 1: Financial Quantification
// ---------------------------------------------------------------------------

/**
 * Build the canonical economic-patterns prompt block. All 10 patterns are
 * always included so the LLM picks a structured value. Plain text so it can
 * be safely inlined into a template string.
 */
function buildEconomicPatternsContext(): string {
  const lines: string[] = [];
  for (const p of Object.values(ECONOMIC_PATTERNS)) {
    const range = p.expectedRangePct
      ? ` Typical D4B range: ${p.expectedRangePct.low}--${p.expectedRangePct.high}%.`
      : "";
    lines.push(`- **${p.name}** [${p.category}]`);
    lines.push(`    Formula: ${p.defaultFormula}.${range}`);
    lines.push(`    Variables: ${p.variableHints.join(" | ")}`);
  }
  return lines.join("\n");
}

/**
 * Build a per-industry block of pre-calibrated reference cases. Each entry
 * carries the master-repo formula and benchmark uplift so the LLM can lean
 * on a real consultancy-grade anchor instead of inventing one.
 *
 * Source priority:
 *   1. The canonical industry id stored on `run.config.industry` (highest
 *      signal -- the pipeline auto-detects this earlier in `pipeline/engine.ts`
 *      and the user can override it via the run config). Building from this
 *      always finds the matching enrichment when one exists.
 *   2. Free-form `bc.industries` text (e.g. "Banking & Payments, Capital
 *      Markets"). Each comma/semicolon-separated token is normalised to an
 *      id-shaped slug and resolved via `resolveIndustryId()`. This is a
 *      best-effort fallback for older runs whose `config.industry` is null.
 *
 * Both sources are attempted. Results are de-duplicated by canonical id so
 * that, e.g., a run with both `config.industry = "banking"` and
 * `bc.industries = "Banking, Capital Markets"` emits the banking block once
 * and the capital-markets block once.
 *
 * Exported for unit testing.
 */
export function buildIndustryReferenceCases(opts: {
  canonicalIndustryId?: string | null;
  freeText?: string | null;
}): string {
  const seen = new Set<string>();
  const blocks: string[] = [];

  function pushIndustry(rawId: string, label: string) {
    const resolved = resolveIndustryId(rawId) ?? rawId;
    if (!resolved || seen.has(resolved)) return;
    const enrichment = getMasterRepoEnrichment(resolved);
    if (!enrichment) return;
    const refs = enrichment.useCases.filter(
      (uc) => uc.economicPatternName && uc.economicFormula && uc.benchmarkImpact,
    );
    if (refs.length === 0) return;
    seen.add(resolved);
    blocks.push(`Industry: ${label}`);
    for (const uc of refs.slice(0, 30)) {
      const formula = uc.economicFormula ?? "";
      const kpi = uc.kpiTarget ? ` ${uc.kpiTarget}` : "";
      const bench = uc.benchmarkImpact ?? "";
      const pattern = uc.economicPatternName ?? "";
      blocks.push(
        `  * ${uc.name} -> ${pattern} | formula: ${formula} | benchmark:${kpi} ${bench}`,
      );
    }
    blocks.push("");
  }

  // Tier 1: canonical industry id from the run config.
  if (opts.canonicalIndustryId) {
    pushIndustry(opts.canonicalIndustryId, opts.canonicalIndustryId);
  }

  // Tier 2: free-text best-effort. Useful for legacy runs and for runs that
  // span multiple industries.
  const tokens = (opts.freeText ?? "")
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const normalized = token.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (normalized) pushIndustry(normalized, token);
  }

  if (blocks.length === 0) return "(no industry reference cases available)";
  return blocks.join("\n");
}

async function runFinancialQuantification(
  ctx: PipelineContext,
  useCases: UseCase[],
): Promise<void> {
  const log = ctx.logger ?? fallbackLogger;
  const { run } = ctx;
  const bc = run.businessContext;
  if (!bc || useCases.length === 0) return;

  const economicPatternsContext = buildEconomicPatternsContext();
  const industryReferenceCases = buildIndustryReferenceCases({
    canonicalIndustryId: run.config.industry ?? null,
    freeText: bc.industries,
  });

  const batchSize = 25;
  const batches = [];
  for (let i = 0; i < useCases.length; i += batchSize) {
    batches.push(useCases.slice(i, i + batchSize));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    if (batches.length > 1) {
      await updateRunMessage(
        run.runId,
        `Quantifying financial value (batch ${batchIdx + 1} of ${batches.length})...`,
      );
    }
    const variables: Record<string, string> = {
      business_name: run.config.businessName,
      industries: bc.industries,
      revenue_model: bc.revenueModel,
      strategic_goals: bc.strategicGoals,
      value_chain: bc.valueChain,
      estate_context: `${useCases.length} use cases across ${new Set(useCases.map((u) => u.domain)).size} domains`,
      use_cases_json: summariseCasesForLLM(batch),
      economic_patterns_context: economicPatternsContext,
      industry_reference_cases: industryReferenceCases,
    };

    try {
      const result = await executeAIQuery({
        runId: run.runId,
        promptKey: "FINANCIAL_QUANTIFICATION_PROMPT",
        variables,
        modelEndpoint: resolveEndpoint("classification"),
        responseFormat: "json_object",
      });

      type RawEstimate = {
        use_case_id: string;
        value_low: number;
        value_mid: number;
        value_high: number;
        value_type: string;
        confidence: string;
        rationale?: string;
        assumptions?: string[];
        industry_benchmark?: string;
        economic_pattern_name?: string;
        economic_impact_category?: string;
        economic_formula_vars?: Record<string, number | string>;
      };
      const estimates = safeParse<RawEstimate[]>(result.rawResponse, []);

      if (estimates.length > 0) {
        await upsertValueEstimates(
          run.runId,
          estimates.map((e) => {
            const valueType = (e.value_type || "efficiency_gain") as ValueType;
            // Prefer the LLM's structured category; fall back via legacy map.
            const impactCategory =
              e.economic_impact_category && isEconomicImpactCategory(e.economic_impact_category)
                ? e.economic_impact_category
                : (LEGACY_VALUE_TYPE_MAP[valueType] ?? null);
            const patternName =
              e.economic_pattern_name && isEconomicPatternName(e.economic_pattern_name)
                ? e.economic_pattern_name
                : null;
            return {
              useCaseId: e.use_case_id,
              valueLow: Math.max(0, e.value_low ?? 0),
              valueMid: Math.max(0, e.value_mid ?? 0),
              valueHigh: Math.max(0, e.value_high ?? 0),
              valueType,
              confidence: (e.confidence || "medium") as ValueConfidence,
              rationale: e.rationale,
              assumptions: e.assumptions,
              industryBenchmark: e.industry_benchmark,
              economicPatternName: patternName,
              economicImpactCategory: impactCategory,
              economicFormulaVars: e.economic_formula_vars ?? null,
            };
          }),
        );
      }
    } catch (err) {
      log.warn("Financial quantification batch failed", {
        fn: "runBusinessValueAnalysis",
        errorCategory: "llm_error",
        error: String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 2: Roadmap Phasing
// ---------------------------------------------------------------------------

async function runRoadmapPhasing(ctx: PipelineContext, useCases: UseCase[]): Promise<void> {
  const log = ctx.logger ?? fallbackLogger;
  const { run } = ctx;
  const bc = run.businessContext;
  if (!bc || useCases.length === 0) return;

  const variables: Record<string, string> = {
    business_name: run.config.businessName,
    industries: bc.industries,
    strategic_goals: bc.strategicGoals,
    use_cases_json: summariseCasesForLLM(useCases),
  };

  try {
    const result = await executeAIQuery({
      runId: run.runId,
      promptKey: "ROADMAP_PHASING_PROMPT",
      variables,
      modelEndpoint: resolveEndpoint("classification"),
      responseFormat: "json_object",
    });

    type RawPhase = {
      use_case_id: string;
      phase: string;
      phase_order: number;
      effort_estimate?: string;
      dependencies?: string[];
      enablers?: string[];
      rationale?: string;
    };
    const phases = safeParse<RawPhase[]>(result.rawResponse, []);

    if (phases.length > 0) {
      await upsertRoadmapPhases(
        run.runId,
        phases.map((p) => ({
          useCaseId: p.use_case_id,
          phase: (p.phase || "foundation") as RoadmapPhase,
          phaseOrder: p.phase_order ?? 0,
          effortEstimate: (p.effort_estimate || "m") as EffortEstimate,
          dependencies: p.dependencies,
          enablers: p.enablers,
          rationale: p.rationale,
        })),
      );
    }
  } catch (err) {
    log.warn("Roadmap phasing failed", {
      fn: "runRoadmapPhasing",
      errorCategory: "llm_error",
      error: String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Pass 3: Executive Synthesis
// ---------------------------------------------------------------------------

async function runExecutiveSynthesis(ctx: PipelineContext, useCases: UseCase[]): Promise<void> {
  const log = ctx.logger ?? fallbackLogger;
  const { run } = ctx;
  const bc = run.businessContext;
  if (!bc || useCases.length === 0) return;

  const domains = [...new Set(useCases.map((u) => u.domain))];
  const topUseCases = [...useCases].sort((a, b) => b.overallScore - a.overallScore).slice(0, 15);

  const useCaseSummary = [
    `Total: ${useCases.length} use cases across ${domains.length} domains`,
    `Top domains: ${domains.slice(0, 5).join(", ")}`,
    `Score range: ${Math.min(...useCases.map((u) => u.overallScore)).toFixed(2)} - ${Math.max(...useCases.map((u) => u.overallScore)).toFixed(2)}`,
    `Types: AI ${useCases.filter((u) => u.type === "AI").length}, Statistical ${useCases.filter((u) => u.type === "Statistical").length}`,
    `Top 15 use cases:\n${topUseCases.map((u) => `- ${u.name} (${u.domain}, score: ${u.overallScore.toFixed(2)}): ${u.businessValue}`).join("\n")}`,
  ].join("\n");

  const strategyAlignment = run.config.industry
    ? buildStrategyAlignmentPrompt(
        run.config.industry,
        useCases.map((u) => u.name),
      )
    : null;

  const variables: Record<string, string> = {
    business_name: run.config.businessName,
    industries: bc.industries,
    strategic_goals: bc.strategicGoals,
    value_chain: bc.valueChain,
    use_case_summary: useCaseSummary,
    estate_summary: "Estate scan data available in full pipeline context",
    value_summary: `${useCases.length} use cases scored and ranked`,
    strategy_alignment: strategyAlignment || "No industry strategy alignment data available.",
  };

  try {
    const result = await executeAIQuery({
      runId: run.runId,
      promptKey: "EXECUTIVE_SYNTHESIS_PROMPT",
      variables,
      modelEndpoint: resolveEndpoint("classification"),
      responseFormat: "json_object",
    });

    type RawSynthesis = {
      key_findings?: Array<{
        title: string;
        description: string;
        domain: string | null;
        severity: string;
      }>;
      strategic_recommendations?: Array<{
        title: string;
        description: string;
        priority: string;
      }>;
      risk_callouts?: Array<{
        title: string;
        description: string;
        impact: string;
      }>;
    };
    const raw = safeParse<RawSynthesis>(result.rawResponse, {});

    const synthesis: ExecutiveSynthesis = {
      keyFindings: (raw.key_findings ?? []).map((f) => ({
        ...f,
        severity: f.severity as "opportunity" | "risk" | "insight",
      })),
      strategicRecommendations: (raw.strategic_recommendations ?? []).map((r) => ({
        ...r,
        priority: r.priority as "high" | "medium" | "low",
      })),
      riskCallouts: (raw.risk_callouts ?? []).map((r) => ({
        ...r,
        impact: r.impact as "high" | "medium" | "low",
      })),
      totalEstimatedValue: { low: 0, mid: 0, high: 0, currency: "USD" },
      quickWinCount: 0,
      topDomain: null,
    };

    if (synthesis.keyFindings.length > 0 || synthesis.strategicRecommendations.length > 0) {
      synthesis.quickWinCount = useCases.filter(
        (u) => u.feasibilityScore >= 0.7 && u.overallScore >= 0.6,
      ).length;
      synthesis.topDomain = domains[0] ?? null;

      await withPrisma(async (prisma) => {
        await prisma.forgeRun.update({
          where: { runId: run.runId },
          data: { synthesisJson: JSON.stringify(synthesis) },
        });
      });
    }
  } catch (err) {
    log.warn("Executive synthesis failed", {
      fn: "runBusinessValueAnalysis",
      errorCategory: "llm_error",
      error: String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Pass 4: Stakeholder Analysis
// ---------------------------------------------------------------------------

async function runStakeholderAnalysis(ctx: PipelineContext, useCases: UseCase[]): Promise<void> {
  const log = ctx.logger ?? fallbackLogger;
  const { run } = ctx;
  const bc = run.businessContext;
  if (!bc || useCases.length === 0) return;

  const stakeholderData = useCases.map((uc) => ({
    use_case_id: uc.id,
    name: uc.name,
    domain: uc.domain,
    type: uc.type,
    beneficiary: uc.beneficiary,
    sponsor: uc.sponsor,
    overall_score: uc.overallScore,
  }));

  const variables: Record<string, string> = {
    business_name: run.config.businessName,
    industries: bc.industries,
    stakeholder_json: JSON.stringify(stakeholderData, null, 2),
  };

  try {
    const result = await executeAIQuery({
      runId: run.runId,
      promptKey: "STAKEHOLDER_ANALYSIS_PROMPT",
      variables,
      modelEndpoint: resolveEndpoint("classification"),
      responseFormat: "json_object",
    });

    type RawProfile = {
      role: string;
      department: string;
      use_case_ids?: string[];
      use_case_count: number;
      domains: string[];
      use_case_types: Record<string, number>;
      change_complexity: "low" | "medium" | "high";
      is_champion: boolean;
      is_sponsor: boolean;
    };
    const profiles = safeParse<RawProfile[]>(result.rawResponse, []);

    if (profiles.length > 0) {
      const estimates = await getValueEstimatesForRun(run.runId);
      const valueByUseCase = new Map(estimates.map((e) => [e.useCaseId, e.valueMid]));

      await replaceStakeholderProfiles(
        run.runId,
        profiles.map((p) => {
          const ucIds = p.use_case_ids ?? [];
          const totalValue = ucIds.reduce((sum, id) => sum + (valueByUseCase.get(id) ?? 0), 0);
          return {
            role: p.role || "Unknown",
            department: p.department || "Unknown",
            useCaseCount: p.use_case_count ?? 0,
            totalValue,
            domains: p.domains ?? [],
            useCaseTypes: p.use_case_types ?? {},
            changeComplexity: p.change_complexity || "medium",
            isChampion: p.is_champion ?? false,
            isSponsor: p.is_sponsor ?? false,
          };
        }),
      );
    }
  } catch (err) {
    log.warn("Stakeholder analysis failed", {
      fn: "runBusinessValueAnalysis",
      errorCategory: "llm_error",
      error: String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Main step entry point
// ---------------------------------------------------------------------------

export async function runBusinessValueAnalysis(ctx: PipelineContext): Promise<void> {
  const log = ctx.logger ?? fallbackLogger;
  const useCases = ctx.useCases;

  if (!useCases || useCases.length === 0) {
    log.info("No use cases to analyze, skipping");
    return;
  }

  log.info("Starting business value analysis", {
    useCaseCount: useCases.length,
  });

  // Initialize tracking records for all use cases
  await bulkInitTracking(
    ctx.run.runId,
    useCases.map((u) => u.id),
  );

  const runId = ctx.run.runId;

  // Run passes in sequence (each is a single LLM call, fast model)
  await updateRunMessage(runId, "Quantifying financial value estimates...", 86);
  await runFinancialQuantification(ctx, useCases);

  await updateRunMessage(runId, "Building implementation roadmap phases...", 87);
  await runRoadmapPhasing(ctx, useCases);

  await updateRunMessage(runId, "Generating executive synthesis...", 88);
  await runExecutiveSynthesis(ctx, useCases);

  await updateRunMessage(runId, "Analyzing stakeholder profiles...", 89);
  await runStakeholderAnalysis(ctx, useCases);

  log.info("Business value analysis complete");
}
