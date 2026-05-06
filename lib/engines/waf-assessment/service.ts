/**
 * WAF Assessment service — orchestrates a full assessment run end-to-end.
 *
 * Flow:
 *   1. Seed the controls catalog if empty (idempotent).
 *   2. Insert a new ForgeWafAssessment row in `running` state.
 *   3. Run all four pillar queries against the user's warehouse (OBO).
 *   4. Persist per-control results, compute per-pillar + overall scores,
 *      and mark the assessment `completed`.
 *   5. On failure, mark the assessment `failed` with the error message.
 *
 * Pillar score = (controls met / controls in pillar) * 100.
 * Overall score = average of available pillar scores (skips failed pillars).
 */

import { v4 as uuidv4 } from "uuid";
import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ensureCatalogSeeded } from "./catalog";
import { runAllPillars } from "./engine";
import type {
  WafAssessmentDetail,
  WafAssessmentSummary,
  WafControl,
  WafPillar,
} from "./types";
import { WAF_PILLARS } from "./types";

function toSummary(row: {
  assessmentId: string;
  status: string;
  scope: string | null;
  triggeredBy: string | null;
  governanceScore: number | null;
  iuScore: number | null;
  oeScore: number | null;
  scpScore: number | null;
  reliabilityScore: number | null;
  costScore: number | null;
  performanceScore: number | null;
  overallScore: number | null;
  totalControls: number;
  metControls: number;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): WafAssessmentSummary {
  return {
    assessmentId: row.assessmentId,
    status: row.status as WafAssessmentSummary["status"],
    scope: row.scope,
    triggeredBy: row.triggeredBy,
    governanceScore: row.governanceScore,
    iuScore: row.iuScore,
    oeScore: row.oeScore,
    scpScore: row.scpScore,
    reliabilityScore: row.reliabilityScore,
    costScore: row.costScore,
    performanceScore: row.performanceScore,
    overallScore: row.overallScore,
    totalControls: row.totalControls,
    metControls: row.metControls,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function pillarScore(metByPillar: Map<WafPillar, { met: number; total: number }>, pillar: WafPillar): number | null {
  const entry = metByPillar.get(pillar);
  if (!entry || entry.total === 0) return null;
  return Math.round((entry.met / entry.total) * 1000) / 10;
}

/** Start (and complete) a new assessment run. Returns the final summary. */
export async function runAssessment(opts: {
  scope?: string;
  triggeredBy?: string;
}): Promise<WafAssessmentSummary> {
  await ensureCatalogSeeded();

  const assessmentId = uuidv4();
  await withPrisma((prisma) =>
    prisma.forgeWafAssessment.create({
      data: {
        assessmentId,
        status: "running",
        scope: opts.scope ?? null,
        triggeredBy: opts.triggeredBy ?? null,
      },
    }),
  );

  try {
    const { results, errors } = await runAllPillars();

    if (results.length === 0) {
      throw new Error(
        errors.length > 0
          ? `All pillar queries failed: ${errors.map((e) => `${e.pillar}: ${e.message}`).join("; ")}`
          : "No control results returned",
      );
    }

    // Filter to controls present in catalog (avoid FK violation if a query
    // returns an unknown waf_id — the catalog is the source of truth).
    const knownIds = new Set(
      await withPrisma(async (prisma) =>
        (await prisma.forgeWafControl.findMany({ select: { wafId: true } })).map(
          (r: { wafId: string }) => r.wafId,
        ),
      ),
    );
    const valid = results.filter((r) => knownIds.has(r.wafId));

    if (valid.length === 0) {
      throw new Error("No control results matched the catalog");
    }

    await withPrisma((prisma) =>
      prisma.forgeWafControlResult.createMany({
        data: valid.map((r) => ({
          assessmentId,
          wafId: r.wafId,
          pillar: r.pillar,
          scorePercentage: r.scorePercentage,
          thresholdPercentage: r.thresholdPercentage,
          thresholdMet: r.thresholdMet,
        })),
      }),
    );

    const totals = new Map<WafPillar, { met: number; total: number }>();
    let totalControls = 0;
    let metControls = 0;
    for (const r of valid) {
      const t = totals.get(r.pillar) ?? { met: 0, total: 0 };
      t.total += 1;
      if (r.thresholdMet) t.met += 1;
      totals.set(r.pillar, t);
      totalControls += 1;
      if (r.thresholdMet) metControls += 1;
    }

    const governanceScore = pillarScore(totals, "governance");
    const iuScore = pillarScore(totals, "interoperability_usability");
    const oeScore = pillarScore(totals, "operational_excellence");
    const scpScore = pillarScore(totals, "security_compliance_privacy");
    const reliabilityScore = pillarScore(totals, "reliability");
    const costScore = pillarScore(totals, "cost_optimisation");
    const performanceScore = pillarScore(totals, "performance_efficiency");
    const available = [
      governanceScore,
      iuScore,
      oeScore,
      scpScore,
      reliabilityScore,
      costScore,
      performanceScore,
    ].filter((n): n is number => n != null);
    const overallScore =
      available.length === 0
        ? null
        : Math.round((available.reduce((a, b) => a + b, 0) / available.length) * 10) / 10;

    const updated = await withPrisma((prisma) =>
      prisma.forgeWafAssessment.update({
        where: { assessmentId },
        data: {
          status: "completed",
          governanceScore,
          iuScore,
          oeScore,
          scpScore,
          reliabilityScore,
          costScore,
          performanceScore,
          overallScore,
          totalControls,
          metControls,
          completedAt: new Date(),
          errorMessage:
            errors.length > 0
              ? `Some pillars failed: ${errors.map((e) => e.pillar).join(", ")}`
              : null,
        },
      }),
    );

    return toSummary(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[waf-assessment] run failed", { assessmentId, error: message });
    const updated = await withPrisma((prisma) =>
      prisma.forgeWafAssessment.update({
        where: { assessmentId },
        data: {
          status: "failed",
          errorMessage: message,
          completedAt: new Date(),
        },
      }),
    );
    return toSummary(updated);
  }
}

/** List recent assessments (newest first). */
export async function listAssessments(limit = 20): Promise<WafAssessmentSummary[]> {
  const rows = await withPrisma((prisma) =>
    prisma.forgeWafAssessment.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  );
  return rows.map(toSummary);
}

/** Get the most recent completed assessment, or null. */
export async function getLatestAssessment(): Promise<WafAssessmentDetail | null> {
  const latest = await withPrisma((prisma) =>
    prisma.forgeWafAssessment.findFirst({
      where: { status: "completed" },
      orderBy: { createdAt: "desc" },
    }),
  );
  if (!latest) return null;
  return getAssessmentDetail(latest.assessmentId);
}

/** Get a single assessment with per-control results joined to the catalog. */
export async function getAssessmentDetail(
  assessmentId: string,
): Promise<WafAssessmentDetail | null> {
  const assessment = await withPrisma((prisma) =>
    prisma.forgeWafAssessment.findUnique({
      where: { assessmentId },
      include: { results: { include: { control: true } } },
    }),
  );
  if (!assessment) return null;
  return {
    ...toSummary(assessment),
    results: assessment.results.map(
      (r: {
        wafId: string;
        pillar: string;
        scorePercentage: number;
        thresholdPercentage: number;
        thresholdMet: boolean;
        control: {
          wafId: string;
          pillar: string;
          pillarName: string;
          principle: string;
          bestPractice: string;
          capabilities: string | null;
          details: string | null;
          thresholdPercentage: number | null;
          metricDefinition: string | null;
          recommendationIfNotMet: string | null;
          fixActionEngine: string | null;
          fixActionParamsJson: string | null;
          evaluationType: string;
        };
      }) => ({
        wafId: r.wafId,
        pillar: r.pillar as WafPillar,
        scorePercentage: r.scorePercentage,
        thresholdPercentage: r.thresholdPercentage,
        thresholdMet: r.thresholdMet,
        control: {
          wafId: r.control.wafId,
          pillar: r.control.pillar as WafPillar,
          pillarName: r.control.pillarName,
          principle: r.control.principle,
          bestPractice: r.control.bestPractice,
          capabilities: r.control.capabilities,
          details: r.control.details,
          thresholdPercentage: r.control.thresholdPercentage,
          metricDefinition: r.control.metricDefinition,
          recommendationIfNotMet: r.control.recommendationIfNotMet,
          fixActionEngine: r.control.fixActionEngine,
          fixActionParamsJson: r.control.fixActionParamsJson,
          evaluationType:
            r.control.evaluationType === "qualitative" ? "qualitative" : "automatic",
        },
      }),
    ),
  };
}

/** Get the catalog for the controls tab (no run required). */
export async function listControls(): Promise<WafControl[]> {
  await ensureCatalogSeeded();
  const rows = await withPrisma((prisma) =>
    prisma.forgeWafControl.findMany({
      orderBy: [{ pillar: "asc" }, { wafId: "asc" }],
    }),
  );
  return rows.map(
    (r: {
      wafId: string;
      pillar: string;
      pillarName: string;
      principle: string;
      bestPractice: string;
      capabilities: string | null;
      details: string | null;
      thresholdPercentage: number | null;
      metricDefinition: string | null;
      recommendationIfNotMet: string | null;
      fixActionEngine: string | null;
      fixActionParamsJson: string | null;
      evaluationType: string;
    }) => ({
      wafId: r.wafId,
      pillar: r.pillar as WafPillar,
      pillarName: r.pillarName,
      principle: r.principle,
      bestPractice: r.bestPractice,
      capabilities: r.capabilities,
      details: r.details,
      thresholdPercentage: r.thresholdPercentage,
      metricDefinition: r.metricDefinition,
      recommendationIfNotMet: r.recommendationIfNotMet,
      fixActionEngine: r.fixActionEngine,
      fixActionParamsJson: r.fixActionParamsJson,
      evaluationType: r.evaluationType === "qualitative" ? "qualitative" : "automatic",
    }),
  );
}

export { WAF_PILLARS };
