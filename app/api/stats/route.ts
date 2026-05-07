/**
 * API: /api/stats
 *
 * GET -- aggregate stats across all runs and use cases for the dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { isDatabaseReady, withPrisma } from "@/lib/prisma";
import { safeErrorMessage } from "@/lib/error-utils";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { isBenchmarksEnabled } from "@/lib/benchmarks/config";
import { logger } from "@/lib/logger";
import { requireUser, ForgeAuthError } from "@/lib/auth/route-user";
import { listAccessibleIds } from "@/lib/lakebase/acl";

export async function GET(request: NextRequest) {
  try {
    if (!isDatabaseReady()) {
      return NextResponse.json(
        { error: "Database is warming up. Please retry shortly." },
        { status: 503, headers: { "Retry-After": "3" } },
      );
    }

    await ensureMigrated();
    const user = await requireUser(request);
    const sharedRunIds = await listAccessibleIds(user.email, "run");
    const runVisibility = {
      OR: [{ ownerEmail: user.email }, { runId: { in: sharedRunIds } }],
    };
    const useCaseVisibility = {
      run: { OR: [{ ownerEmail: user.email }, { runId: { in: sharedRunIds } }] },
    };

    const result = await withPrisma(async (prisma) => {
      const [runStatusGroups, recentRuns] = await Promise.all([
        prisma.forgeRun.groupBy({
          by: ["status"],
          _count: { _all: true },
          where: runVisibility,
        }),
        prisma.forgeRun.findMany({
          where: runVisibility,
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            runId: true,
            businessName: true,
            status: true,
            progressPct: true,
            createdAt: true,
            completedAt: true,
            _count: { select: { useCases: true } },
          },
        }),
      ]);

      const [typeGroups, domainGroups, scoreRows] = await Promise.all([
        prisma.forgeUseCase.groupBy({
          by: ["type"],
          _count: { _all: true },
          where: useCaseVisibility,
        }),
        prisma.forgeUseCase.groupBy({
          by: ["domain"],
          _count: { _all: true },
          where: useCaseVisibility,
          orderBy: { _count: { domain: "desc" } },
        }),
        prisma.forgeUseCase.findMany({
          select: { overallScore: true },
          where: { overallScore: { not: null }, ...useCaseVisibility },
        }),
      ]);

      const [qualityRows, benchmarkRows] = await Promise.all([
        prisma.forgeQualityMetric.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            OR: [
              { ownerEmail: user.email },
              { run: runVisibility },
            ],
          },
          select: {
            metricType: true,
            metricName: true,
            metricValue: true,
            passed: true,
          },
        }),
        isBenchmarksEnabled()
          ? prisma.forgeBenchmarkRecord.findMany({
              where: { lifecycleStatus: "published" },
              select: {
                industry: true,
                publishedAt: true,
                ttlDays: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const statusLookup = new Map(runStatusGroups.map((g) => [g.status, g._count._all]));
      const completedRuns = statusLookup.get("completed") ?? 0;
      const failedRuns = statusLookup.get("failed") ?? 0;
      const runningRuns = (statusLookup.get("running") ?? 0) + (statusLookup.get("pending") ?? 0);
      const totalRuns = runStatusGroups.reduce((sum, g) => sum + g._count._all, 0);

      const typeLookup = new Map(typeGroups.map((g) => [g.type, g._count._all]));
      const aiCount = typeLookup.get("AI") ?? 0;
      const statisticalCount = typeLookup.get("Statistical") ?? 0;
      const geospatialCount = typeLookup.get("Geospatial") ?? 0;
      const totalUseCases = typeGroups.reduce((sum, g) => sum + g._count._all, 0);

      const scores = scoreRows.map((r) => r.overallScore!);
      const avgScore =
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
          : 0;

      const domainBreakdown = domainGroups.map((g) => ({
        domain: g.domain ?? "Unknown",
        count: g._count._all,
      }));

      const consultantRows = qualityRows.filter(
        (m) => m.metricType === "run" && m.metricName === "consultant_readiness",
      );
      const assistantRows = qualityRows.filter(
        (m) => m.metricType === "assistant" && m.metricName === "assistant_overall_score",
      );
      const avgConsultantReadiness =
        consultantRows.length > 0
          ? consultantRows.reduce((s, m) => s + m.metricValue, 0) / consultantRows.length
          : null;
      const avgAssistantScore =
        assistantRows.length > 0
          ? assistantRows.reduce((s, m) => s + m.metricValue, 0) / assistantRows.length
          : null;
      const releaseGatePassRate =
        consultantRows.length > 0
          ? consultantRows.filter((m) => m.passed === true).length / consultantRows.length
          : null;

      const now = Date.now();
      const freshBenchmarks = benchmarkRows.filter((r) => {
        const start = r.publishedAt ? r.publishedAt.getTime() : now;
        const expiry = start + r.ttlDays * 24 * 60 * 60 * 1000;
        return expiry >= now;
      });
      const benchmarkFreshnessRate =
        benchmarkRows.length > 0 ? freshBenchmarks.length / benchmarkRows.length : null;
      const benchmarkIndustryCoverage = new Set(
        benchmarkRows.map((r) => (r.industry ?? "").trim()).filter(Boolean),
      ).size;

      const recent = recentRuns.map((r) => ({
        runId: r.runId,
        businessName: r.businessName,
        status: r.status,
        progressPct: r.progressPct,
        useCaseCount: r._count.useCases,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      }));

      return {
        totalRuns,
        completedRuns,
        failedRuns,
        runningRuns,
        totalUseCases,
        aiCount,
        statisticalCount,
        geospatialCount,
        avgScore,
        totalDomains: domainBreakdown.length,
        domainBreakdown,
        scores,
        recentRuns: recent,
        quality: {
          avgConsultantReadiness,
          avgAssistantScore,
          releaseGatePassRate,
          benchmarkFreshnessRate,
          benchmarkIndustryCoverage,
        },
      };
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForgeAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/stats] GET failed", { error: msg });
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
