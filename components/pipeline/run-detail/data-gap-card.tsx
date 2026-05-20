"use client";

/**
 * Data Gap Card -- Master Repository v2 data-asset coverage view.
 *
 * Renders the output of `/api/runs/[runId]/data-gap` (DataGapResult):
 *   - Coverage ring + MC/VA tallies + economic value-at-risk
 *   - Per-asset coverage table with ingestion recommendation
 *   - Top blocked-asset value-at-risk breakdown
 *
 * Sits beside the existing OutcomeMap (use-case-level) coverage card so the
 * two views are visible side by side.
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  DollarSign,
  Layers,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import type {
  AssetCoverage,
  AssetValueAtRisk,
  DataGapResult,
} from "@/lib/engines/data-gap-analysis/types";

function fmtUsd(n: number): string {
  if (!n) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const STRATEGY_LABEL: Record<string, string> = {
  lakeflow_connect: "Lakeflow Connect",
  uc_federation: "UC Federation",
  lakebridge_migrate: "Lakebridge Migrate",
  bespoke: "Bespoke",
};

export function DataGapCard({ runId }: { runId: string }) {
  const [result, setResult] = useState<DataGapResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setError(null);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/data-gap`, {
        method: force ? "POST" : "GET",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Request failed (${res.status})`);
        setResult(null);
      } else {
        const body = (await res.json()) as { result: DataGapResult };
        setResult(body.result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-violet-500" /> Data Asset Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Computing data gap analysis...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-violet-500" /> Data Asset Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error ?? "No data gap analysis available."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-violet-500" /> Data Asset Coverage --{" "}
            {result.industryName}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <SummaryStrip result={result} />
        <CoverageMatrix coverage={result.coverage} />
        {result.valueAtRisk.length > 0 && <ValueAtRiskTable rows={result.valueAtRisk} />}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Summary strip
// ---------------------------------------------------------------------------

function SummaryStrip({ result }: { result: DataGapResult }) {
  const { summary } = result;
  const mcPct = Math.round(summary.mcCoveragePct * 100);
  const colorClass =
    mcPct >= 75
      ? "text-green-600 dark:text-green-400"
      : mcPct >= 50
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Tile
        icon={<ShieldAlert className="h-4 w-4 text-violet-500" />}
        label="MC Coverage"
        value={`${mcPct}%`}
        valueClass={colorClass}
        sub={`${summary.mcCovered} / ${summary.mcCovered + summary.mcMissing} MC requirements met`}
      />
      <Tile
        icon={<Database className="h-4 w-4 text-blue-500" />}
        label="Assets Present"
        value={`${summary.presentAssets} / ${summary.totalAssets}`}
        sub={`${summary.missingAssets} missing`}
      />
      <Tile
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        label="VA Coverage"
        value={`${summary.vaCovered} / ${summary.vaCovered + summary.vaMissing}`}
        sub="Value-Add data assets"
      />
      <Tile
        icon={<DollarSign className="h-4 w-4 text-amber-500" />}
        label="Value at Risk (annual)"
        value={fmtUsd(summary.valueAtRiskMid)}
        sub={
          summary.valueAtRiskMid > 0
            ? `${fmtUsd(summary.valueAtRiskLow)} -- ${fmtUsd(summary.valueAtRiskHigh)}`
            : "Run Business Value first"
        }
      />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-lg font-semibold ${valueClass ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage matrix
// ---------------------------------------------------------------------------

function CoverageMatrix({ coverage }: { coverage: AssetCoverage[] }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => coverage.slice(), [coverage]);
  const visible = showAll ? sorted : sorted.slice(0, 12);
  const missing = coverage.filter((c) => !c.present);
  const presentRatio = coverage.length
    ? (coverage.length - missing.length) / coverage.length
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Per-Asset Coverage</h3>
        <span className="text-xs text-muted-foreground">
          {coverage.length - missing.length} present, {missing.length} missing
        </span>
      </div>
      <Progress value={presentRatio * 100} className="h-1.5" />
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Asset</th>
              <th className="px-3 py-2 text-left">Family</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">MC UCs</th>
              <th className="px-3 py-2 text-left">Recommended Path</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.assetId} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">
                    {c.assetId}: {c.assetName}
                  </div>
                  {c.systemLocation && (
                    <div className="text-xs text-muted-foreground">{c.systemLocation}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{c.assetFamily}</td>
                <td className="px-3 py-2">
                  {c.present ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Present ({c.matchedTables.length})
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
                    >
                      <AlertTriangle className="h-3 w-3" /> Missing
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.mcUseCaseCount > 0 ? (
                    <span title={c.mcUseCaseNames.join("\n")}>{c.mcUseCaseCount}</span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.recommendations[0] && c.recommendations[0].rating === "High" ? (
                    <span className="font-medium">
                      {STRATEGY_LABEL[c.recommendations[0].strategy] ??
                        c.recommendations[0].strategy}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No high-confidence path</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {coverage.length > 12 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((v) => !v)}
          className="w-full justify-center"
        >
          {showAll ? "Show fewer" : `Show all ${coverage.length} assets`}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value-at-risk table
// ---------------------------------------------------------------------------

function ValueAtRiskTable({ rows }: { rows: AssetValueAtRisk[] }) {
  const top = rows.slice(0, 8);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Top Missing Assets by Value at Risk</h3>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Asset</th>
              <th className="px-3 py-2 text-left">Blocked UCs</th>
              <th className="px-3 py-2 text-right">Annual Value</th>
              <th className="px-3 py-2 text-left">Top Impact Category</th>
            </tr>
          </thead>
          <tbody>
            {top.map((row) => {
              const topCat = Object.entries(row.byImpactCategory).sort(
                (a, b) => (b[1]?.mid ?? 0) - (a[1]?.mid ?? 0),
              )[0];
              return (
                <tr key={row.assetId} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {row.assetId}: {row.assetName}
                    </div>
                    {row.reducedUseCases.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        + {row.reducedUseCases.length} reduced (VA only)
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.blockedUseCases.length > 0 ? (
                      <span title={row.blockedUseCases.join("\n")}>
                        {row.blockedUseCases.length}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {fmtUsd(row.totalMid)}
                    <div className="text-xs text-muted-foreground">
                      {fmtUsd(row.totalLow)} -- {fmtUsd(row.totalHigh)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {topCat ? (
                      <Badge variant="secondary">{topCat[0]}</Badge>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
