/**
 * API: POST /api/assessment/dashboard
 *
 * Builds the Forge WAF Lakeview dashboard JSON, then creates or updates
 * a dashboard in the workspace under `/Shared/Forge Dashboards/`.
 * Idempotent: looks up an existing dashboard by display name; creates if
 * absent, updates the serialized payload if present. Optionally publishes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/dbx/client";
import {
  createDashboard,
  getDashboard,
  listDashboards,
  publishDashboard,
  updateDashboard,
  DEFAULT_DASHBOARD_PARENT_PATH,
} from "@/lib/dbx/dashboards";
import {
  WAF_DASHBOARD_DISPLAY_NAME,
  buildWafDashboardJson,
} from "@/lib/engines/waf-assessment/dashboard/builder";
import { handleApiError } from "@/lib/api-utils";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const config = getConfig();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parentPath = (body.parentPath as string) ?? DEFAULT_DASHBOARD_PARENT_PATH;
    const shouldPublish = body.publish !== false;

    const serializedDashboard = await buildWafDashboardJson();

    // listDashboards can return entries that no longer fetch successfully (e.g.
    // half-deleted or otherwise broken). Validate via getDashboard before
    // updating; if it fails, fall through to create.
    const candidate = (await listDashboards()).find(
      (d) => d.display_name === WAF_DASHBOARD_DISPLAY_NAME,
    );

    let existingId: string | null = null;
    if (candidate) {
      try {
        const fetched = await getDashboard(candidate.dashboard_id);
        if (fetched && fetched.lifecycle_state !== "TRASHED") {
          existingId = fetched.dashboard_id ?? candidate.dashboard_id;
        }
      } catch (err) {
        logger.warn("WAF dashboard candidate not retrievable, will recreate", {
          dashboardId: candidate.dashboard_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let dashboardId: string;
    let action: "created" | "updated";

    if (existingId) {
      try {
        const result = await updateDashboard(existingId, {
          displayName: WAF_DASHBOARD_DISPLAY_NAME,
          serializedDashboard,
          warehouseId: config.warehouseId,
        });
        dashboardId = result.dashboard_id;
        action = "updated";
      } catch (err) {
        logger.warn("WAF dashboard update failed, recreating", {
          dashboardId: existingId,
          error: err instanceof Error ? err.message : String(err),
        });
        const result = await createDashboard({
          displayName: WAF_DASHBOARD_DISPLAY_NAME,
          serializedDashboard,
          warehouseId: config.warehouseId,
          parentPath,
        });
        dashboardId = result.dashboard_id;
        action = "created";
      }
    } else {
      const result = await createDashboard({
        displayName: WAF_DASHBOARD_DISPLAY_NAME,
        serializedDashboard,
        warehouseId: config.warehouseId,
        parentPath,
      });
      dashboardId = result.dashboard_id;
      action = "created";
    }

    let published = false;
    if (shouldPublish) {
      try {
        await publishDashboard(dashboardId, config.warehouseId);
        published = true;
      } catch (err) {
        logger.warn("WAF dashboard publish failed (dashboard still saved)", {
          dashboardId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const dashboardUrl = published
      ? `${config.host}/dashboardsv3/${dashboardId}/published`
      : `${config.host}/dashboardsv3/${dashboardId}`;

    logger.info(`WAF dashboard ${action}`, { dashboardId });

    return NextResponse.json({
      success: true,
      action,
      dashboardId,
      dashboardUrl,
    });
  } catch (error) {
    return handleApiError(error, "/api/assessment/dashboard");
  }
}
