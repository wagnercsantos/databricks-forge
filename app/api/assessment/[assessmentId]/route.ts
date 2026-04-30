/**
 * API: GET /api/assessment/:assessmentId
 *
 * Returns full per-control detail for a single assessment, joined to
 * the catalog (recommendations + fix-action engine bindings).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getAssessmentDetail } from "@/lib/engines/waf-assessment/service";
import { handleApiError, requireSafeId } from "@/lib/api-utils";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ assessmentId: string }> },
) {
  try {
    await ensureMigrated();
    const { assessmentId } = await context.params;
    const invalid = requireSafeId(assessmentId, "assessment ID");
    if (invalid) return invalid;

    const detail = await getAssessmentDetail(assessmentId);
    if (!detail) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    return handleApiError(error, "/api/assessment/[id]");
  }
}
