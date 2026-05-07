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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  EyeOff,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  Play,
  RotateCcw,
  Sparkles,
  Wrench,
} from "lucide-react";
import { PILLAR_LABEL } from "@/lib/engines/waf-assessment/types";
import { getCrossReference } from "@/lib/engines/waf-assessment/cross-references";
import type {
  WafAssessmentDetail,
  WafAssessmentSummary,
  WafControl,
  WafIgnoredResource,
  WafPillar,
  WafQualitativeAnswer,
  WafQualitativeResponse,
} from "@/lib/engines/waf-assessment/types";

interface ApiState {
  latest: WafAssessmentDetail | null;
  history: WafAssessmentSummary[];
  qualitativeControls: WafControl[];
  qualitativeResponses: WafQualitativeResponse[];
  ignored: WafIgnoredResource[];
}

const QUALITATIVE_LABEL: Record<WafQualitativeAnswer, string> = {
  yes: "Yes",
  partial: "Partial",
  no: "No",
  not_applicable: "N/A",
};

const PILLAR_ORDER: WafPillar[] = [
  "governance",
  "interoperability_usability",
  "operational_excellence",
  "security_compliance_privacy",
  "reliability",
  "performance_efficiency",
  "cost_optimisation",
];

const SHORT_PILLAR_LABEL: Record<WafPillar, string> = {
  governance: "Governance",
  interoperability_usability: "Interop & Usability",
  operational_excellence: "Operational Excellence",
  security_compliance_privacy: "Security & Compliance",
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
    case "estate-scan": {
      const reasonRaw = typeof params.reason === "string" ? params.reason : "";
      const reason = /^[a-z][a-z0-9-]{0,40}$/.test(reasonRaw) ? reasonRaw : "";
      const href = reason ? `/environment?reason=${reason}` : "/environment";
      return { kind: "engine", href, label: "Open Estate" };
    }
    case "tag-engine":
      return { kind: "engine", href: "/environment?tab=governance", label: "Fix with Forge" };
    case "ask-forge": {
      const personaRaw = typeof params.persona === "string" ? params.persona : "";
      const persona = /^[a-z-]{1,32}$/.test(personaRaw) ? personaRaw : "tech";
      return { kind: "engine", href: `/ask-forge?persona=${persona}`, label: "Ask Forge" };
    }
    case "docs":
    default: {
      const href = safeDocHref(params.href);
      return href ? { kind: "docs", href, label: "Open docs" } : null;
    }
  }
}

