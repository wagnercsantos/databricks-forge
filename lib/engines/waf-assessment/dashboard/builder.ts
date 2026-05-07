/**
 * Lakeview (`.lvdash.json`) builder for the WAF Assessment dashboard.
 *
 * Produces a serialized dashboard with two pages:
 *   1. WAF Assessment       KPIs, per-pillar score bar, failing controls table
 *   2. Compute Utilization  CPU + memory time-series and KPIs (30 / 60 days)
 *
 * Datasets are SQL strings built by `./datasets.ts`. Lakeview executes them
 * directly against the warehouse, so this dashboard works without
 * materialising any cache table.
 */
import crypto from "crypto";
import { PILLAR_LABEL, WAF_PILLARS_WITH_QUERIES } from "../types";
import {
  buildNodeTimelineDailySql,
  buildNodeTimelineSummarySql,
  buildOverallScoreSql,
  buildPillarScoresSql,
  buildUnifiedControlsSql,
  buildWarehouseDailySpendSql,
  buildWarehouseOverviewSql,
  buildWarehouseQueryVolumeSql,
  buildWarehouseSummarySql,
} from "./datasets";

export const WAF_DASHBOARD_DISPLAY_NAME = "Forge WAF Assessment";

function newId(): string {
  return crypto.randomBytes(4).toString("hex");
}

interface Dataset {
  name: string;
  displayName: string;
  queryLines: string[];
}

interface Widget {
  widget: Record<string, unknown>;
  position: { x: number; y: number; width: number; height: number };
}

interface Page {
  name: string;
  displayName: string;
  layout: Widget[];
}

interface LakeviewDashboard {
  datasets: Dataset[];
  pages: Page[];
  uiSettings?: Record<string, unknown>;
}

function makeDataset(displayName: string, sql: string): Dataset {
  return {
    name: newId(),
    displayName,
    queryLines: sql.split("\n").map((line, i, arr) => (i === arr.length - 1 ? line : line + "\n")),
  };
}

function textBlock(lines: string[], pos: Widget["position"]): Widget {
  return {
    widget: {
      name: newId(),
      multilineTextboxSpec: { lines: lines.map((l) => l + "\n") },
    },
    position: pos,
  };
}

function counterWidget(opts: {
  datasetName: string;
  fieldName: string;
  title: string;
  format?: "number" | "percent";
  pos: Widget["position"];
}): Widget {
  const display = opts.format === "percent" ? "percentage-stacked" : "number-plain";
  return {
    widget: {
      name: newId(),
      queries: [
        {
          name: "main_query",
          query: {
            datasetName: opts.datasetName,
            fields: [{ name: opts.fieldName, expression: "`" + opts.fieldName + "`" }],
            disaggregated: true,
          },
        },
      ],
      spec: {
        version: 2,
        widgetType: "counter",
        encodings: {
          value: {
            fieldName: opts.fieldName,
            displayName: opts.title,
            ...(opts.format === "percent"
              ? { format: { type: "number-percent", decimalPlaces: { type: "max", places: 1 } } }
              : {}),
          },
        },
        frame: {
          showTitle: true,
          title: opts.title,
          showDescription: false,
        },
        // counter widget honours `display` only loosely; titling is enough
        ...(display ? {} : {}),
      },
    },
    position: opts.pos,
  };
}

function barWidget(opts: {
  datasetName: string;
  xField: string;
  xType: "categorical" | "temporal";
  yField: string;
  yExpr: string;
  title: string;
  pos: Widget["position"];
}): Widget {
  return {
    widget: {
      name: newId(),
      queries: [
        {
          name: "main_query",
          query: {
            datasetName: opts.datasetName,
            fields: [
              { name: opts.xField, expression: "`" + opts.xField + "`" },
              { name: opts.yField, expression: opts.yExpr },
            ],
            disaggregated: false,
          },
        },
      ],
      spec: {
        version: 3,
        widgetType: "bar",
        encodings: {
          x: {
            fieldName: opts.xField,
            scale: { type: opts.xType },
            axis: { hideTitle: true },
            displayName: opts.xField,
          },
          y: {
            fieldName: opts.yField,
            scale: { type: "quantitative" },
            axis: { title: opts.yField },
            displayName: opts.yField,
          },
        },
        frame: { showTitle: true, title: opts.title, showDescription: false },
        mark: { layout: "stack" },
      },
    },
    position: opts.pos,
  };
}

