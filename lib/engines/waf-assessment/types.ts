/**
 * WAF (Well-Architected Framework) Assessment — types.
 *
 * The assessment engine evaluates a Databricks workspace against the
 * Databricks WAF using deterministic SQL queries over `system.*` tables.
 * Each pillar has a single SQL query that returns a row per control.
 */

export type WafPillar =
  | "governance"
  | "reliability"
  | "cost_optimisation"
  | "performance_efficiency";

export const WAF_PILLARS: readonly WafPillar[] = [
  "governance",
  "reliability",
  "cost_optimisation",
  "performance_efficiency",
] as const;

export const PILLAR_LABEL: Record<WafPillar, string> = {
  governance: "Governance",
  reliability: "Reliability",
  cost_optimisation: "Cost Optimisation",
  performance_efficiency: "Performance Efficiency",
};

/** Catalog entry — the curated description and recommendation for a control. */
export interface WafControl {
  wafId: string;
  pillar: WafPillar;
  pillarName: string;
  principle: string;
  bestPractice: string;
  capabilities: string | null;
  details: string | null;
  thresholdPercentage: number;
  metricDefinition: string | null;
  recommendationIfNotMet: string | null;
  fixActionEngine: string | null;
  fixActionParamsJson: string | null;
}

/** Per-control evaluation produced by running a pillar query. */
export interface WafControlResult {
  wafId: string;
  pillar: WafPillar;
  scorePercentage: number;
  thresholdPercentage: number;
  thresholdMet: boolean;
}

/** Assessment summary returned by the API. */
export interface WafAssessmentSummary {
  assessmentId: string;
  status: "pending" | "running" | "completed" | "failed";
  scope: string | null;
  triggeredBy: string | null;
  governanceScore: number | null;
  reliabilityScore: number | null;
  costScore: number | null;
  performanceScore: number | null;
  overallScore: number | null;
  totalControls: number;
  metControls: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Full assessment with per-control results joined to the catalog. */
export interface WafAssessmentDetail extends WafAssessmentSummary {
  results: Array<WafControlResult & { control: WafControl }>;
}
