/**
 * API: POST /api/assessment/genie
 *
 * Builds the Forge WAF Genie space `serialized_space`, then creates or
 * updates the space in the workspace under `/Shared/Forge Genie Spaces/`.
 * Idempotent: looks up an existing space by title; creates if absent,
 * updates the serialized payload if present.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/dbx/client";
import {
  createGenieSpace,
  listGenieSpaces,
  updateGenieSpace,
  DEFAULT_GENIE_PARENT_PATH,
} from "@/lib/dbx/genie";
import {
  WAF_GENIE_DESCRIPTION,
  WAF_GENIE_TITLE,
  buildWafGenieSerializedSpace,
} from "@/lib/engines/waf-assessment/genie/builder";
import { handleApiError } from "@/lib/api-utils";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const config = getConfig();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parentPath = (body.parentPath as string) ?? DEFAULT_GENIE_PARENT_PATH;

    const serializedSpace = buildWafGenieSerializedSpace();

    let pageToken: string | undefined;
    let existing: { space_id: string; title: string } | undefined;
    do {
      const page = await listGenieSpaces(100, pageToken);
      existing = (page.spaces ?? []).find((s) => s.title === WAF_GENIE_TITLE);
      if (existing) break;
      pageToken = page.next_page_token;
    } while (pageToken);

    let spaceId: string;
    let action: "created" | "updated";

    if (existing) {
      const result = await updateGenieSpace(existing.space_id, {
        title: WAF_GENIE_TITLE,
        description: WAF_GENIE_DESCRIPTION,
        serializedSpace,
        warehouseId: config.warehouseId,
      });
      spaceId = result.space_id;
      action = "updated";
    } else {
      const result = await createGenieSpace({
        title: WAF_GENIE_TITLE,
        description: WAF_GENIE_DESCRIPTION,
        serializedSpace,
        warehouseId: config.warehouseId,
        parentPath,
      });
      spaceId = result.space_id;
      action = "created";
    }

    const spaceUrl = `${config.host}/genie/rooms/${spaceId}`;

    logger.info(`WAF Genie space ${action}`, { spaceId });

    return NextResponse.json({
      success: true,
      action,
      spaceId,
      spaceUrl,
    });
  } catch (error) {
    return handleApiError(error, "/api/assessment/genie");
  }
}