function lineWidget(opts: {
  datasetName: string;
  xField: string;
  yField: string;
  yExpr: string;
  colorField?: string;
  title: string;
  pos: Widget["position"];
}): Widget {
  return {
    widget: {
      name: newId(),
      queries: [
        {
          name: "main_query",
          query: {
            datasetName: opts.datasetName,
            fields: [
              { name: opts.xField, expression: "`" + opts.xField + "`" },
              { name: opts.yField, expression: opts.yExpr },
              ...(opts.colorField
                ? [{ name: opts.colorField, expression: "`" + opts.colorField + "`" }]
                : []),
            ],
            disaggregated: false,
          },
        },
      ],
      spec: {
        version: 3,
        widgetType: "line",
        encodings: {
          x: {
            fieldName: opts.xField,
            scale: { type: "temporal" },
            axis: { hideTitle: true },
            displayName: opts.xField,
          },
          y: {
            fieldName: opts.yField,
            scale: { type: "quantitative" },
            axis: { title: opts.yField },
            displayName: opts.yField,
          },
          ...(opts.colorField
            ? {
                color: {
                  fieldName: opts.colorField,
                  scale: { type: "categorical" },
                  displayName: opts.colorField,
                },
              }
            : {}),
        },
        frame: { showTitle: true, title: opts.title, showDescription: false },
        mark: { layout: "overlay" },
      },
    },
    position: opts.pos,
  };
}

function tableWidget(opts: {
  datasetName: string;
  fields: Array<{ name: string; title?: string }>;
  title: string;
  pos: Widget["position"];
}): Widget {
  return {
    widget: {
      name: newId(),
      queries: [
        {
          name: "main_query",
          query: {
            datasetName: opts.datasetName,
            fields: opts.fields.map((f) => ({ name: f.name, expression: "`" + f.name + "`" })),
            disaggregated: true,
          },
        },
      ],
      spec: {
        version: 1,
        widgetType: "table",
        encodings: {
          columns: opts.fields.map((f) => ({
            fieldName: f.name,
            displayName: f.title ?? f.name,
            type: "string",
          })),
        },
        frame: { showTitle: true, title: opts.title, showDescription: false },
      },
    },
    position: opts.pos,
  };
}

// ---------------------------------------------------------------------------
// Page 1: WAF Assessment
// ---------------------------------------------------------------------------

async function buildAssessmentPage(): Promise<{ datasets: Dataset[]; page: Page }> {
  const overallSql = await buildOverallScoreSql();
  const pillarSql = await buildPillarScoresSql();
  const controlsSql = await buildUnifiedControlsSql();

  const overallDs = makeDataset("waf_overall_score", overallSql);
  const pillarDs = makeDataset("waf_pillar_scores", pillarSql);
  const controlsDs = makeDataset("waf_controls", controlsSql);

  const layout: Widget[] = [
    textBlock(
      [
        "## Forge WAF Assessment",
        "",
        "Auto-generated from your Databricks system tables (`system.lakeflow.*`, `system.access.audit`, `system.compute.*`, `system.information_schema.*`). One row per Well-Architected control across the 7 pillars. Score-weighted column is a placeholder for future per-control weighting.",
      ],
      { x: 0, y: 0, width: 6, height: 2 },
    ),
    counterWidget({
      datasetName: overallDs.name,
      fieldName: "overall_score",
      title: "Overall WAF score",
      pos: { x: 0, y: 2, width: 2, height: 3 },
    }),
    counterWidget({
      datasetName: overallDs.name,
      fieldName: "met_controls",
      title: "Controls met",
      pos: { x: 2, y: 2, width: 2, height: 3 },
    }),
    counterWidget({
      datasetName: overallDs.name,
      fieldName: "total_controls",
      title: "Total controls",
      pos: { x: 4, y: 2, width: 2, height: 3 },
    }),
    barWidget({
      datasetName: pillarDs.name,
      xField: "pillar",
      xType: "categorical",
      yField: "avg_score",
      yExpr: "`avg_score`",
      title: "Average score by pillar",
      pos: { x: 0, y: 5, width: 6, height: 6 },
    }),
    tableWidget({
      datasetName: controlsDs.name,
      fields: [
        { name: "pillar", title: "Pillar" },
        { name: "waf_id", title: "WAF ID" },
        { name: "principle", title: "Principle" },
        { name: "description", title: "Description" },
        { name: "score_percentage", title: "Score (%)" },
        { name: "threshold_percentage", title: "Threshold (%)" },
        { name: "threshold_met", title: "Status" },
      ],
      title: "All controls",
      pos: { x: 0, y: 11, width: 6, height: 10 },
    }),
  ];

  return {
    datasets: [overallDs, pillarDs, controlsDs],
    page: { name: newId(), displayName: "WAF Assessment", layout },
  };
}

