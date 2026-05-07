/**
 * SQL builders for the WAF Lakeview dashboard.
 *
 * The dashboard runs against a SQL warehouse (Lakeview cannot reach
 * Lakebase), so every dataset is a single SQL string over `system.*`.
 *
 * Two virtual tables drive the WAF page:
 *  - `dataset_controls`     UNION ALL of the 7 pillar SQL files, augmented
 *                           with `pillar` (waf id namespace) and
 *                           `score_weighted` (placeholder = score until
 *                           per-control weights are introduced).
 *  - `dataset_pillar_scores` aggregation of the above by pillar, used by
 *                           KPI counters.
 *
 * Two virtual tables drive the Compute Utilization page (last 30/60 days):
 *  - `dataset_node_timeline_daily`   per-day CPU / memory utilisation
 *  - `dataset_node_timeline_summary` single-row averages for KPI counters
 */
import { promises as fs } from "fs";
import path from "path";
import { WAF_PILLARS_WITH_QUERIES } from "../types";

type WafPillarWithQuery = (typeof WAF_PILLARS_WITH_QUERIES)[number];

const QUERY_DIR = path.join(process.cwd(), "lib/engines/waf-assessment/queries");

const QUERY_FILES: Record<WafPillarWithQuery, string> = {
  governance: "governance.sql",
  interoperability_usability: "interoperability-usability.sql",
  operational_excellence: "operational-excellence.sql",
  security_compliance_privacy: "security-compliance-privacy.sql",
  reliability: "reliability.sql",
  cost_optimisation: "cost-optimisation.sql",
  performance_efficiency: "performance-efficiency.sql",
};

const sqlCache = new Map<WafPillarWithQuery, string>();

async function loadPillarSql(pillar: WafPillarWithQuery): Promise<string> {
  const cached = sqlCache.get(pillar);
  if (cached) return cached;
  const raw = await fs.readFile(path.join(QUERY_DIR, QUERY_FILES[pillar]), "utf-8");
  sqlCache.set(pillar, raw);
  return raw;
}

function stripTrailingOrderBy(sql: string): string {
  let s = sql.trim();
  if (s.endsWith(";")) s = s.slice(0, -1);
  s = s.trim();

  // Pillar SQLs use `ROW_NUMBER() OVER (... ORDER BY ...)`, so we can't just
  // regex out the first `ORDER BY` we see. Walk lines from the end and strip
  // the last line that begins with `ORDER BY` at paren depth 0.
  const lines = s.split("\n");
  const depthAtLineStart: number[] = [];
  let depth = 0;
  for (const line of lines) {
    depthAtLineStart.push(depth);
    for (const ch of line) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (depthAtLineStart[i] === 0 && /^\s*ORDER\s+BY\b/i.test(lines[i])) {
      return lines.slice(0, i).join("\n").trim();
    }
  }
  return s;
}

/**
 * Wrap each pillar SQL as a sub-select. Spark SQL allows `(WITH ... SELECT ...)`
 * inside a derived table, so each pillar's CTEs stay isolated and we don't
 * need to rename them.
 */
async function wrapPillarAsSubquery(pillar: WafPillarWithQuery): Promise<string> {
  const inner = stripTrailingOrderBy(await loadPillarSql(pillar));
  return [
    `SELECT '${pillar}' AS pillar,`,
    `       waf_id,`,
    `       principle,`,
    `       description,`,
    `       score_percentage,`,
    `       threshold_percentage,`,
    `       threshold_met,`,
    `       CAST(score_percentage AS DOUBLE) AS score_weighted`,
    `FROM (`,
    inner,
    `)`,
  ].join("\n");
}

/**
 * Build the unified controls dataset. Returns 1 row per control across
 * every pillar with a deterministic SQL evaluator. Qualitative-only
 * controls are excluded (they live in Lakebase and aren't reachable from
 * the warehouse).
 */
export async function buildUnifiedControlsSql(): Promise<string> {
  const subqueries = await Promise.all(WAF_PILLARS_WITH_QUERIES.map(wrapPillarAsSubquery));
  return subqueries.join("\nUNION ALL\n") + "\nORDER BY pillar, waf_id";
}

/**
 * Pillar-level aggregation: AVG(score), counts of met / total controls.
 * Wraps the unified SQL in an outer SELECT.
 */
export async function buildPillarScoresSql(): Promise<string> {
  const unified = await buildUnifiedControlsSql();
  return [
    `WITH controls AS (`,
    unified.replace(/\nORDER BY[\s\S]*$/i, ""),
    `)`,
    `SELECT`,
    `  pillar,`,
    `  COUNT(*)                                              AS total_controls,`,
    `  SUM(CASE WHEN threshold_met = 'Met' THEN 1 ELSE 0 END) AS met_controls,`,
    `  ROUND(AVG(score_percentage), 1)                        AS avg_score,`,
    `  ROUND(AVG(score_weighted), 1)                          AS avg_score_weighted`,
    `FROM controls`,
    `GROUP BY pillar`,
    `ORDER BY pillar`,
  ].join("\n");
}

