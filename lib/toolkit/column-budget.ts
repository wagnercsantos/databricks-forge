/**
 * Column Budget Engine -- intelligent column selection for large schemas.
 *
 * When Large Schema Mode is enabled, this module controls how many columns
 * are included in LLM prompts and sample data queries. Instead of naive
 * `slice(0, N)`, it uses a three-tier scoring strategy to surface the most
 * business-relevant columns:
 *
 *   Tier 1: Prior LLM classifications (EnrichedColumn from estate scan)
 *   Tier 2: Column comments + business keyword detection
 *   Tier 3: Deterministic heuristics (inferColumnRole from deterministic.ts)
 *
 * @module toolkit/column-budget
 */

import { inferColumnRole } from "@/lib/metadata/deterministic";
import type { ColumnRole, EnrichedColumn } from "@/lib/metadata/types";
import type { ColumnInfo } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ColumnBudgetConfig {
  /** Max columns per table in schema markdown (default: 40, large: 25). */
  maxColumnsPerTable: number;
  /** Max comment length in schema markdown (default: 80, large: 60). */
  maxCommentLength: number;
  /** Max columns in sample data SELECT (0 = unlimited). */
  maxSampleColumns: number;
  /** SQL LIMIT for listColumns queries (default: 500_000, large: 200_000). */
  maxColumnRowsPerScope: number;
  /** Use compact `name(type)` format without comments for overflow hints. */
  compactFormat: boolean;
}

const DEFAULT_BUDGET: ColumnBudgetConfig = {
  maxColumnsPerTable: 40,
  maxCommentLength: 80,
  maxSampleColumns: 0,
  maxColumnRowsPerScope: 500_000,
  compactFormat: false,
};

const LARGE_SCHEMA_BUDGET: ColumnBudgetConfig = {
  maxColumnsPerTable: 25,
  maxCommentLength: 60,
  maxSampleColumns: 18,
  maxColumnRowsPerScope: 200_000,
  compactFormat: true,
};

export function resolveColumnBudget(largeSchemaMode: boolean): ColumnBudgetConfig {
  return largeSchemaMode ? { ...LARGE_SCHEMA_BUDGET } : { ...DEFAULT_BUDGET };
}

// ---------------------------------------------------------------------------
// Business keyword detection
// ---------------------------------------------------------------------------

const BUSINESS_KEYWORDS = new Set([
  "revenue",
  "profit",
  "margin",
  "customer",
  "order",
  "invoice",
  "payment",
  "transaction",
  "churn",
  "retention",
  "conversion",
  "risk",
  "fraud",
  "compliance",
  "forecast",
  "budget",
  "sales",
  "pipeline",
  "campaign",
  "engagement",
  "satisfaction",
  "nps",
  "ltv",
  "lifetime",
  "segment",
  "cohort",
  "inventory",
  "shipment",
  "delivery",
  "subscription",
  "renewal",
  "discount",
  "price",
  "cost",
  "expense",
  "asset",
  "liability",
  "equity",
  "balance",
  "quota",
  "target",
  "kpi",
  "metric",
  "score",
  "rating",
  "rank",
  "tier",
  "priority",
  "status",
  "category",
  "classification",
]);

function commentHasBusinessKeyword(comment: string | null | undefined): boolean {
  if (!comment) return false;
  const lower = comment.toLowerCase();
  for (const kw of BUSINESS_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Column scoring
// ---------------------------------------------------------------------------

/** Role-based score contribution (Tier 3). */
const ROLE_SCORES: Record<string, number> = {
  pk: 25,
  fk: 20,
  measure: 18,
  timestamp: 12,
  flag: 10,
  code: 8,
  free_text: 5,
};

export interface ColumnScoreOptions {
  /** Prior LLM-enriched columns keyed by column name (from a previous estate scan). */
  enrichedColumns?: Map<string, EnrichedColumn>;
  /** FK constraint column names (columns that have explicit FK relationships). */
  fkColumnNames?: Set<string>;
}

/**
 * Score a single column for selection priority.
 *
 * Higher scores = more likely to be included in token-budgeted prompts.
 */
export function scoreColumn(
  col: { columnName: string; dataType: string; comment: string | null },
  options?: ColumnScoreOptions,
): number {
  let score = 0;

  // Tier 1: Prior LLM classification
  const enriched = options?.enrichedColumns?.get(col.columnName);
  if (enriched?.inferredRole) {
    score += 30;
  }

  // Tier 2: Column comments
  if (col.comment) {
    score += 15;
    if (commentHasBusinessKeyword(col.comment)) {
      score += 10;
    }
  }

  // Tier 3: Deterministic heuristic
  const heuristicRole = inferColumnRole(col.columnName, col.dataType);
  if (heuristicRole) {
    score += ROLE_SCORES[heuristicRole] ?? 0;
  }

  // Bonus for explicit FK constraints
  if (options?.fkColumnNames?.has(col.columnName)) {
    score += 5;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Intelligent column selection
// ---------------------------------------------------------------------------

export interface ColumnSelectionResult<C> {
  /** Columns selected for inclusion (sorted by score descending). */
  selected: C[];
  /** Number of columns omitted. */
  omittedCount: number;
  /** Up to 3 sample names from omitted columns as LLM hints. */
  omittedHints: string[];
}

/**
 * Select the most representative columns from a table, using the three-tier
 * scoring strategy.
 *
 * Returns at most `maxCount` columns, prioritised by business relevance.
 * When all columns fit within the budget, all are returned unchanged.
 */
export function selectRepresentativeColumns<C extends ColumnInfo>(
  columns: C[],
  maxCount: number,
  options?: ColumnScoreOptions,
): ColumnSelectionResult<C> {
  if (maxCount <= 0 || columns.length <= maxCount) {
    return { selected: columns, omittedCount: 0, omittedHints: [] };
  }

  const scored = columns.map((col) => ({
    col,
    score: scoreColumn(col, options),
  }));

  // Stable sort: by score descending, then by ordinal position ascending
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.col.ordinalPosition - b.col.ordinalPosition;
  });

  const selected = scored.slice(0, maxCount).map((s) => s.col);
  const omitted = scored.slice(maxCount).map((s) => s.col);

  // Pick up to 3 hint names from the omitted set, spread across the list
  const hints: string[] = [];
  if (omitted.length > 0) {
    const step = Math.max(1, Math.floor(omitted.length / 3));
    for (let i = 0; i < omitted.length && hints.length < 3; i += step) {
      hints.push(omitted[i].columnName);
    }
  }

  return {
    selected,
    omittedCount: omitted.length,
    omittedHints: hints,
  };
}

/**
 * Build a compact column descriptor for overflow hints.
 */
export function buildCompactColumnLine(col: {
  columnName: string;
  dataType: string;
}): string {
  return `${col.columnName}(${col.dataType})`;
}