// ---------------------------------------------------------------------------
// Page 2: Compute Utilization (CPU / memory, 30 + 60 days)
// ---------------------------------------------------------------------------

function buildComputeUtilizationPage(): { datasets: Dataset[]; page: Page } {
  const daily30 = makeDataset("waf_node_timeline_30d", buildNodeTimelineDailySql(30));
  const daily60 = makeDataset("waf_node_timeline_60d", buildNodeTimelineDailySql(60));
  const summary30 = makeDataset("waf_node_timeline_summary_30d", buildNodeTimelineSummarySql(30));
  const summary60 = makeDataset("waf_node_timeline_summary_60d", buildNodeTimelineSummarySql(60));

  const layout: Widget[] = [
    textBlock(
      [
        "## Compute Utilization (last 30 / 60 days)",
        "",
        "Average CPU + memory usage across cluster nodes from `system.compute.node_timeline`. Driver and workers are reported separately. Use this page to identify under-utilised compute or chronic memory pressure.",
      ],
      { x: 0, y: 0, width: 6, height: 2 },
    ),
    counterWidget({
      datasetName: summary30.name,
      fieldName: "workers_avg_cpu_pct",
      title: "Workers avg CPU % (30d)",
      pos: { x: 0, y: 2, width: 3, height: 3 },
    }),
    counterWidget({
      datasetName: summary30.name,
      fieldName: "workers_avg_mem_pct",
      title: "Workers avg memory % (30d)",
      pos: { x: 3, y: 2, width: 3, height: 3 },
    }),
    counterWidget({
      datasetName: summary60.name,
      fieldName: "workers_avg_cpu_pct",
      title: "Workers avg CPU % (60d)",
      pos: { x: 0, y: 5, width: 3, height: 3 },
    }),
    counterWidget({
      datasetName: summary60.name,
      fieldName: "workers_avg_mem_pct",
      title: "Workers avg memory % (60d)",
      pos: { x: 3, y: 5, width: 3, height: 3 },
    }),
    lineWidget({
      datasetName: daily30.name,
      xField: "day",
      yField: "avg_cpu_pct",
      yExpr: "`avg_cpu_pct`",
      colorField: "node_role",
      title: "Daily avg CPU % (30 days)",
      pos: { x: 0, y: 8, width: 3, height: 6 },
    }),
    lineWidget({
      datasetName: daily30.name,
      xField: "day",
      yField: "avg_mem_pct",
      yExpr: "`avg_mem_pct`",
      colorField: "node_role",
      title: "Daily avg memory % (30 days)",
      pos: { x: 3, y: 8, width: 3, height: 6 },
    }),
    lineWidget({
      datasetName: daily60.name,
      xField: "day",
      yField: "avg_cpu_pct",
      yExpr: "`avg_cpu_pct`",
      colorField: "node_role",
      title: "Daily avg CPU % (60 days)",
      pos: { x: 0, y: 14, width: 3, height: 6 },
    }),
    lineWidget({
      datasetName: daily60.name,
      xField: "day",
      yField: "avg_mem_pct",
      yExpr: "`avg_mem_pct`",
      colorField: "node_role",
      title: "Daily avg memory % (60 days)",
      pos: { x: 3, y: 14, width: 3, height: 6 },
    }),
  ];

  return {
    datasets: [summary30, summary60, daily30, daily60],
    page: { name: newId(), displayName: "Compute Utilization", layout },
  };
}

// ---------------------------------------------------------------------------
// Page 3: Warehouse Utilization (DBU + $ from system.billing.usage)
// ---------------------------------------------------------------------------

