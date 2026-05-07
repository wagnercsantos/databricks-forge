/**
 * Startup guard: refuses to boot if any root table contains rows with
 * `owner_email IS NULL`.
 *
 * Per the User Isolation refactor, every root model has a NOT NULL
 * `ownerEmail` column. The Prisma migration is forward-only and assumes
 * the database has been wiped before deploy. This guard is a defensive
 * check -- if a botched migration leaves null owners behind, we want a
 * loud failure rather than silent invisible orphan rows.
 *
 * Tables checked: every root model declared with `ownerEmail` in
 * `prisma/schema.prisma`. Children inherit visibility via their parent
 * FK and don't need a direct check.
 *
 * Behaviour:
 *   - If `FORGE_USER_ISOLATION=false`, the guard logs a warning and
 *     allows boot to proceed (escape hatch for emergency deploys).
 *   - Otherwise, finding any null-owner rows throws and the process
 *     exits.
 */

import { withPrisma } from "@/lib/prisma";
import { isUserIsolationEnabled } from "@/lib/config/isolation-flag";
import { logger } from "@/lib/logger";

interface RootTableCheck {
  label: string;
  count: () => Promise<number>;
}

export async function assertOwnerEmailIntegrity(): Promise<void> {
  const counts = await withPrisma(async (prisma) => {
    // Each row is a root model that the isolation refactor added an owner to.
    // Children (use cases, exports, prompt logs, ...) cascade through their
    // parents via FK and aren't checked directly.
    const checks: RootTableCheck[] = [
      { label: "ForgeRun", count: () => prisma.forgeRun.count({ where: { ownerEmail: null } }) },
      {
        label: "ForgeEnvironmentScan",
        count: () => prisma.forgeEnvironmentScan.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeGenieSpace",
        count: () => prisma.forgeGenieSpace.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeMetadataGenieSpace",
        count: () =>
          prisma.forgeMetadataGenieSpace.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeSpaceBenchmarkRun",
        count: () => prisma.forgeSpaceBenchmarkRun.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeSpaceHealthScore",
        count: () => prisma.forgeSpaceHealthScore.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeDemoSession",
        count: () => prisma.forgeDemoSession.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeCommentJob",
        count: () => prisma.forgeCommentJob.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeConnection",
        count: () => prisma.forgeConnection.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeFabricScan",
        count: () => prisma.forgeFabricScan.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeFabricMigration",
        count: () => prisma.forgeFabricMigration.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeStrategyDocument",
        count: () => prisma.forgeStrategyDocument.count({ where: { ownerEmail: null } }),
      },
      {
        label: "ForgeDocument",
        count: () => prisma.forgeDocument.count({ where: { ownerEmail: null } }),
      },
    ];

    const results: Array<{ label: string; count: number }> = [];
    for (const check of checks) {
      try {
        const c = await check.count();
        if (c > 0) results.push({ label: check.label, count: c });
      } catch (err) {
        // Table may not exist yet on a fresh deploy -- skip silently.
        logger.debug("[isolation-guard] Skipping table (does not exist yet)", {
          label: check.label,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  });

  if (counts.length === 0) {
    logger.info("[isolation-guard] All root tables have ownerEmail populated.");
    return;
  }

  const summary = counts.map((c) => `  - ${c.label}: ${c.count} rows`).join("\n");
  const message =
    `Startup integrity check failed: rows with NULL owner_email found.\n${summary}\n\n` +
    `These rows are invisible to all users under the per-user isolation model.\n` +
    `Run a factory reset (deleteAllData()) and re-deploy, or back-fill the\n` +
    `owner_email column manually before flipping FORGE_USER_ISOLATION on.`;

  if (!isUserIsolationEnabled()) {
    logger.warn(`[isolation-guard] ${message}\nFORGE_USER_ISOLATION=false; allowing boot.`);
    return;
  }

  // Loud, fatal failure. The process will exit so the platform retries
  // the deploy with a clear error message instead of silently corrupting
  // visibility.
  logger.error(`[isolation-guard] ${message}`);
  throw new Error(message);
}
