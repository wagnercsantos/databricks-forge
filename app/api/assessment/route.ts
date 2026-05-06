/**
 * API: GET /api/assessment
 *
 * Returns the latest completed assessment (with per-control results)
 * and the list of recent runs for the history panel.
 */

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import {
  getLatestAssessment,
  listAssessments,
  listControls,
  listIgnoredResources,
  listQualitativeResponses,
} from "@/lib/engines/waf-assessment/service";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    await ensureMigrated();
    const [latest, history, controls, qualitativeResponses, ignored] = await Promise.all([
      getLatestAssessment(),
      listAssessments(20),
      listControls(),
      listQualitativeResponses(),
      listIgnoredResources(),
    ]);
    const qualitativeControls = controls.filter((c) => c.evaluationType === "qualitative");
    return NextResponse.json({
      latest,
      history,
      qualitativeControls,
      qualitativeResponses,
      ignored,
    });
  } catch (error) {
    return handleApiError(error, "/api/assessment");
  }
}
