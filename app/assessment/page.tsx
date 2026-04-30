"use client";

/**
 * WAF Assessment page.
 *
 * Customer-facing self-assessment against the Databricks Well-Architected
 * Framework. Runs deterministic SQL over `system.*` (OBO) and renders:
 *
 *   1. Per-pillar score cards (Governance / Reliability / Cost / Performance)
 *   2. Failing controls drill-down + per-pillar drill-downs
 *   3. "Fix with Forge" deep-link for controls mapped to a Forge engine
 *   4. CSV export for offline reporting
 *   5. History table with one-click compare against the latest run
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  Sparkles,
  Wrench,
} from "lucide-react";
import { PILLAR_LABEL } from "@/lib/engines/waf-assessment/types";
import type {
  WafAssessmentDetail,
  WafAssessmentSummary,
  WafPillar,
} from "@/lib/engines/waf-assessment/types";

interface ApiState {
  latest: WafAssessmentDetail | null;
  history: WafAssessmentSummary[];
}

const PILLAR_ORDER: WafPillar[] = [
  "governance",
  "reliability",
  "cost_optimisation",
  "performance_efficiency",
];

const SHORT_PILLAR_LABEL: Record<WafPillar, string> = {
  governance: "Governance",
  reliability: "Reliability",
  cost_optimisation: "Cost",
  performance_efficiency: "Performance",
};

function scoreToVariant(score: number | null | undefined): "default" | "secondary" | "destructive" {
  if (score == null) return "secondary";
  if (score >= 75) return "default";
  if (score >= 40) return "secondary";
  return "destructive";
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "—";
  if (score >= 75) return "Mature";
  if (score >= 50) return "Progressing";
  if (score >= 25) return "At Risk";
  return "Critical";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

type FixAction =
  | { kind: "engine"; href: string; label: string }
  | { kind: "docs"; href: string; label: string };

/** Allow only http(s) absolute URLs or root-relative paths — blocks `javascript:`, `data:`, etc. */
const SAFE_HREF_RE = /^(https?:\/\/|\/)/;

function safeDocHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return SAFE_HREF_RE.test(value) ? value : null;
}

function fixAction(engine: string | null, paramsJson: string | null): FixAction | null {
  if (!engine) return null;
  let params: Record<string, unknown> = {};
  if (paramsJson) {
    try {
      params = JSON.parse(paramsJson);
    } catch {
      params = {};
    }
  }
  switch (engine) {
    case "comment-engine":
      return { kind: "engine", href: "/environment/comments", label: "Fix with Forge" };
    case "estate-scan":
      return { kind: "engine", href: "/environment", label: "Open Estate" };
    case "tag-engine":
      return { kind: "engine", href: "/environment?tab=governance", label: "Fix with Forge" };
    case "docs":
    default: {
      const href = safeDocHref(params.href);
      return href ? { kind: "docs", href, label: "Open docs" } : null;
    }
  }
}

function pillarScoreFor(s: WafAssessmentSummary | null, p: WafPillar): number | null {
  if (!s) return null;
  if (p === "governance") return s.governanceScore;
  if (p === "reliability") return s.reliabilityScore;
  if (p === "cost_optimisation") return s.costScore;
  if (p === "performance_efficiency") return s.performanceScore;
  return null;
}