function CrossRefBadges({ wafId, pillar }: { wafId: string; pillar: WafPillar }) {
  const refs = getCrossReference(wafId, pillar);
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <a
        href={refs.awsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        title={refs.awsLabel}
      >
        {refs.awsLabel}
      </a>
      <a
        href={refs.azureHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        title={refs.azureLabel}
      >
        {refs.azureLabel}
      </a>
    </div>
  );
}

function pillarScoreFor(s: WafAssessmentSummary | null, p: WafPillar): number | null {
  if (!s) return null;
  if (p === "governance") return s.governanceScore;
  if (p === "interoperability_usability") return s.iuScore;
  if (p === "operational_excellence") return s.oeScore;
  if (p === "security_compliance_privacy") return s.scpScore;
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
  const [deployingDashboard, setDeployingDashboard] = useState(false);
  const [deployingGenie, setDeployingGenie] = useState(false);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [genieUrl, setGenieUrl] = useState<string | null>(null);

  const refreshAssets = useCallback(async () => {
    try {
      const res = await fetch("/api/assessment/assets", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        dashboard: { url: string } | null;
        genie: { url: string } | null;
      };
      setDashboardUrl(json.dashboard?.url ?? null);
      setGenieUrl(json.genie?.url ?? null);
    } catch {
      // best-effort; UI falls back to "Generate" buttons
    }
  }, []);

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

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

  const generateDashboard = useCallback(async () => {
    setDeployingDashboard(true);
    try {
      const res = await fetch("/api/assessment/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Dashboard deploy failed (${res.status})`);
      const url = body.dashboardUrl as string | undefined;
      if (url) setDashboardUrl(url);
      toast.success(`Dashboard ${body.action ?? "ready"}`, {
        action: url
          ? { label: "Open", onClick: () => window.open(url, "_blank", "noopener") }
          : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to deploy dashboard";
      toast.error(message);
    } finally {
      setDeployingDashboard(false);
      void refreshAssets();
    }
  }, [refreshAssets]);

  const generateGenie = useCallback(async () => {
    setDeployingGenie(true);
    try {
      const res = await fetch("/api/assessment/genie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Genie deploy failed (${res.status})`);
      const url = body.spaceUrl as string | undefined;
      if (url) setGenieUrl(url);
      toast.success(`Genie space ${body.action ?? "ready"}`, {
        action: url
          ? { label: "Open", onClick: () => window.open(url, "_blank", "noopener") }
          : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to deploy Genie space";
      toast.error(message);
    } finally {
      setDeployingGenie(false);
      void refreshAssets();
    }
  }, [refreshAssets]);

  const saveQualitative = useCallback(
    async (input: { wafId: string; response: WafQualitativeAnswer; notes: string | null }) => {
      const res = await fetch("/api/assessment/qualitative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      await refresh();
    },
    [refresh],
  );

  const ignoreControl = useCallback(
    async (wafId: string) => {
      const reason = window.prompt(
        `Why is ${wafId} not applicable to this workspace? (this will be persisted as an audit trail)`,
      );
      if (!reason || !reason.trim()) return;
      const res = await fetch("/api/assessment/ignored", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wafId, reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Failed to ignore ${wafId}`);
        return;
      }
      toast.success(`${wafId} will be excluded from the next run`);
      await refresh();
    },
    [refresh],
  );

  const restoreIgnored = useCallback(
    async (id: string, wafId: string) => {
      const res = await fetch("/api/assessment/ignored", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Failed to restore ${wafId}`);
        return;
      }
      toast.success(`${wafId} restored`);
      await refresh();
    },
    [refresh],
  );

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
      interoperability_usability: [],
      operational_excellence: [],
      security_compliance_privacy: [],
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
      interoperability_usability: { met: 0, total: 0 },
      operational_excellence: { met: 0, total: 0 },
      security_compliance_privacy: { met: 0, total: 0 },
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
          {dashboardUrl ? (
            <Button
              variant="outline"
              onClick={() => window.open(dashboardUrl, "_blank", "noopener")}
              title="Open the Forge WAF Lakeview dashboard"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open dashboard
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={generateDashboard}
              disabled={deployingDashboard}
              title="Create the Forge WAF Lakeview dashboard"
            >
              {deployingDashboard ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LayoutDashboard className="mr-2 h-4 w-4" />
              )}
              Generate dashboard
            </Button>
          )}
          {genieUrl ? (
            <Button
              variant="outline"
              onClick={() => window.open(genieUrl, "_blank", "noopener")}
              title="Open the Forge WAF Genie space"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Genie
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={generateGenie}
              disabled={deployingGenie}
              title="Create the Forge WAF Genie space"
            >
              {deployingGenie ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-2 h-4 w-4" />
              )}
              Generate Genie
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
          <ScoreOverview
            summary={latest}
            qualitativeAnswered={data?.qualitativeResponses.length ?? 0}
            qualitativeTotal={data?.qualitativeControls.length ?? 0}
          />

          {latest.errorMessage && (
            <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="flex items-start gap-3 py-4 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium">Partial run</p>
                  <p className="mt-1 text-muted-foreground">{latest.errorMessage}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="failing">
            <ScrollableTabsRow>
              <TabsList className="w-max min-w-full justify-start [&>button]:flex-none">
                <TabsTrigger value="failing">Failing ({notMet.length})</TabsTrigger>
                {PILLAR_ORDER.map((p) => (
                  <TabsTrigger key={p} value={p}>
                    {SHORT_PILLAR_LABEL[p]} ({pillarStats[p].met}/{pillarStats[p].total})
                  </TabsTrigger>
                ))}
                <TabsTrigger value="qualitative">
                  Qualitative ({data?.qualitativeResponses.length ?? 0}/
                  {data?.qualitativeControls.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="ignored">
                  Ignored ({data?.ignored.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="history">History ({data?.history.length ?? 0})</TabsTrigger>
              </TabsList>
            </ScrollableTabsRow>

            <TabsContent value="failing" className="mt-4">
              {notMet.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center gap-3 py-8">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <p className="text-sm">All controls passed their thresholds. Nice work.</p>
                  </CardContent>
                </Card>
              ) : (
                <ResultsTable rows={notMet} showPillar onIgnore={ignoreControl} />
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
                <ResultsTable rows={byPillar[p]} onIgnore={ignoreControl} />
              </TabsContent>
            ))}

            <TabsContent value="qualitative" className="mt-4">
              <QualitativeTab
                controls={data?.qualitativeControls ?? []}
                responses={data?.qualitativeResponses ?? []}
                onSave={saveQualitative}
              />
            </TabsContent>

            <TabsContent value="ignored" className="mt-4">
              <IgnoredTab ignored={data?.ignored ?? []} onRestore={restoreIgnored} />
            </TabsContent>

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

function ScrollableTabsRow({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateState();
    const onScroll = () => updateState();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(updateState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [updateState]);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={scrollRef} className="overflow-x-auto">
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent transition-opacity ${canLeft ? "opacity-100" : "opacity-0"}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent transition-opacity ${canRight ? "opacity-100" : "opacity-0"}`}
      />
      {canLeft && (
        <button
          type="button"
          aria-label="Scroll tabs left"
          onClick={() => scrollBy("left")}
          className="absolute left-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/50 bg-background/80 text-foreground/80 shadow-sm backdrop-blur-sm transition hover:bg-background hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="Scroll tabs right"
          onClick={() => scrollBy("right")}
          className="absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/50 bg-background/80 text-foreground/80 shadow-sm backdrop-blur-sm transition hover:bg-background hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ScoreOverview({
  summary,
  qualitativeAnswered,
  qualitativeTotal,
}: {
  summary: WafAssessmentSummary;
  qualitativeAnswered: number;
  qualitativeTotal: number;
}) {
  const qualitativePending = qualitativeTotal - qualitativeAnswered;
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
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Qualitative</CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {qualitativeAnswered}/{qualitativeTotal || "—"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {qualitativeTotal === 0 ? (
            <Badge variant="secondary">No controls</Badge>
          ) : qualitativePending === 0 ? (
            <Badge variant="default">Complete</Badge>
          ) : (
            <Badge variant="destructive">{qualitativePending} pending</Badge>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {qualitativePending > 0
              ? "Answer the manual controls in the Qualitative tab."
              : "All manual controls answered."}
          </p>
        </CardContent>
      </Card>
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
  onIgnore,
}: {
  rows: WafAssessmentDetail["results"];
  showPillar?: boolean;
  onIgnore?: (wafId: string) => Promise<void>;
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
                  <CrossRefBadges wafId={r.wafId} pillar={r.pillar} />
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
                  <div className="flex flex-wrap items-center gap-1">
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
                    {!r.thresholdMet && onIgnore && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Mark this control as not applicable to this workspace"
                        onClick={() => void onIgnore(r.wafId)}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
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
            <TableHead className="text-right">IU</TableHead>
            <TableHead className="text-right">OE</TableHead>
            <TableHead className="text-right">SCP</TableHead>
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
                  {h.iuScore?.toFixed(1) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.oeScore?.toFixed(1) ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {h.scpScore?.toFixed(1) ?? "—"}
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

function IgnoredTab({
  ignored,
  onRestore,
}: {
  ignored: WafIgnoredResource[];
  onRestore: (id: string, wafId: string) => Promise<void>;
}) {
  if (ignored.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No controls or resources are currently excluded from scoring.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Control</TableHead>
            <TableHead className="w-[140px]">Scope</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="w-[160px]">Ignored at</TableHead>
            <TableHead className="w-[160px]">By</TableHead>
            <TableHead className="w-[100px]">Restore</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ignored.map((row) => {
            const scope =
              row.resourceType && row.resourceId
                ? `${row.resourceType}: ${row.resourceId}`
                : "Whole control";
            return (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.wafId}</TableCell>
                <TableCell className="text-xs">{scope}</TableCell>
                <TableCell className="text-sm whitespace-pre-wrap">{row.reason}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(row.createdAt)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.ignoredBy ?? "—"}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onRestore(row.id, row.wafId)}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function QualitativeTab({
  controls,
  responses,
  onSave,
}: {
  controls: WafControl[];
  responses: WafQualitativeResponse[];
  onSave: (input: {
    wafId: string;
    response: WafQualitativeAnswer;
    notes: string | null;
  }) => Promise<void>;
}) {
  const responseByWafId = useMemo(() => {
    const map = new Map<string, WafQualitativeResponse>();
    for (const r of responses) map.set(r.wafId, r);
    return map;
  }, [responses]);

  if (controls.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No qualitative controls in the catalog.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground">
          Answer each best practice with <strong>Yes</strong> (100), <strong>Partial</strong> (50),{" "}
          <strong>No</strong> (0), or <strong>N/A</strong> (excluded). Saved responses feed every
          future assessment run — re-run the assessment to see the updated pillar scores.
        </CardContent>
      </Card>
      {controls.map((control) => (
        <QualitativeRow
          key={control.wafId}
          control={control}
          response={responseByWafId.get(control.wafId) ?? null}
          onSave={onSave}
        />
      ))}
    </div>
  );
}

function QualitativeRow({
  control,
  response,
  onSave,
}: {
  control: WafControl;
  response: WafQualitativeResponse | null;
  onSave: (input: {
    wafId: string;
    response: WafQualitativeAnswer;
    notes: string | null;
  }) => Promise<void>;
}) {
  const [answer, setAnswer] = useState<WafQualitativeAnswer | "">(response?.response ?? "");
  const [notes, setNotes] = useState<string>(response?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = answer !== (response?.response ?? "") || notes !== (response?.notes ?? "");

  const handleSave = useCallback(async () => {
    if (!answer) {
      toast.error("Pick an answer first");
      return;
    }
    setSaving(true);
    try {
      await onSave({ wafId: control.wafId, response: answer, notes: notes.trim() || null });
      toast.success(`Saved ${control.wafId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save response";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [answer, notes, control.wafId, onSave]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{control.wafId}</span>
            <Badge variant="outline" className="text-xs">
              {PILLAR_LABEL[control.pillar]}
            </Badge>
            {response ? (
              <Badge variant="default" className="text-xs">
                Answered
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Pending response
              </Badge>
            )}
          </div>
          <CardTitle className="text-base">{control.bestPractice}</CardTitle>
          <CardDescription className="text-xs">{control.principle}</CardDescription>
          <CrossRefBadges wafId={control.wafId} pillar={control.pillar} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {control.details && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{control.details}</p>
        )}
        <ToggleGroup
          type="single"
          value={answer}
          onValueChange={(v: string) => v && setAnswer(v as WafQualitativeAnswer)}
          className="justify-start"
        >
          {(["yes", "partial", "no", "not_applicable"] as WafQualitativeAnswer[]).map((opt) => (
            <ToggleGroupItem key={opt} value={opt} className="px-3 text-xs">
              {QUALITATIVE_LABEL[opt]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes (evidence, owner, expected remediation date)..."
          className="min-h-[60px] text-xs"
        />
        <div className="flex items-center justify-end gap-2">
          {response && (
            <span className="text-xs text-muted-foreground">
              Last updated {fmtDate(response.updatedAt)}
            </span>
          )}
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving || !answer}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
