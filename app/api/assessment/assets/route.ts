/**
 * API: GET /api/assessment/assets
 *
 * Reports whether the Forge WAF dashboard and Genie space currently exist
 * in the workspace, plus their URLs. Drives the "Generate" -> "Open"
 * button toggle on the assessment page.
 */

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/dbx/client";
import { listDashboards } from "@/lib/dbx/dashboards";
import { listGenieSpaces } from "@/lib/dbx/genie";
import { WAF_DASHBOARD_DISPLAY_NAME } from "@/lib/engines/waf-assessment/dashboard/builder";
import { WAF_GENIE_TITLE } from "@/lib/engines/waf-assessment/genie/builder";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const config = getConfig();

    const [dashboards, genieFirstPage] = await Promise.all([
      listDashboards().catch(() => []),
      listGenieSpaces(100).catch(() => ({ spaces: [], next_page_token: undefined })),
    ]);

    const dashboard = dashboards.find((d) => d.display_name === WAF_DASHBOARD_DISPLAY_NAME);

    let geniePage = genieFirstPage;
    let genieMatch = (geniePage.spaces ?? []).find((s) => s.title === WAF_GENIE_TITLE);
    while (!genieMatch && geniePage.next_page_token) {
      geniePage = await listGenieSpaces(100, geniePage.next_page_token);
      genieMatch = (geniePage.spaces ?? []).find((s) => s.title === WAF_GENIE_TITLE);
    }

    return NextResponse.json({
      dashboard: dashboard
        ? {
            id: dashboard.dashboard_id,
            url: `${config.host}/sql/dashboardsv3/${dashboard.dashboard_id}`,
          }
        : null,
      genie: genieMatch
        ? {
            id: genieMatch.space_id,
            url: `${config.host}/genie/rooms/${genieMatch.space_id}`,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, "/api/assessment/assets");
  }
}