function buildWarehousePage(): { datasets: Dataset[]; page: Page } {
  const summary30 = makeDataset("waf_wh_summary_30d", buildWarehouseSummarySql(30));
  const summary60 = makeDataset("waf_wh_summary_60d", buildWarehouseSummarySql(60));
  const overview30 = makeDataset("waf_wh_overview_30d", buildWarehouseOverviewSql(30));
  const dailySpend30 = makeDataset("waf_wh_daily_spend_30d", buildWarehouseDailySpendSql(30));
  const queryVol30 = makeDataset("waf_wh_query_volume_30d", buildWarehouseQueryVolumeSql(30));

  const layout: Widget[] = [
    textBlock(
      [
        "## SQL Warehouse Utilization (last 30 / 60 days)",
        "",
        "Per-warehouse consumption in DBUs and list $ from `system.billing.usage` joined with `system.billing.list_prices` (filter: `billing_origin_product = 'SQL'`). Query volume comes from `system.query.history`. List cost ignores discounts and committed-spend pricing.",
      ],
      { x: 0, y: 0, width: 6, height: 2 },
    ),
    counterWidget({
      datasetName: summary30.name,
      fieldName: "active_warehouses",
      title: "Active warehouses (30d)",
      pos: { x: 0, y: 2, width: 2, height: 3 },
    }),
    counterWidget({
      datasetName: summary30.name,
      fieldName: "total_dbus",
      title: "DBUs (30d)",
      pos: { x: 2, y: 2, width: 2, height: 3 },
    }),
    counterWidget({
      datasetName: summary30.name,
      fieldName: "total_list_cost_usd",
      title: "List $ (30d)",
      pos: { x: 4, y: 2, width: 2, height: 3 },
    }),
    counterWidget({
      datasetName: summary60.name,
      fieldName: "total_dbus",
      title: "DBUs (60d)",
      pos: { x: 0, y: 5, width: 3, height: 3 },
    }),
    counterWidget({
      datasetName: summary60.name,
      fieldName: "total_list_cost_usd",
      title: "List $ (60d)",
      pos: { x: 3, y: 5, width: 3, height: 3 },
    }),
    lineWidget({
      datasetName: dailySpend30.name,
      xField: "day",
      yField: "list_cost_usd",
      yExpr: "`list_cost_usd`",
      colorField: "warehouse_type",
      title: "Daily list $ by warehouse type (30 days)",
      pos: { x: 0, y: 8, width: 6, height: 6 },
    }),
    barWidget({
      datasetName: overview30.name,
      xField: "warehouse_name",
      xType: "categorical",
      yField: "list_cost_usd",
      yExpr: "`list_cost_usd`",
      title: "Top warehouses by list $ (30 days)",
      pos: { x: 0, y: 14, width: 6, height: 6 },
    }),
    tableWidget({
      datasetName: overview30.name,
      fields: [
        { name: "warehouse_name", title: "Warehouse" },
        { name: "warehouse_type", title: "Type" },
        { name: "warehouse_size", title: "Size" },
        { name: "channel", title: "Channel" },
        { name: "auto_stop_minutes", title: "Auto-stop (min)" },
        { name: "lifecycle", title: "Lifecycle" },
        { name: "dbus", title: "DBUs (30d)" },
        { name: "list_cost_usd", title: "List $ (30d)" },
      ],
      title: "Warehouse overview",
      pos: { x: 0, y: 20, width: 6, height: 8 },
    }),
    tableWidget({
      datasetName: queryVol30.name,
      fields: [
        { name: "warehouse_name", title: "Warehouse" },
        { name: "query_count", title: "Queries (30d)" },
        { name: "avg_duration_ms", title: "Avg duration (ms)" },
        { name: "total_read_gb", title: "Read (GB)" },
      ],
      title: "Query throughput per warehouse (30 days)",
      pos: { x: 0, y: 28, width: 6, height: 8 },
    }),
  ];

  return {
    datasets: [summary30, summary60, overview30, dailySpend30, queryVol30],
    page: { name: newId(), displayName: "Warehouse Utilization", layout },
  };
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

/**
 * Build the full Lakeview dashboard JSON. Returns a `serialized_dashboard`
 * string ready to be passed to the Lakeview create/update API.
 */
export async function buildWafDashboardJson(): Promise<string> {
  const assessment = await buildAssessmentPage();
  const compute = buildComputeUtilizationPage();
  const warehouse = buildWarehousePage();

  const dashboard: LakeviewDashboard = {
    datasets: [...assessment.datasets, ...compute.datasets, ...warehouse.datasets],
    pages: [assessment.page, compute.page, warehouse.page],
  };

  return JSON.stringify(dashboard);
}

/** Pillar IDs used for documentation / labels (re-exported for convenience). */
export { PILLAR_LABEL, WAF_PILLARS_WITH_QUERIES };
