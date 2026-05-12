/**
 * API: POST /api/assessment/run
 *
 * Triggers a fresh WAF assessment, running synchronously while the
 * pillar queries execute (typically 10-30s on a warm warehouse). The
 * response is the final assessment summary.
 *
 * `scope` is an optional UC label stored alongside the run for display;
 * the SQL queries themselves scan all of `system.*` (workspace-wide).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { runAssessment } from "@/lib/engines/waf-assessment/service";
import { handleApiError } from "@/lib/api-utils";
import { requireUser, ForgeAuthError } from "@/lib/auth/route-user";

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();
    let user;
    try {
      user = await requireUser(request);
    } catch (e) {
      if (e instanceof ForgeAuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
    const body = await request.json().catch(() => ({}));
    const scope = typeof body.scope === "string" ? body.scope : undefined;
    const triggeredBy =
      typeof body.triggeredBy === "string" ? body.triggeredBy : user.email;

    const summary = await runAssessment({
      scope,
      triggeredBy,
      ownerEmail: user.email,
    });
    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    return handleApiError(error, "/api/assessment/run");
  }
}
