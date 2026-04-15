import { describe, it, expect } from "vitest";
import {
  resolveColumnBudget,
  scoreColumn,
  selectRepresentativeColumns,
  buildCompactColumnLine,
  type ColumnScoreOptions,
} from "@/lib/toolkit/column-budget";
import type { ColumnInfo } from "@/lib/domain/types";
import type { EnrichedColumn } from "@/lib/metadata/types";

// ---------------------------------------------------------------------------
// Helper: build a minimal ColumnInfo
// ---------------------------------------------------------------------------

function col(
  name: string,
  dataType = "STRING",
  ordinal = 0,
  comment: string | null = null,
): ColumnInfo {
  return {
    tableFqn: "cat.schema.table",
    columnName: name,
    dataType,
    ordinalPosition: ordinal,
    isNullable: true,
    comment,
  };
}

// ---------------------------------------------------------------------------
// resolveColumnBudget
// ---------------------------------------------------------------------------

describe("resolveColumnBudget", () => {
  it("returns default budget when largeSchemaMode is false", () => {
    const budget = resolveColumnBudget(false);
    expect(budget.maxColumnsPerTable).toBe(40);
    expect(budget.maxSampleColumns).toBe(0);
    expect(budget.maxColumnRowsPerScope).toBe(500_000);
    expect(budget.compactFormat).toBe(false);
  });

  it("returns aggressive budget when largeSchemaMode is true", () => {
    const budget = resolveColumnBudget(true);
    expect(budget.maxColumnsPerTable).toBe(15);
    expect(budget.maxSampleColumns).toBe(12);
    expect(budget.maxColumnRowsPerScope).toBe(200_000);
    expect(budget.compactFormat).toBe(true);
    expect(budget.maxCommentLength).toBe(40);
  });

  it("returns a new object each call (no shared mutation)", () => {
    const a = resolveColumnBudget(true);
    const b = resolveColumnBudget(true);
    expect(a).not.toBe(b);
    a.maxColumnsPerTable = 999;
    expect(b.maxColumnsPerTable).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// scoreColumn
// ---------------------------------------------------------------------------

describe("scoreColumn", () => {
  it("scores a plain column at 0", () => {
    expect(scoreColumn(col("foo"))).toBe(0);
  });

  it("gives 25 points to a primary key (heuristic)", () => {
    expect(scoreColumn(col("id"))).toBe(25);
    expect(scoreColumn(col("pk"))).toBe(25);
  });

  it("gives 20 points to a foreign key (heuristic)", () => {
    expect(scoreColumn(col("customer_id"))).toBe(20);
  });

  it("gives 18 points to a measure (heuristic)", () => {
    expect(scoreColumn(col("total_amount"))).toBe(18);
    expect(scoreColumn(col("revenue_total"))).toBe(18);
  });

  it("gives 12 points to a timestamp (heuristic)", () => {
    expect(scoreColumn(col("created_at"))).toBe(12);
  });

  it("gives 12 points to a timestamp data type with generic name", () => {
    expect(scoreColumn(col("event_time", "TIMESTAMP"))).toBe(12);
  });

  it("gives 10 points to a flag (heuristic)", () => {
    expect(scoreColumn(col("is_active"))).toBe(10);
  });

  it("gives 15 points for having a comment", () => {
    expect(scoreColumn(col("foo", "STRING", 0, "Some description"))).toBe(15);
  });

  it("gives 25 (15 + 10) points for a comment with a business keyword", () => {
    expect(scoreColumn(col("foo", "STRING", 0, "Tracks customer revenue"))).toBe(25);
  });

  it("stacks comment + heuristic scores", () => {
    const score = scoreColumn(col("total_amount", "DECIMAL", 0, "Monthly revenue total"));
    expect(score).toBe(18 + 15 + 10);
  });

  it("gives 30 points for prior LLM classification", () => {
    const enriched = new Map<string, EnrichedColumn>([
      [
        "nps_quartile",
        {
          name: "nps_quartile",
          dataType: "INT",
          ordinalPosition: 0,
          isNullable: true,
          comment: null,
          inferredRole: "measure",
          inferredFkTarget: null,
        },
      ],
    ]);
    const score = scoreColumn(col("nps_quartile", "INT"), { enrichedColumns: enriched });
    expect(score).toBe(30);
  });

  it("gives 5 bonus points for explicit FK constraint", () => {
    const opts: ColumnScoreOptions = {
      fkColumnNames: new Set(["customer_id"]),
    };
    const score = scoreColumn(col("customer_id"), opts);
    expect(score).toBe(20 + 5);
  });

  it("stacks all three tiers for maximum score", () => {
    const enriched = new Map<string, EnrichedColumn>([
      [
        "total_amount",
        {
          name: "total_amount",
          dataType: "DECIMAL",
          ordinalPosition: 0,
          isNullable: true,
          comment: "Total revenue amount",
          inferredRole: "measure",
          inferredFkTarget: null,
        },
      ],
    ]);
    const score = scoreColumn(col("total_amount", "DECIMAL", 0, "Total revenue amount"), {
      enrichedColumns: enriched,
    });
    // Tier 1: 30 (prior LLM) + Tier 2: 15 (comment) + 10 (business keyword "revenue") + Tier 3: 18 (measure)
    expect(score).toBe(30 + 15 + 10 + 18);
  });
});

// ---------------------------------------------------------------------------
// selectRepresentativeColumns
// ---------------------------------------------------------------------------

describe("selectRepresentativeColumns", () => {
  it("returns all columns when under budget", () => {
    const columns = [col("a", "STRING", 0), col("b", "INT", 1)];
    const result = selectRepresentativeColumns(columns, 10);
    expect(result.selected).toHaveLength(2);
    expect(result.omittedCount).toBe(0);
    expect(result.omittedHints).toEqual([]);
  });

  it("returns all columns when maxCount is 0 (no cap)", () => {
    const columns = [col("a"), col("b"), col("c")];
    const result = selectRepresentativeColumns(columns, 0);
    expect(result.selected).toHaveLength(3);
  });

  it("selects highest-scoring columns when over budget", () => {
    const columns = [
      col("random_col_1", "STRING", 0),
      col("random_col_2", "STRING", 1),
      col("id", "INT", 2),
      col("customer_id", "INT", 3),
      col("total_amount", "DECIMAL", 4),
      col("created_at", "TIMESTAMP", 5),
      col("is_active", "BOOLEAN", 6),
      col("random_col_3", "STRING", 7),
    ];

    const result = selectRepresentativeColumns(columns, 3);
    expect(result.selected).toHaveLength(3);
    expect(result.omittedCount).toBe(5);
    expect(result.omittedHints.length).toBeGreaterThan(0);
    expect(result.omittedHints.length).toBeLessThanOrEqual(3);

    const selectedNames = result.selected.map((c) => c.columnName);
    expect(selectedNames).toContain("id");
    expect(selectedNames).toContain("customer_id");
    expect(selectedNames).toContain("total_amount");
  });

  it("provides up to 3 omitted hints", () => {
    const columns = Array.from({ length: 50 }, (_, i) => col(`col_${i}`, "STRING", i));
    const result = selectRepresentativeColumns(columns, 5);
    expect(result.omittedCount).toBe(45);
    expect(result.omittedHints.length).toBeLessThanOrEqual(3);
  });

  it("handles a 1200-column table with large schema budget", () => {
    const budget = resolveColumnBudget(true);
    const columns: ColumnInfo[] = [
      col("id", "INT", 0),
      col("customer_id", "INT", 1),
      col("order_date", "DATE", 2),
      col("total_amount", "DECIMAL", 3),
      col("is_active", "BOOLEAN", 4),
      col("status_code", "STRING", 5),
      ...Array.from({ length: 1194 }, (_, i) => col(`data_field_${i}`, "STRING", i + 6)),
    ];

    const result = selectRepresentativeColumns(columns, budget.maxColumnsPerTable);
    expect(result.selected).toHaveLength(15);
    expect(result.omittedCount).toBe(1185);

    const selectedNames = result.selected.map((c) => c.columnName);
    expect(selectedNames).toContain("id");
    expect(selectedNames).toContain("customer_id");
    expect(selectedNames).toContain("total_amount");
    expect(selectedNames).toContain("is_active");
  });

  it("stable sorts by ordinal position when scores are equal", () => {
    const columns = [
      col("zzz", "STRING", 0),
      col("aaa", "STRING", 1),
      col("mmm", "STRING", 2),
    ];
    const result = selectRepresentativeColumns(columns, 3);
    expect(result.selected.map((c) => c.columnName)).toEqual(["zzz", "aaa", "mmm"]);
  });

  it("respects prior LLM enrichments in scoring", () => {
    const enriched = new Map<string, EnrichedColumn>([
      [
        "nps_quartile",
        {
          name: "nps_quartile",
          dataType: "INT",
          ordinalPosition: 5,
          isNullable: true,
          comment: null,
          inferredRole: "measure",
          inferredFkTarget: null,
        },
      ],
    ]);

    const columns = [
      col("random1", "STRING", 0),
      col("random2", "STRING", 1),
      col("random3", "STRING", 2),
      col("random4", "STRING", 3),
      col("random5", "STRING", 4),
      col("nps_quartile", "INT", 5),
    ];

    const result = selectRepresentativeColumns(columns, 1, { enrichedColumns: enriched });
    expect(result.selected[0].columnName).toBe("nps_quartile");
  });
});

// ---------------------------------------------------------------------------
// buildCompactColumnLine
// ---------------------------------------------------------------------------

describe("buildCompactColumnLine", () => {
  it("formats name(type)", () => {
    expect(buildCompactColumnLine({ columnName: "total_amount", dataType: "DECIMAL" })).toBe(
      "total_amount(DECIMAL)",
    );
  });

  it("handles complex type names", () => {
    expect(buildCompactColumnLine({ columnName: "tags", dataType: "ARRAY<STRING>" })).toBe(
      "tags(ARRAY<STRING>)",
    );
  });
});