/** Build a CSV string + trigger a download. Client-side only. */
function downloadCsv(latest: WafAssessmentDetail): void {
  const headers = [
    "waf_id",
    "pillar",
    "principle",
    "best_practice",
    "score_percentage",
    "threshold_percentage",
    "met",
    "recommendation",
  ];
  // Cells starting with these characters are interpreted as formulas by
  // Excel/Sheets/Numbers — prefix with a single quote to neutralise.
  const FORMULA_LEAD = /^[=+\-@\t\r]/;
  const escape = (raw: string) => {
    const s = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = latest.results.map((r) =>
    [
      r.wafId,
      PILLAR_LABEL[r.pillar],
      r.control.principle,
      r.control.bestPractice,
      r.scorePercentage.toFixed(1),
      r.thresholdPercentage.toFixed(0),
      r.thresholdMet ? "yes" : "no",
      r.control.recommendationIfNotMet ?? "",
    ]
      .map((v) => escape(String(v)))
      .join(","),
  );
  const csv = [headers.map(escape).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = (latest.completedAt ?? latest.createdAt).slice(0, 10);
  a.href = url;
  a.download = `waf-assessment-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AssessmentPage() {
  const [data, setData] = useState<ApiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/assessment", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load assessment (${res.status})`);
      const json = (await res.json()) as ApiState;
      setData(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load assessment";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAssessment = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/assessment/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Run failed (${res.status})`);
      }
      const summary = (await res.json()) as WafAssessmentSummary;
      if (summary.status === "failed") {
        toast.error(summary.errorMessage ?? "Assessment failed");
      } else {
        toast.success("Assessment completed");
      }
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start assessment";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [refresh]);

  const latest = data?.latest ?? null;

  const notMet = useMemo(() => {
    if (!latest) return [];
    return latest.results
      .filter((r) => !r.thresholdMet)
      .sort((a, b) => a.scorePercentage - b.scorePercentage);
  }, [latest]);

  const byPillar = useMemo(() => {
    const map: Record<WafPillar, WafAssessmentDetail["results"]> = {
      governance: [],
      reliability: [],
      cost_optimisation: [],
      performance_efficiency: [],
    };
    if (!latest) return map;
    for (const r of latest.results) {
      map[r.pillar].push(r);
    }
    for (const p of PILLAR_ORDER) {
      map[p].sort((a, b) => {
        if (a.thresholdMet !== b.thresholdMet) return a.thresholdMet ? 1 : -1;
        return a.scorePercentage - b.scorePercentage;
      });
    }
    return map;
  }, [latest]);

  const pillarStats = useMemo(() => {
    const stats: Record<WafPillar, { met: number; total: number }> = {
      governance: { met: 0, total: 0 },
      reliability: { met: 0, total: 0 },
      cost_optimisation: { met: 0, total: 0 },
      performance_efficiency: { met: 0, total: 0 },
    };
    for (const p of PILLAR_ORDER) {
      const rows = byPillar[p];
      stats[p] = {
        met: rows.filter((r) => r.thresholdMet).length,
        total: rows.length,
      };
    }
    return stats;
  }, [byPillar]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WAF Assessment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Self-assess your workspace against the Databricks Well-Architected Framework. Forge
            runs deterministic SQL over <code className="text-xs">system.*</code> and links failing
            controls to remediation engines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latest && (
            <Button variant="outline" onClick={() => downloadCsv(latest)}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          )}
          <Button onClick={runAssessment} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {latest ? "Re-run assessment" : "Run assessment"}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !latest ? (
        <Card>
          <CardHeader>
            <CardTitle>No assessment yet</CardTitle>
            <CardDescription>
              Click <strong>Run assessment</strong> to score this workspace against the Databricks
              WAF. The first run takes about 20-40 seconds on a warm warehouse.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <ScoreOverview summary={latest} />

          <Tabs defaultValue="failing">
            <TabsList className="flex-wrap">
              <TabsTrigger value="failing">Failing ({notMet.length})</TabsTrigger>
              {PILLAR_ORDER.map((p) => (
                <TabsTrigger key={p} value={p}>
                  {SHORT_PILLAR_LABEL[p]} ({pillarStats[p].met}/{pillarStats[p].total})
                </TabsTrigger>
              ))}
              <TabsTrigger value="history">History ({data?.history.length ?? 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="failing" className="mt-4">
              {notMet.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center gap-3 py-8">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <p className="text-sm">All controls passed their thresholds. Nice work.</p>
                  </CardContent>
                </Card>
              ) : (
                <ResultsTable rows={notMet} showPillar />
              )}
            </TabsContent>

            {PILLAR_ORDER.map((p) => (
              <TabsContent key={p} value={p} className="mt-4 space-y-3">
                <PillarHeader
                  pillar={p}
                  score={pillarScoreFor(latest, p)}
                  met={pillarStats[p].met}
                  total={pillarStats[p].total}
                />
                <ResultsTable rows={byPillar[p]} />
              </TabsContent>
            ))}

            <TabsContent value="history" className="mt-4">
              <HistoryTable
                history={data?.history ?? []}
                latestId={latest.assessmentId}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function ScoreOverview({ summary }: { summary: WafAssessmentSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Overall</CardDescription>
          <CardTitle className="text-3xl">{summary.overallScore?.toFixed(1) ?? "—"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant={scoreToVariant(summary.overallScore)}>
            {scoreLabel(summary.overallScore)}
          </Badge>
          <p className="mt-2 text-xs text-muted-foreground">
            {summary.metControls} of {summary.totalControls} controls met · last run{" "}
            {fmtDate(summary.completedAt ?? summary.createdAt)}
          </p>
        </CardContent>
      </Card>
      {PILLAR_ORDER.map((p) => {
        const score = pillarScoreFor(summary, p);
        return (
          <Card key={p}>
            <CardHeader className="pb-2">
              <CardDescription>{PILLAR_LABEL[p]}</CardDescription>
              <CardTitle className="text-3xl">{score?.toFixed(1) ?? "—"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={scoreToVariant(score)}>{scoreLabel(score)}</Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PillarHeader({
  pillar,
  score,
  met,
  total,
}: {
  pillar: WafPillar;
  score: number | null;
  met: number;
  total: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <div className="text-sm text-muted-foreground">{PILLAR_LABEL[pillar]}</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums">{score?.toFixed(1) ?? "—"}</span>
            <Badge variant={scoreToVariant(score)}>{scoreLabel(score)}</Badge>
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div className="font-medium text-foreground">
            {met} / {total} controls met
          </div>
          {total > met && (
            <div className="mt-1 text-xs">{total - met} failing — sorted to the top</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultsTable({
  rows,
  showPillar = false,
}: {
  rows: WafAssessmentDetail["results"];
  showPillar?: boolean;
}) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Control</TableHead>
            {showPillar && <TableHead>Pillar</TableHead>}
            <TableHead>Best practice</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Threshold</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[160px]">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const action = fixAction(r.control.fixActionEngine, r.control.fixActionParamsJson);
            return (
              <TableRow key={r.wafId}>
                <TableCell className="font-mono text-xs">{r.wafId}</TableCell>
                {showPillar && (
                  <TableCell className="text-sm">{SHORT_PILLAR_LABEL[r.pillar]}</TableCell>
                )}
                <TableCell className="text-sm">
                  <div className="font-medium">{r.control.bestPractice}</div>
                  <div className="text-xs text-muted-foreground">{r.control.principle}</div>
                  {!r.thresholdMet && r.control.recommendationIfNotMet && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Recommendation
                      </summary>
                      <pre className="mt-1 max-w-3xl whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {r.control.recommendationIfNotMet}
                      </pre>
                    </details>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.scorePercentage.toFixed(1)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.thresholdPercentage.toFixed(0)}
                </TableCell>
                <TableCell>
                  {r.thresholdMet ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Met
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" /> Not Met
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!r.thresholdMet && action ? (
                    <Button size="sm" variant="outline" asChild>
                      {action.kind === "docs" ? (
                        <a href={action.href} target="_blank" rel="noopener noreferrer">
                          <BookOpen className="mr-1.5 h-3.5 w-3.5" /> {action.label}
                        </a>
                      ) : (
                        <Link href={action.href}>
                          <Wrench className="mr-1.5 h-3.5 w-3.5" /> {action.label}
                        </Link>
                      )}
                    </Button>
                  ) : !r.thresholdMet ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href="/ask-forge">
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Ask Forge
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function HistoryTable({
  history,
  latestId,
}: {
  history: WafAssessmentSummary[];
  latestId: string;
}) {
  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No previous runs.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Overall</TableHead>
            <TableHead className="text-right">Governance</TableHead>
            <TableHead className="text-right">Reliability</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Performance</TableHead>
            <TableHead className="text-right">Met / Total</TableHead>
            <TableHead className="w-[140px]">Compare</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((h) => {
            const isLatest = h.assessmentId === latestId;
            const canCompare = h.status === "completed" && !isLatest;
            return (
              <TableRow key={h.assessmentId}>
                <TableCell className="text-sm">
                  {fmtDate(h.createdAt)}
                  {isLatest && (
                    <span className="ml-2 text-xs text-muted-foreground">(latest)</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={h.status === "completed" ? "default" : "secondary"}>
                    {h.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.overallScore?.toFixed(1) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.governanceScore?.toFixed(1) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.reliabilityScore?.toFixed(1) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.costScore?.toFixed(1) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.performanceScore?.toFixed(1) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.metControls} / {h.totalControls}
                </TableCell>
                <TableCell>
                  {canCompare ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        href={`/assessment/compare?from=${encodeURIComponent(
                          h.assessmentId,
                        )}&to=${encodeURIComponent(latestId)}`}
                      >
                        <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" /> vs. latest
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
