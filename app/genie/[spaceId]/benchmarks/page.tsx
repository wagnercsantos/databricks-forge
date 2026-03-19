"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  FlaskConical,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  XCircle,
  Clock,
} from "lucide-react";
import { OptimizationReview } from "@/components/genie/optimization-review";
import type { EvalResultDetail } from "@/lib/genie/benchmark-runner";
import type { GenieEvalAssessment, ScoreReason } from "@/lib/genie/eval-types";
import { SCORE_REASON_LABELS } from "@/lib/genie/eval-types";

interface BenchmarkQuestion {
  id: string;
  question: string;
  expectedSql: string | null;
}

interface LabeledResult extends EvalResultDetail {
  userAssessment?: GenieEvalAssessment;
  feedbackText?: string;
}

interface HistoryEntry {
  evalRunId: string;
  id: string;
  runAt: string;
  status: string;
  numQuestions: number;
  numCorrect: number;
  numNeedsReview: number;
  accuracy: number;
  improvementsApplied: boolean;
  hasFeedback: boolean;
}

interface ImproveResult {
  updatedSerializedSpace: string;
  changes: Array<{
    section: string;
    description: string;
    added: number;
    modified: number;
  }>;
  strategiesRun: string[];
  originalSerializedSpace?: string;
}

// ---------------------------------------------------------------------------
// Assessment badges
// ---------------------------------------------------------------------------

function AssessmentBadge({ assessment }: { assessment: GenieEvalAssessment }) {
  switch (assessment) {
    case "GOOD":
      return (
        <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="size-3" />
          Good
        </Badge>
      );
    case "BAD":
      return (
        <Badge className="gap-1 bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400">
          <XCircle className="size-3" />
          Bad
        </Badge>
      );
    case "NEEDS_REVIEW":
      return (
        <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
          <Eye className="size-3" />
          Needs Review
        </Badge>
      );
  }
}

