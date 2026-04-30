/**
 * API: GET /api/assessment/controls
 *
 * Returns the seeded WAF controls catalog (no run required).
 * Used by the catalog browser tab on /assessment.
 */

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { listControls } from "@/lib/engines/waf-assessment/service";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await ensureMigrated();
    const controls = await listControls();
    return NextResponse.json({ controls });
  } catch (error) {
    return handleApiError(error, "/api/assessment/controls");
  }
}