/**
 * Workspace-level overall score: AVG(score) across every control.
 * Single-row dataset, used for the KPI counter at the top of the page.
 */
export async function buildOverallScoreSql(): Promise<string> {
  const unified = await buildUnifiedControlsSql();
  return [
    `WITH controls AS (`,
    unified.replace(/\nORDER BY[\s\S]*$/i, ""),
    `)`,
    `SELECT`,
    `  ROUND(AVG(score_percentage), 1)                        AS overall_score,`,
    `  COUNT(*)                                               AS total_controls,`,
    `  SUM(CASE WHEN threshold_met = 'Met' THEN 1 ELSE 0 END) AS met_controls`,
    `FROM controls`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Compute Utilization page (system.compute.node_timeline)
// ---------------------------------------------------------------------------

/**
 * Daily CPU + memory averages over `system.compute.node_timeline`,
 * grouped by node role (driver / workers).
 *
 * @param days lookback window in days (typically 30 or 60).
 */
export function buildNodeTimelineDailySql(days: 30 | 60): string {
  return [
    `SELECT`,
    `  date_trunc('day', start_time)                                  AS day,`,
    `  CASE WHEN driver = TRUE THEN 'driver' ELSE 'workers' END        AS node_role,`,
    `  ROUND(AVG(cpu_user_percent + cpu_system_percent), 2)            AS avg_cpu_pct,`,
    `  ROUND(MAX(cpu_user_percent + cpu_system_percent), 2)            AS peak_cpu_pct,`,
    `  ROUND(AVG(mem_used_percent), 2)                                 AS avg_mem_pct,`,
    `  ROUND(MAX(mem_used_percent), 2)                                 AS peak_mem_pct`,
    `FROM system.compute.node_timeline`,
    `WHERE start_time >= CURRENT_DATE() - INTERVAL ${days} DAYS`,
    `GROUP BY 1, 2`,
    `ORDER BY 1, 2`,
  ].join("\n");
}

/**
 * Single-row summary for the KPI counters on the Compute Utilization page.
 * Reports avg / peak CPU / memory split by driver vs workers in the window.
 */
export function buildNodeTimelineSummarySql(days: 30 | 60): string {
  return [
    `SELECT`,
    `  ${days}                                                AS window_days,`,
    `  ROUND(AVG(CASE WHEN driver = FALSE THEN cpu_user_percent + cpu_system_percent END), 2)`,
    `    AS workers_avg_cpu_pct,`,
    `  ROUND(MAX(CASE WHEN driver = FALSE THEN cpu_user_percent + cpu_system_percent END), 2)`,
    `    AS workers_peak_cpu_pct,`,
    `  ROUND(AVG(CASE WHEN driver = FALSE THEN mem_used_percent END), 2)`,
    `    AS workers_avg_mem_pct,`,
    `  ROUND(MAX(CASE WHEN driver = FALSE THEN mem_used_percent END), 2)`,
    `    AS workers_peak_mem_pct,`,
    `  ROUND(AVG(CASE WHEN driver = TRUE THEN cpu_user_percent + cpu_system_percent END), 2)`,
    `    AS driver_avg_cpu_pct,`,
    `  ROUND(AVG(CASE WHEN driver = TRUE THEN mem_used_percent END), 2)`,
    `    AS driver_avg_mem_pct`,
    `FROM system.compute.node_timeline`,
    `WHERE start_time >= CURRENT_DATE() - INTERVAL ${days} DAYS`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Warehouse Utilization page (system.billing.usage + system.compute.warehouses)
//
// Consumption = DBUs × list_prices.pricing.default. We always join via
// `billing_origin_product = 'SQL' AND usage_metadata.warehouse_id IS NOT NULL`
// so we capture serverless + pro + classic without depending on SKU substrings.
// ---------------------------------------------------------------------------

/**
 * CTE shared by every warehouse dataset: priced DBU rows for the window,
 * plus the latest snapshot per warehouse. Returns the leading SQL block;
 * callers append a final SELECT.
 */
function warehouseCtes(days: 30 | 60): string {
  return [
    `WITH wh_usage AS (`,
    `  SELECT`,
    `    u.usage_date,`,
    `    u.usage_metadata.warehouse_id  AS warehouse_id,`,
    `    u.cloud,`,
    `    u.sku_name,`,
    `    u.usage_quantity,`,
    `    u.usage_start_time,`,
    `    u.usage_end_time`,
    `  FROM system.billing.usage u`,
    `  WHERE u.usage_date >= CURRENT_DATE() - INTERVAL ${days} DAYS`,
    `    AND u.billing_origin_product = 'SQL'`,
    `    AND u.usage_metadata.warehouse_id IS NOT NULL`,
    `),`,
    `wh_priced AS (`,
    `  SELECT`,
    `    u.usage_date,`,
    `    u.warehouse_id,`,
    `    u.usage_quantity                              AS dbus,`,
    `    u.usage_quantity * p.pricing.default          AS list_cost_usd`,
    `  FROM wh_usage u`,
    `  INNER JOIN system.billing.list_prices p`,
    `    ON  u.cloud = p.cloud`,
    `    AND u.sku_name = p.sku_name`,
    `    AND u.usage_start_time >= p.price_start_time`,
    `    AND (u.usage_end_time <= p.price_end_time OR p.price_end_time IS NULL)`,
    `),`,
    `wh_latest AS (`,
    `  SELECT warehouse_id, warehouse_name, warehouse_type, warehouse_channel,`,
    `         warehouse_size, auto_stop_minutes, min_num_clusters, max_num_clusters,`,
    `         delete_time`,
    `  FROM (`,
    `    SELECT *,`,
    `           ROW_NUMBER() OVER (PARTITION BY warehouse_id ORDER BY change_time DESC) AS rn`,
    `    FROM system.compute.warehouses`,
    `  )`,
    `  WHERE rn = 1`,
    `)`,
  ].join("\n");
}

/**
 * One row per warehouse: name, type/size, autostop, list spend + DBUs over
 * the window. Drives the warehouse overview table.
 */
export function buildWarehouseOverviewSql(days: 30 | 60): string {
  return [
    warehouseCtes(days),
    `SELECT`,
    `  COALESCE(w.warehouse_name, p.warehouse_id)              AS warehouse_name,`,
    `  COALESCE(w.warehouse_type, '?')                          AS warehouse_type,`,
    `  COALESCE(w.warehouse_size, '?')                          AS warehouse_size,`,
    `  COALESCE(w.warehouse_channel, '?')                       AS channel,`,
    `  w.auto_stop_minutes                                       AS auto_stop_minutes,`,
    `  CASE WHEN w.delete_time IS NULL THEN 'active' ELSE 'deleted' END AS lifecycle,`,
    `  ROUND(SUM(p.dbus), 2)                                     AS dbus,`,
    `  ROUND(SUM(p.list_cost_usd), 2)                            AS list_cost_usd`,
    `FROM wh_priced p`,
    `LEFT JOIN wh_latest w USING (warehouse_id)`,
    `GROUP BY ALL`,
    `ORDER BY list_cost_usd DESC NULLS LAST`,
  ].join("\n");
}

/**
 * Daily DBU + $ per warehouse_type, bucketed for the line chart.
 * Useful to spot ramp-ups by tier (PRO / CLASSIC).
 */
export function buildWarehouseDailySpendSql(days: 30 | 60): string {
  return [
    warehouseCtes(days),
    `SELECT`,
    `  p.usage_date                                             AS day,`,
    `  COALESCE(w.warehouse_type, 'UNKNOWN')                    AS warehouse_type,`,
    `  ROUND(SUM(p.dbus), 2)                                    AS dbus,`,
    `  ROUND(SUM(p.list_cost_usd), 2)                           AS list_cost_usd`,
    `FROM wh_priced p`,
    `LEFT JOIN wh_latest w USING (warehouse_id)`,
    `GROUP BY 1, 2`,
    `ORDER BY 1, 2`,
  ].join("\n");
}

/**
 * Single-row top-level KPIs for the Warehouse page.
 */
export function buildWarehouseSummarySql(days: 30 | 60): string {
  return [
    warehouseCtes(days),
    `SELECT`,
    `  ${days}                                                   AS window_days,`,
    `  COUNT(DISTINCT p.warehouse_id)                            AS active_warehouses,`,
    `  ROUND(SUM(p.dbus), 2)                                     AS total_dbus,`,
    `  ROUND(SUM(p.list_cost_usd), 2)                            AS total_list_cost_usd,`,
    `  ROUND(AVG(p.list_cost_usd), 4)                            AS avg_daily_cost_per_record`,
    `FROM wh_priced p`,
  ].join("\n");
}

/**
 * Query throughput per warehouse over the window: count, avg duration,
 * total bytes read. Driven by `system.query.history`.
 */
export function buildWarehouseQueryVolumeSql(days: 30 | 60): string {
  return [
    `WITH wh_latest AS (`,
    `  SELECT warehouse_id, warehouse_name`,
    `  FROM (`,
    `    SELECT *,`,
    `           ROW_NUMBER() OVER (PARTITION BY warehouse_id ORDER BY change_time DESC) AS rn`,
    `    FROM system.compute.warehouses`,
    `  )`,
    `  WHERE rn = 1`,
    `)`,
    `SELECT`,
    `  COALESCE(w.warehouse_name, q.warehouse_id)                AS warehouse_name,`,
    `  COUNT(*)                                                  AS query_count,`,
    `  ROUND(AVG(q.total_duration_ms), 0)                        AS avg_duration_ms,`,
    `  ROUND(SUM(q.read_bytes) / 1e9, 2)                         AS total_read_gb`,
    `FROM system.query.history q`,
    `LEFT JOIN wh_latest w USING (warehouse_id)`,
    `WHERE q.warehouse_id IS NOT NULL`,
    `  AND q.start_time >= CURRENT_DATE() - INTERVAL ${days} DAYS`,
    `GROUP BY 1`,
    `ORDER BY query_count DESC`,
  ].join("\n");
}
