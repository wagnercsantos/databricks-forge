/**
 * Factory-reset helper — deletes ALL application data from Lakebase.
 *
 * Deleting ForgeRun rows cascades to ~15 child tables (use cases,
 * exports, prompt logs, Genie data, dashboards, background jobs, value
 * estimates, roadmap phases, use case tracking, value captures,
 * stakeholder profiles, strategy alignments, Genie engine config, etc.).
 * Environment scans cascade to details, histories, lineage, insights,
 * discovered Genie spaces / dashboards, and asset coverage.
 * Deleting ForgeCommentJob cascades to ForgeCommentProposal.
 * Deleting ForgeConnection cascades to ForgeFabricScan, which cascades
 * to FabricWorkspace/Dataset/Report/Artifact.
 * Deleting ForgeStrategyDocument cascades to ForgeStrategyAlignment.
 *
 * Standalone tables (no cascade parent) are deleted explicitly. Anything
 * the user-isolation refactor added (ACL, usage, quality metrics, demo
 * sessions, fabric migrations, space benchmark/health, health check
 * config) is included so a factory reset really does take the system
 * back to a clean slate before a multi-user rollout.
 *
 * The forge_embeddings table (pgvector, managed outside Prisma) is
 * also truncated so no stale vectors survive a factory reset.
 */

import { withPrisma } from "@/lib/prisma";
import { cancelAllPipelines } from "@/lib/pipeline/engine";
import { logger } from "@/lib/logger";

export async function deleteAllData(): Promise<void> {
  const cancelled = await cancelAllPipelines();
  if (cancelled > 0) {
    logger.info("[reset] Cancelled active pipelines before deleting data", { cancelled });
  }

  // Demo Mode UC objects live outside Lakebase. Drop them BEFORE we
  // truncate the ForgeDemoSession rows, otherwise the synthetic catalogs
  // and schemas will be orphaned in the customer's Unity Catalog.
  // Failures here are logged but non-fatal -- a missing UC catalog is fine.
  try {
    const { cleanupDemoSession } = await import("@/lib/demo/cleanup");
    const { databricksSqlExecutor } = await import("@/lib/ports/defaults/databricks-sql-executor");
    const sessions = await withPrisma((p) =>
      p.forgeDemoSession.findMany({ select: { id: true } }),
    );
    if (sessions.length > 0) {
      logger.info("[reset] Cleaning up demo session UC objects", { count: sessions.length });
      for (const { id: sessionId } of sessions) {
        try {
          await cleanupDemoSession(sessionId, databricksSqlExecutor);
        } catch (err) {
          logger.warn("[reset] Demo session cleanup failed (continuing)", {
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  } catch (err) {
    logger.warn("[reset] Demo cleanup module unavailable (skipping UC cleanup)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await withPrisma(async (prisma) => {
    // Truncate the pgvector embeddings table (not managed by Prisma)
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE forge_embeddings`);
    } catch {
      // Table may not exist yet if pgvector was never initialised
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM forge_embeddings`);
      } catch {
        logger.debug("[reset] forge_embeddings table does not exist, skipping");
      }
    }

    await prisma.$transaction([
      // Connections cascade through fabric scans / workspaces / datasets / reports / artifacts
      prisma.forgeFabricMigration.deleteMany(),
      prisma.forgeConnection.deleteMany(),
      // Environment scans cascade to all per-scan child tables
      prisma.forgeEnvironmentScan.deleteMany(),
      // Strategy documents cascade to alignments before runs are dropped
      prisma.forgeStrategyDocument.deleteMany(),
      // Runs cascade to ~15 child tables (use cases, BV, Genie/Dashboard, exports, BG jobs, ...)
      prisma.forgeRun.deleteMany(),
      // Quality metrics may have null runId rows — clean those up explicitly
      prisma.forgeQualityMetric.deleteMany(),
      prisma.forgeCommentJob.deleteMany(),
      prisma.forgeMetadataCache.deleteMany(),
      prisma.forgePromptTemplate.deleteMany(),
      prisma.forgeActivityLog.deleteMany(),
      prisma.forgeOutcomeMap.deleteMany(),
      prisma.forgeDocument.deleteMany(),
      prisma.forgeConversation.deleteMany(),
      prisma.forgeAssistantLog.deleteMany(),
      prisma.forgeBenchmarkRecord.deleteMany(),
      prisma.forgeMetadataGenieSpace.deleteMany(),
      prisma.forgeGenieSpaceCache.deleteMany(),
      prisma.forgeDemoSession.deleteMany(),
      prisma.forgeSpaceBenchmarkRun.deleteMany(),
      prisma.forgeSpaceHealthScore.deleteMany(),
      prisma.forgeHealthCheckConfig.deleteMany(),
      // Isolation/accounting tables
      prisma.forgeResourceAcl.deleteMany(),
      prisma.forgeUsage.deleteMany(),
    ]);
  });
}