function ScoreReasonChips({ reasons }: { reasons: ScoreReason[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <Badge
          key={reason}
          variant="outline"
          className="text-[10px] font-normal"
          title={reason}
        >
          {SCORE_REASON_LABELS[reason] ?? reason}
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SQL comparison
// ---------------------------------------------------------------------------

function SqlComparison({
  expected,
  actual,
}: {
  expected?: string;
  actual?: string;
}) {
  if (!expected && !actual) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {expected && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Expected SQL</div>
          <pre className="max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">
            {expected}
          </pre>
        </div>
      )}
      {actual && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Actual SQL</div>
          <pre className="max-h-32 overflow-auto rounded bg-muted/50 p-2 text-xs">{actual}</pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution result table
// ---------------------------------------------------------------------------

function ExecutionResultTable({
  result,
  label,
}: {
  result?: Record<string, unknown>;
  label: string;
}) {
  if (!result) return null;

  const schema = result.schema as Record<string, unknown> | undefined;
  const columns = (result.columns ?? schema?.columns ?? []) as Array<{
    name?: string;
  }>;
  const rows = (result.data_array ?? result.rows ?? []) as unknown[][];

  if (columns.length === 0 || rows.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{label}</span>
        <span>
          {rows.length} row{rows.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="max-h-40 overflow-auto rounded border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="px-2 py-1 text-left font-medium">
                  {col.name ?? `col_${i}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row, ri) => (
              <tr key={ri} className="border-t">
                {(row as unknown[]).map((cell, ci) => (
                  <td key={ci} className="max-w-[200px] truncate px-2 py-1">
                    {cell != null ? String(cell) : "NULL"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BenchmarkPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const router = useRouter();

  const [questions, setQuestions] = useState<BenchmarkQuestion[]>([]);
  const [results, setResults] = useState<LabeledResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState({ done: 0, total: 0 });
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [currentEvalRunId, setCurrentEvalRunId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [improving, setImproving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [improveResult, setImproveResult] = useState<ImproveResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);
  const allSelected = selectedCount === questions.length && questions.length > 0;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    }
  };

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks`);
      if (!res.ok) throw new Error("Failed to load benchmarks");
      const data = await res.json();
      const qs: BenchmarkQuestion[] = (data.questions ?? []).map(
        (q: { id?: string; question: string; expectedSql?: string | null }, i: number) => ({
          id: q.id ?? `q-${i}`,
          question: q.question,
          expectedSql: q.expectedSql ?? null,
        }),
      );
      setQuestions(qs);
      setSelectedIds(new Set(qs.map((q) => q.id)));
    } catch {
      toast.error("Failed to load benchmark questions");
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history ?? []);
      }
    } catch {
      // Non-critical
    } finally {
      setHistoryLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchQuestions();
    fetchHistory();
  }, [fetchQuestions, fetchHistory]);

  // ---------------------------------------------------------------------------
  // Run eval
  // ---------------------------------------------------------------------------

  const runBenchmarks = async (questionIds?: string[]) => {
    const ids = questionIds ?? [...selectedIds];
    if (ids.length === 0) return;
    setRunning(true);
    setResults([]);
    setRunProgress({ done: 0, total: ids.length });
    setCurrentRunId(null);
    setCurrentEvalRunId(null);

    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: ids }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "Eval run creation failed");
      }

      const data = await res.json();
      if (!data.evalRunId) throw new Error("No evalRunId returned");
      setCurrentEvalRunId(data.evalRunId);

      let delay = 3000;
      const maxAttempts = 200;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          const pollRes = await fetch(
            `/api/genie-spaces/${spaceId}/benchmarks/run?evalRunId=${data.evalRunId}`,
          );
          if (!pollRes.ok) continue;
          const pollData = await pollRes.json();

          setRunProgress({
            done: pollData.numDone ?? 0,
            total: pollData.numQuestions ?? ids.length,
          });

          if (pollData.results && pollData.results.length > 0) {
            setResults(pollData.results);
          }

          const status = pollData.status;
          if (status === "DONE") {
            setCurrentRunId(pollData.runId ?? null);
            fetchHistory();
            break;
          }
          if (
            status === "EVALUATION_FAILED" ||
            status === "EVALUATION_CANCELLED" ||
            status === "EVALUATION_TIMEOUT"
          ) {
            toast.error(`Eval run ${status.toLowerCase().replace(/_/g, " ")}`);
            if (pollData.results) setResults(pollData.results);
            break;
          }

          delay = Math.min(delay * 1.1, 5000);
        } catch {
          /* retry */
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eval run failed");
    } finally {
      setRunning(false);
      setCurrentEvalRunId(null);
    }
  };

  const rerunFailed = () => {
    const failedIds = results
      .filter((r) => r.assessment !== "GOOD")
      .map((r) => r.benchmarkQuestionId)
      .filter(Boolean);
    if (failedIds.length === 0) return;
    runBenchmarks(failedIds);
  };

  // ---------------------------------------------------------------------------
  // Feedback / Improve / Optimize
  // ---------------------------------------------------------------------------

  const setUserAssessment = (index: number, assessment: GenieEvalAssessment) => {
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, userAssessment: assessment } : r)),
    );
  };

  const setFeedbackText = (index: number, text: string) => {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, feedbackText: text } : r)));
  };

  const submitFeedback = async () => {
    if (!currentRunId) return;
    setSubmittingFeedback(true);
    try {
      const feedback = results
        .filter((r) => r.userAssessment !== undefined)
        .map((r) => ({
          question: r.question,
          assessment: r.userAssessment!,
          assessmentReasons: r.assessmentReasons,
          feedbackText: r.feedbackText,
        }));

      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkRunId: currentRunId, feedback }),
      });

      if (!res.ok) throw new Error("Failed to submit feedback");
      toast.success("Feedback saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save feedback");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const runImprove = async () => {
    if (!currentRunId) return;
    setImproving(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkRunId: currentRunId }),
      });

      if (!res.ok) throw new Error("Failed to generate improvements");
      const data = await res.json();

      if (data.updatedSerializedSpace) {
        setImproveResult(data as ImproveResult);
      } else {
        toast.info(data.message ?? "No improvements identified");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Improvement failed");
    } finally {
      setImproving(false);
    }
  };

  const runOptimize = async () => {
    if (!currentRunId) return;
    setOptimizing(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkRunId: currentRunId }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Optimization failed");
      }
      const data = await res.json();

      if (!data.suggestions || data.suggestions.length === 0) {
        toast.info("No optimization suggestions generated");
        return;
      }

      const mergeRes = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serializedSpace: data.originalSerializedSpace,
          suggestions: data.suggestions,
        }),
      });

      if (!mergeRes.ok) throw new Error("Failed to merge suggestions");
      const mergeData = await mergeRes.json();

      setImproveResult({
        updatedSerializedSpace: mergeData.mergedSerializedSpace,
        changes: data.suggestions.map(
          (s: { category: string; rationale: string }) => ({
            section: s.category,
            description: s.rationale,
            added: 0,
            modified: 1,
          }),
        ),
        strategiesRun: ["llm_field_optimization"],
        originalSerializedSpace: data.originalSerializedSpace,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setOptimizing(false);
    }
  };

  const handleApply = async (serializedSpace: string) => {
    setApplying(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serializedSpace }),
      });
      if (!res.ok) throw new Error("Failed to apply improvements");
      toast.success("Improvements applied! Re-run benchmarks to verify.");
      setImproveResult(null);
      fetchHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const handleCloneAndApply = async (serializedSpace: string) => {
    setCloning(true);
    try {
      const cloneRes = await fetch(`/api/genie-spaces/${spaceId}/clone`, {
        method: "POST",
      });
      if (!cloneRes.ok) throw new Error("Clone failed");
      const { clonedSpaceId } = await cloneRes.json();

      const applyRes = await fetch(`/api/genie-spaces/${clonedSpaceId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serializedSpace }),
      });
      if (!applyRes.ok) throw new Error("Apply to clone failed");

      toast.success("Cloned and applied improvements");
      setImproveResult(null);
      router.push(`/genie/${clonedSpaceId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone and apply failed");
    } finally {
      setCloning(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const goodCount = results.filter((r) => r.assessment === "GOOD").length;
  const badCount = results.filter((r) => r.assessment === "BAD").length;
  const needsReviewCount = results.filter((r) => r.assessment === "NEEDS_REVIEW").length;
  const accuracy =
    results.length > 0 ? Math.round((goodCount / results.length) * 100) : 0;
  const hasFailures = badCount > 0 || needsReviewCount > 0;
  const previousRun = history.length > 0 ? history[0] : null;

  // ---------------------------------------------------------------------------
  // Optimization review overlay
  // ---------------------------------------------------------------------------

  if (improveResult) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setImproveResult(null)}>
            <ArrowLeft className="mr-1 size-4" />
            Back to Results
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Review Improvements</h1>
        </div>
        <OptimizationReview
          changes={improveResult.changes ?? []}
          strategiesRun={improveResult.strategiesRun ?? []}
          currentSerializedSpace={improveResult.originalSerializedSpace ?? "{}"}
          updatedSerializedSpace={improveResult.updatedSerializedSpace}
          onApply={handleApply}
          onCloneAndApply={handleCloneAndApply}
          onCancel={() => setImproveResult(null)}
          applying={applying}
          cloning={cloning}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/genie/${spaceId}`}>
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Benchmark Test Runner</h1>
          <p className="text-sm text-muted-foreground">Space: {spaceId}</p>
        </div>
      </div>

      <Tabs defaultValue="run">
        <TabsList>
          <TabsTrigger value="run">
            <FlaskConical className="mr-1.5 size-4" />
            Run Benchmarks
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="mr-1.5 size-4" />
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* RUN TAB                                                          */}
        {/* ================================================================ */}
        <TabsContent value="run" className="mt-4 space-y-4">
          {loading ? (
            <Skeleton className="h-48" />
          ) : questions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <FlaskConical className="mb-4 size-10 text-muted-foreground/50" />
                <h2 className="text-lg font-semibold">No benchmark questions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This space has no benchmark questions configured. Run a health check and use the
                  Fix workflow to generate them.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Controls */}
              <div className="flex items-center gap-3">
                <Button onClick={() => runBenchmarks()} disabled={running || selectedCount === 0}>
                  {running ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 size-4" />
                  )}
                  {running
                    ? `Running ${runProgress.done}/${runProgress.total}...`
                    : selectedCount === questions.length
                      ? `Run All (${questions.length})`
                      : `Run Selected (${selectedCount}/${questions.length})`}
                </Button>
                {results.length > 0 && !running && hasFailures && (
                  <Button variant="outline" onClick={rerunFailed} disabled={running}>
                    <RotateCcw className="mr-2 size-4" />
                    Re-run Failed ({badCount + needsReviewCount})
                  </Button>
                )}
                {results.length > 0 && !running && (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant={goodCount === results.length ? "default" : "secondary"}>
                        {accuracy}% accuracy
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {goodCount} good, {badCount} bad, {needsReviewCount} review
                      </span>
                    </div>
                    {previousRun && (
                      <span className="text-xs text-muted-foreground">
                        Previous: {previousRun.accuracy}%
                        {accuracy > previousRun.accuracy && (
                          <span className="ml-1 text-green-600">
                            +{accuracy - previousRun.accuracy}%
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Question selection list */}
              {results.length === 0 && !running && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Questions</CardTitle>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                        {allSelected ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                    <CardDescription>
                      {selectedCount} of {questions.length} selected
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 p-4 pt-0">
                    {questions.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                          <Checkbox
                            checked={selectedIds.has(q.id)}
                            onCheckedChange={() => toggleSelection(q.id)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">{q.question}</div>
                            {q.expectedSql && (
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                Has expected SQL
                              </Badge>
                            )}
                          </div>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2"
                          disabled={running}
                          onClick={() => runBenchmarks([q.id])}
                          title={`Run "${q.question}"`}
                        >
                          <Play className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Results */}
              {results.length > 0 && (
                <div className="space-y-3">
                  {results.map((result, idx) => (
                    <Card key={result.resultId ?? idx}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <AssessmentBadge assessment={result.assessment} />
                              <span className="text-sm font-medium">{result.question}</span>
                            </div>

                            <ScoreReasonChips reasons={result.assessmentReasons} />

                            <SqlComparison
                              expected={result.expectedSql}
                              actual={result.actualSql}
                            />

                            <ExecutionResultTable
                              result={result.actualExecutionResult}
                              label="Actual Result"
                            />
                            <ExecutionResultTable
                              result={result.expectedExecutionResult}
                              label="Expected Result"
                            />
                          </div>

                          {/* Manual assessment buttons */}
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="sm"
                              variant={result.userAssessment === "GOOD" ? "default" : "outline"}
                              className="h-7 px-2"
                              onClick={() => setUserAssessment(idx, "GOOD")}
                              title="Mark as Good"
                            >
                              <ThumbsUp className="size-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                result.userAssessment === "BAD" ? "destructive" : "outline"
                              }
                              className="h-7 px-2"
                              onClick={() => setUserAssessment(idx, "BAD")}
                              title="Mark as Bad"
                            >
                              <ThumbsDown className="size-3" />
                            </Button>
                          </div>
                        </div>

                        {result.userAssessment === "BAD" && (
                          <Textarea
                            placeholder="What was wrong? (optional)"
                            value={result.feedbackText ?? ""}
                            onChange={(e) => setFeedbackText(idx, e.target.value)}
                            className="text-xs"
                            rows={2}
                          />
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {/* Action bar */}
                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={submitFeedback}
                      disabled={
                        submittingFeedback ||
                        !currentRunId ||
                        results.every((r) => r.userAssessment === undefined)
                      }
                      variant="outline"
                    >
                      {submittingFeedback ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      Save Feedback
                    </Button>
                    {hasFailures && currentRunId && (
                      <>
                        <Button onClick={runImprove} disabled={improving || optimizing}>
                          {improving ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Wrench className="mr-2 size-4" />
                          )}
                          Improve ({badCount + needsReviewCount} issues)
                        </Button>
                        <Button
                          variant="outline"
                          onClick={runOptimize}
                          disabled={improving || optimizing}
                        >
                          {optimizing ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 size-4" />
                          )}
                          Optimize (LLM)
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* HISTORY TAB                                                      */}
        {/* ================================================================ */}
        <TabsContent value="history" className="mt-4">
          {historyLoading ? (
            <Skeleton className="h-48" />
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No eval runs yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {history.map((run) => (
                <Card key={run.evalRunId}>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        {new Date(run.runAt).toLocaleString()}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge
                          variant={
                            run.accuracy >= 80
                              ? "default"
                              : run.accuracy >= 50
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {run.accuracy}% accuracy
                        </Badge>
                        {run.numNeedsReview > 0 && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Eye className="size-3" />
                            {run.numNeedsReview} review
                          </Badge>
                        )}
                        {run.improvementsApplied && (
                          <Badge variant="outline" className="text-xs">
                            Improved
                          </Badge>
                        )}
                        {run.status !== "DONE" && (
                          <Badge variant="secondary" className="text-xs">
                            {run.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      {run.numCorrect}/{run.numQuestions} correct
                      {run.numNeedsReview > 0 && `, ${run.numNeedsReview} needs review`}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
