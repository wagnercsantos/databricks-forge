/**
 * Ingestion-strategy recommendation for a Reference Data Asset.
 *
 * Logic: rank the four candidate strategies (Lakeflow Connect, UC Federation,
 * Lakebridge Migrate, Bespoke) by their `High/Low` rating from the master
 * repository, then surface the highest-rated path first. If multiple
 * strategies are rated High, prefer the more "managed" one per the order
 * Lakeflow Connect > UC Federation > Lakebridge Migrate > Bespoke.
 */

import type { ReferenceDataAsset } from "@/lib/domain/industry-outcomes/master-repo-types";
import type { IngestionRecommendation, IngestionStrategy } from "./types";

const STRATEGY_ORDER: IngestionStrategy[] = [
  "lakeflow_connect",
  "uc_federation",
  "lakebridge_migrate",
  "bespoke",
];

function ratingFor(asset: ReferenceDataAsset, strategy: IngestionStrategy): "High" | "Low" {
  switch (strategy) {
    case "lakeflow_connect":
      return asset.lakeflowConnect;
    case "uc_federation":
      return asset.ucFederation;
    case "lakebridge_migrate":
      return asset.lakebridgeMigrate;
    case "bespoke":
      return asset.bespoke ?? "Low";
  }
}

function rationaleFor(
  strategy: IngestionStrategy,
  asset: ReferenceDataAsset,
  rating: "High" | "Low",
): string {
  // Prefer the per-asset rationale text when available -- it is the verbatim
  // quote from the master repo's "Ease of Data Access Analysis" sheet.
  if (asset.accessRationale && asset.accessRationale.length > 0) {
    return asset.accessRationale;
  }
  const verb = rating === "High" ? "preferred" : "not recommended";
  switch (strategy) {
    case "lakeflow_connect":
      return `Lakeflow Connect is ${verb} for "${asset.name}" (${asset.systemLocation || "system n/a"}).`;
    case "uc_federation":
      return `UC Federation is ${verb} for "${asset.name}".`;
    case "lakebridge_migrate":
      return `Lakebridge migration is ${verb} for "${asset.name}".`;
    case "bespoke":
      return `A bespoke connector is ${verb} for "${asset.name}".`;
  }
}

export function buildIngestionRecommendations(
  asset: ReferenceDataAsset,
): IngestionRecommendation[] {
  const ratings = STRATEGY_ORDER.map((s) => ({ strategy: s, rating: ratingFor(asset, s) }));
  // Stable sort: High first (preserving STRATEGY_ORDER), then Low.
  ratings.sort((a, b) => {
    if (a.rating === b.rating) return 0;
    return a.rating === "High" ? -1 : 1;
  });
  return ratings.map((r) => ({
    strategy: r.strategy,
    rating: r.rating,
    rationale: rationaleFor(r.strategy, asset, r.rating),
  }));
}
