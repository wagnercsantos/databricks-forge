/**
 * API: GET / POST / DELETE /api/assessment/qualitative
 *
 * Workspace-level qualitative answers for the 6 qualitative WAF controls
 * (FMA / DR drill / SDLC / FinOps / ops standardization / identity audit).
 *
 *   GET    -> list every saved response
 *   POST   -> upsert one response  { wafId, response, notes? }
 *   DELETE -> remove one response  { wafId }
 *
 * Responses are reused across assessment runs — they are configuration,
 * not a per-run artifact.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import {
  deleteQualitativeResponse,
  listQualitativeResponses,
  saveQualitativeResponse,
} from "@/lib/engines/waf-assessment/service";
import type { WafQualitativeAnswer } from "@/lib/engines/waf-assessment/types";
import { handleApiError } from "@/lib/api-utils";

const VALID_RESPONSES: ReadonlySet<WafQualitativeAnswer> = new Set([
  "yes",
  "partial",
  "no",
  "not_applicable",
]);

export async function GET() {
  try {
    await ensureMigrated();
    const responses = await listQualitativeResponses();
    return NextResponse.json({ responses });
  } catch (error) {
    return handleApiError(error, "/api/assessment/qualitative");
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();
    const body = await request.json().catch(() => ({}));
    const wafId = typeof body.wafId === "string" ? body.wafId : "";
    const response = typeof body.response === "string" ? body.response : "";
    if (!wafId) {
      return NextResponse.json({ error: "wafId is required" }, { status: 400 });
    }
    if (!VALID_RESPONSES.has(response as WafQualitativeAnswer)) {
      return NextResponse.json(
        { error: "response must be one of yes | partial | no | not_applicable" },
        { status: 400 },
      );
    }
    const notes = typeof body.notes === "string" ? body.notes : null;
    const respondedBy = typeof body.respondedBy === "string" ? body.respondedBy : null;
    const saved = await saveQualitativeResponse({
      wafId,
      response: response as WafQualitativeAnswer,
      notes,
      respondedBy,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return handleApiError(error, "/api/assessment/qualitative");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureMigrated();
    const body = await request.json().catch(() => ({}));
    const wafId = typeof body.wafId === "string" ? body.wafId : "";
    if (!wafId) {
      return NextResponse.json({ error: "wafId is required" }, { status: 400 });
    }
    await deleteQualitativeResponse(wafId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "/api/assessment/qualitative");
  }
}
