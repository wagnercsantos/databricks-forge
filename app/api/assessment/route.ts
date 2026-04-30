/**
 * API: GET /api/assessment
 *
 * Returns the latest completed assessment (with per-control results)
 * and the list of recent runs for the history panel.
 */

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getLatestAssessment, listAssessments } from "@/lib/engines/waf-assessment/service";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await ensureMigrated();
    const [latest, history] = await Promise.all([getLatestAssessment(), listAssessments(20)]);
    return NextResponse.json({ latest, history });
  } catch (error) {
    return handleApiError(error, "/api/assessment");
  }
}
