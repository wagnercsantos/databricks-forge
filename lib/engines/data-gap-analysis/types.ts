/**
 * Data Gap Analysis -- types.
 *
 * The Data Gap engine evaluates a catalog scope (a scan or a pipeline run)
 * against the industry's Reference Data Assets from the Master Repository.
 * It produces a coverage matrix at the data-asset level (not at the use-case
 * level like `industry-coverage.ts`), surfaces the recommended ingestion path
 * for every missing asset, and quantifies the economic value-at-risk from
 * missing Mission-Critical assets.
 */

import type { ReferenceDataAsset, MasterRepoUseCase } from "@/lib/domain/industry-outcomes/master-repo-types";
import type { EconomicImpactCategory } from "@/lib/domain/economic-patterns";

export type IngestionStrategy =
  | "lakeflow_connect"
  | "uc_federation"
  | "lakebridge_migrate"
  | "bespoke";

export interface IngestionRecommendation {
  strategy: IngestionStrategy;
  /** "High" or "Low" rating sourced from the master repo. */
  rating: "High" | "Low";
  /** Plain-text reasoning surfaced to the UI. */
  rationale?: string;
}

/**
 * Per-Reference-Data-Asset coverage view. `present === true` means at least
 * one catalog table in the scope was classified onto this asset id.
 */
export interface AssetCoverage {
  assetId: string;
  assetName: string;
  assetFamily: string;
  systemLocation: string;
  systemKind?: string;
  present: boolean;
  /**
   * FQN list of catalog tables mapped to this asset. Empty when `present`
   * is false (a true gap) and non-empty when present.
   */
  matchedTables: string[];
  /** Count of master-repo use cases that need this asset as Mission-Critical. */
  mcUseCaseCount: number;
  /** Count of master-repo use cases that need this asset as Value-Add. */
  vaUseCaseCount: number;
  /** Names of MC use cases (truncated to 10 for readability). */
  mcUseCaseNames: string[];
  /**
   * Ranked list of ingestion strategies for this asset. First entry is
   * always the recommended path; populated even when `present` is true so
   * the UI can offer documentation links for the existing connection.
   */
  recommendations: IngestionRecommendation[];
}

/**
 * Per-missing-asset economic value-at-risk: total annualized benefit of the
 * MC use cases blocked by the missing asset, aggregated by impact category.
 */
export interface AssetValueAtRisk {
  assetId: string;
  assetName: string;
  /** Use case names whose MC requirements are not met. */
  blockedUseCases: string[];
  /** Use case names whose VA requirements are not met (soft risk). */
  reducedUseCases: string[];
  /** Aggregate annualized $ value at risk, by impact category. */
  byImpactCategory: Partial<Record<EconomicImpactCategory, { low: number; mid: number; high: number }>>;
  totalLow: number;
  totalMid: number;
  totalHigh: number;
}

export interface DataGapSummary {
  industryId: string;
  industryName: string;
  /** Number of Reference Data Assets defined for this industry. */
  totalAssets: number;
  /** Assets where the catalog has at least one matching table. */
  presentAssets: number;
  /** Assets with zero catalog matches. */
  missingAssets: number;
  /** Sum of MC requirements satisfied across all use cases. */
  mcCovered: number;
  /** Sum of MC requirements not satisfied. */
  mcMissing: number;
  vaCovered: number;
  vaMissing: number;
  /**
   * Overall coverage percentage (mcCovered / (mcCovered + mcMissing)). MC
   * gaps weigh more than VA gaps, hence the asymmetric formula. Returns 0
   * when there are no MC requirements.
   */
  mcCoveragePct: number;
  /** Total economic value-at-risk, summed across all blocked use cases. */
  valueAtRiskLow: number;
  valueAtRiskMid: number;
  valueAtRiskHigh: number;
}

export interface DataGapResult {
  industryId: string;
  industryName: string;
  generatedAt: string;
  summary: DataGapSummary;
  coverage: AssetCoverage[];
  valueAtRisk: AssetValueAtRisk[];
}

export interface DataGapInput {
  industryId: string;
  /**
   * Tables observed in the scope, with their classifier output. `null`
   * dataAssetId means the table was scanned but did not map to any industry
   * reference asset -- excluded from coverage but counted in scope size.
   */
  classifiedTables: Array<{ fqn: string; dataAssetId: string | null }>;
  /**
   * Optional dollar-value estimates per use case from the Business Value
   * engine. When provided, the engine computes economic value-at-risk per
   * missing asset by aggregating estimates of the use cases that asset
   * blocks. When omitted, the engine falls back to count-based ranking only.
   */
  useCaseValueEstimates?: Array<{
    useCaseId: string;
    name: string;
    valueLow: number;
    valueMid: number;
    valueHigh: number;
    economicImpactCategory: EconomicImpactCategory | null;
  }>;
}

/**
 * Helper type used internally when building the engine output.
 */
export interface AssetDescriptor {
  asset: ReferenceDataAsset;
  /** Use cases that need this asset (MC or VA). */
  useCases: Array<{ uc: MasterRepoUseCase; criticality: "MC" | "VA" }>;
}
