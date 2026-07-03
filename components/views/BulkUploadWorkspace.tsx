"use client";

import { useMemo, useRef, useState } from "react";
import { getBulkUploadLimit, parseBulkUploadFile } from "@/lib/bulkUpload";
import type {
  BulkAnalysisProgress,
  BulkAnalysisResult,
  BulkCluster,
  BulkUploadMappingSelection,
  BulkUploadParseResult,
} from "@/types";

interface BulkUploadWorkspaceProps {
  darkMode: boolean;
  onSwitchToSingle: () => void;
  onSwitchToBulk: () => void;
  onAnalyze: (entries: BulkUploadParseResult["entries"], onProgress: (progress: BulkAnalysisProgress) => void) => Promise<BulkAnalysisResult>;
  onCommitCluster: (cluster: BulkCluster) => Promise<{
    knowledgeId: string;
    candidateId: string;
    validationId: string;
    memoryChangeId: string;
  }>;
  onOpenSingleTicket: (text: string) => void;
}

interface LocalCluster extends BulkCluster {
  editedKnowledge: string;
  commitMessage?: string;
  status?: "ready" | "committed";
}

function clusterBadgeTone(
  kind: BulkCluster["kind"],
  darkMode: boolean
): string {
  if (kind === "existing") return darkMode ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-100 text-emerald-700";
  if (kind === "new") return darkMode ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700";
  return darkMode ? "bg-amber-900/30 text-amber-300" : "bg-amber-100 text-amber-700";
}

function confidenceTone(confidence: BulkCluster["confidence"], darkMode: boolean): string {
  if (confidence === "high") return darkMode ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-50 text-emerald-700";
  if (confidence === "medium") return darkMode ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-700";
  return darkMode ? "bg-amber-900/30 text-amber-300" : "bg-amber-50 text-amber-700";
}

function analysisModeLabel(mode: BulkAnalysisResult["analysisMode"]): string {
  if (mode === "ai_assisted") return "AI-assisted clustering";
  if (mode === "deterministic_fallback") return "Deterministic fallback";
  return "Deterministic clustering";
}

function withEditableCluster(cluster: BulkCluster): LocalCluster {
  return {
    ...cluster,
    editedKnowledge: cluster.knowledgeDraft.customerResponseTemplate
  };
}

function recalcCluster(cluster: LocalCluster, items: LocalCluster["items"]): LocalCluster {
  return {
    ...cluster,
    items,
    count: items.length,
    sampleQueries: items.slice(0, 5).map((item) => ({
      entryId: item.entry.id,
      message: item.entry.message,
      resolution: item.entry.resolution
    }))
  };
}

export function BulkUploadWorkspace({
  darkMode,
  onSwitchToSingle,
  onSwitchToBulk,
  onAnalyze,
  onCommitCluster,
  onOpenSingleTicket
}: BulkUploadWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [parseResult, setParseResult] = useState<BulkUploadParseResult | null>(null);
  const [mapping, setMapping] = useState<BulkUploadMappingSelection>({ messageField: "", resolutionField: "" });
  const [analysis, setAnalysis] = useState<BulkAnalysisResult | null>(null);
  const [clusters, setClusters] = useState<LocalCluster[]>([]);
  const [unclustered, setUnclustered] = useState<LocalCluster | null>(null);
  const [progress, setProgress] = useState<BulkAnalysisProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
  const [committingClusterId, setCommittingClusterId] = useState<string | null>(null);

  const card = `rounded-2xl border ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`;
  const muted = darkMode ? "text-slate-400" : "text-slate-500";
  const limit = getBulkUploadLimit();

  const parseSummary = useMemo(() => {
    if (!parseResult) return null;
    return `${parseResult.summary.detectedQueries} queries detected, ${parseResult.summary.skippedRows} rows skipped${parseResult.summary.truncatedCount > 0 ? `, ${parseResult.summary.truncatedCount} truncated beyond the ${limit}-query limit` : ""}.`;
  }, [limit, parseResult]);

  async function readFile(file: File) {
    const text = await file.text();
    setFileName(file.name);
    setFileContent(text);
    setAnalysis(null);
    setClusters([]);
    setUnclustered(null);
    setProgress(null);
    setErrorMessage("");
    try {
      const nextParse = parseBulkUploadFile(file.name, text);
      setParseResult(nextParse);
      setMapping({
        messageField: nextParse.mappingRequest?.suggestedMessageField ?? "",
        resolutionField: nextParse.mappingRequest?.suggestedResolutionField ?? ""
      });
    } catch (error) {
      setParseResult(null);
      setErrorMessage(error instanceof Error ? error.message : "Unable to parse this upload.");
    }
  }

  function applyMapping() {
    if (!fileName || !fileContent || !mapping.messageField) return;
    try {
      const nextParse = parseBulkUploadFile(fileName, fileContent, {
        messageField: mapping.messageField,
        resolutionField: mapping.resolutionField || undefined
      });
      setParseResult(nextParse);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to apply the selected mapping.");
    }
  }

  async function startAnalysis() {
    if (!parseResult || parseResult.entries.length === 0 || parseResult.needsMapping) return;
    setIsAnalyzing(true);
    setErrorMessage("");
    setAnalysis(null);
    setProgress({ completed: 0, total: parseResult.entries.length, currentLabel: "Preparing analysis", percent: 0 });
    try {
      const result = await onAnalyze(parseResult.entries, setProgress);
      setAnalysis(result);
      setClusters(result.clusters.map(withEditableCluster));
      setUnclustered(withEditableCluster(result.unclustered));
      setExpandedClusterId(result.clusters[0]?.id ?? null);
      setProgress({ completed: result.total, total: result.total, currentLabel: "Analysis complete", percent: 100 });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Bulk analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function moveQueryToUnclustered(clusterId: string, entryId: string) {
    setClusters((current) => {
      const nextClusters: LocalCluster[] = [];
      let movedItem: LocalCluster["items"][number] | null = null;

      for (const cluster of current) {
        if (cluster.id !== clusterId) {
          nextClusters.push(cluster);
          continue;
        }

        const item = cluster.items.find((candidate) => candidate.entry.id === entryId) ?? null;
        if (item) movedItem = item;
        const remaining = cluster.items.filter((candidate) => candidate.entry.id !== entryId);
        if (remaining.length > 0) {
          nextClusters.push(recalcCluster(cluster, remaining));
        }
      }

      if (movedItem) {
        setUnclustered((currentUnclustered) => {
          if (!currentUnclustered) return currentUnclustered;
          return recalcCluster(currentUnclustered, [...currentUnclustered.items, movedItem]);
        });
      }

      return nextClusters;
    });
  }

  function rejectCluster(clusterId: string) {
    const cluster = clusters.find((item) => item.id === clusterId);
    if (!cluster) return;
    setUnclustered((current) => current ? recalcCluster(current, [...current.items, ...cluster.items]) : current);
    setClusters((current) => current.filter((item) => item.id !== clusterId));
  }

  async function commitCluster(clusterId: string) {
    const cluster = clusters.find((item) => item.id === clusterId);
    if (!cluster) return;

    const nextCluster: BulkCluster = {
      ...cluster,
      knowledgeDraft: {
        ...cluster.knowledgeDraft,
        customerResponseTemplate: cluster.editedKnowledge.trim(),
        resolutionNeeded: cluster.editedKnowledge.trim().length === 0
      }
    };

    if (nextCluster.knowledgeDraft.resolutionNeeded) {
      setErrorMessage("Resolution needed. Author or confirm the proposed response before validating this cluster.");
      return;
    }

    setCommittingClusterId(clusterId);
    setErrorMessage("");
    try {
      const result = await onCommitCluster(nextCluster);
      setClusters((current) =>
        current.map((item) =>
          item.id === clusterId
            ? {
                ...item,
                status: "committed",
                editedKnowledge: nextCluster.knowledgeDraft.customerResponseTemplate,
                commitMessage: `Committed as knowledge ${result.knowledgeId}. Validation ${result.validationId} and memory change ${result.memoryChangeId} were recorded.`
              }
            : item
        )
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to validate this cluster.");
    } finally {
      setCommittingClusterId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pb-4 pt-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Tickets</h1>
            <p className={`text-sm ${muted}`}>Bulk upload treats uploaded queries as work signals until a human validates a cluster into organizational memory.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSwitchToSingle}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${darkMode ? "border border-[#2d3f52] text-slate-300 hover:bg-[#111827]" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              New Ticket
            </button>
            <button
              type="button"
              onClick={() => {
                onSwitchToBulk();
                fileInputRef.current?.click();
              }}
              className="rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Upload queries
            </button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,.md,.txt"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className={`${card} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Upload intake</h2>
              <p className={`mt-1 text-sm ${muted}`}>Supported formats: `.json`, `.csv`, `.md`, `.txt`. Batches are capped at {limit} queries.</p>
            </div>
            {fileName ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-100 text-slate-700"}`}>
                {fileName}
              </span>
            ) : null}
          </div>

          {parseSummary ? (
            <div className={`mt-4 rounded-xl border p-4 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>{parseSummary}</p>
              <p className={`mt-1 text-xs ${muted}`}>
                Detected shape: {parseResult?.summary.shape.replace(/_/g, " ")}.
              </p>
              {parseResult?.summary.warnings.map((warning) => (
                <p key={warning} className={`mt-1 text-xs ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
                  {warning}
                </p>
              ))}
            </div>
          ) : (
            <p className={`mt-4 text-sm ${muted}`}>Choose a file to preview the parse summary before analysis.</p>
          )}

          {parseResult?.needsMapping && parseResult.mappingRequest ? (
            <div className={`mt-4 rounded-xl border p-4 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>Map file columns</p>
              <p className={`mt-1 text-xs ${muted}`}>The schema is ambiguous, so choose which fields represent the customer query and optional resolution.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className={`mb-1 block font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Query field</span>
                  <select
                    value={mapping.messageField}
                    onChange={(event) => setMapping((current) => ({ ...current, messageField: event.target.value }))}
                    className={`w-full rounded-xl border px-3 py-2 ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-slate-200" : "border-slate-200 bg-white text-slate-800"}`}
                  >
                    <option value="">Select a field</option>
                    {parseResult.mappingRequest.fieldOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className={`mb-1 block font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Resolution field</span>
                  <select
                    value={mapping.resolutionField}
                    onChange={(event) => setMapping((current) => ({ ...current, resolutionField: event.target.value }))}
                    className={`w-full rounded-xl border px-3 py-2 ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-slate-200" : "border-slate-200 bg-white text-slate-800"}`}
                  >
                    <option value="">No resolution field</option>
                    {parseResult.mappingRequest.fieldOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 space-y-1">
                {parseResult.mappingRequest.fieldOptions.slice(0, 6).map((option) => (
                  <p key={option.key} className={`text-xs ${muted}`}>
                    <span className="font-semibold">{option.label}:</span> {option.sample || "No sample value"}
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={applyMapping}
                disabled={!mapping.messageField}
                className="mt-4 rounded-xl bg-[#111827] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                Apply mapping
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startAnalysis}
              disabled={!parseResult || parseResult.entries.length === 0 || parseResult.needsMapping || isAnalyzing}
              className="rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {isAnalyzing ? "Analyzing..." : "Analyze queries"}
            </button>
            {progress ? (
              <p className={`text-sm ${muted}`}>
                {progress.currentLabel} ({progress.percent}%)
              </p>
            ) : null}
            {analysis ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-100 text-slate-700"}`}>
                {analysisModeLabel(analysis.analysisMode)} · {analysis.providerLabel}
              </span>
            ) : null}
          </div>

          {errorMessage ? (
            <div className={`mt-4 rounded-xl p-3 text-sm ${darkMode ? "bg-red-900/20 text-red-300" : "bg-amber-50 text-amber-800"}`}>
              {errorMessage}
            </div>
          ) : null}
        </div>

        {analysis ? (
          <div className="mt-5 space-y-5">
            {analysis.analysisMode === "deterministic_fallback" ? (
              <div className={`${card} p-4`}>
                <p className={`text-sm font-semibold ${darkMode ? "text-amber-300" : "text-amber-700"}`}>LLM unavailable. Deterministic fallback remained active without interrupting the upload.</p>
              </div>
            ) : null}

            {clusters.map((cluster) => {
              const isExpanded = expandedClusterId === cluster.id;
              const needsResolution = cluster.editedKnowledge.trim().length === 0;
              return (
                <div key={cluster.id} className={`${card} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${clusterBadgeTone(cluster.kind, darkMode)}`}>
                          {cluster.kind === "existing" ? "Matches existing memory" : "New canonical problem"}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${confidenceTone(cluster.confidence, darkMode)}`}>
                          {cluster.confidence} confidence
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-100 text-slate-700"}`}>
                          {cluster.count} quer{cluster.count === 1 ? "y" : "ies"}
                        </span>
                      </div>
                      <h3 className={`mt-3 text-lg font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{cluster.canonicalProblemTitle}</h3>
                      <p className={`mt-1 text-sm ${muted}`}>{cluster.problemSummary}</p>
                      {cluster.relatedKnowledgeTitle ? (
                        <p className={`mt-1 text-xs ${muted}`}>Existing memory: {cluster.relatedKnowledgeTitle}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedClusterId(isExpanded ? null : cluster.id)}
                      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${darkMode ? "border border-[#2d3f52] text-slate-300 hover:bg-[#111827]" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                    >
                      {isExpanded ? "Hide details" : "Edit proposed knowledge"}
                    </button>
                  </div>

                  <p className={`mt-3 text-sm ${muted}`}>{cluster.reasoning}</p>
                  <p className={`mt-2 text-xs ${muted}`}>You are validating this pattern and its resolution for all {cluster.count} uploaded quer{cluster.count === 1 ? "y" : "ies"}.</p>

                  <div className="mt-4">
                    <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Representative queries</p>
                    <div className="mt-2 space-y-2">
                      {cluster.sampleQueries.map((sample) => (
                        <div key={sample.entryId} className={`rounded-xl border p-3 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
                          <p className={`text-sm ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{sample.message}</p>
                          <button
                            type="button"
                            onClick={() => moveQueryToUnclustered(cluster.id, sample.entryId)}
                            className={`mt-2 text-xs font-semibold ${darkMode ? "text-amber-300" : "text-amber-700"}`}
                          >
                            Reassign / split to unclustered
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Proposed customer response</p>
                        {needsResolution ? (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${darkMode ? "bg-amber-900/30 text-amber-300" : "bg-amber-100 text-amber-700"}`}>
                            Resolution needed
                          </span>
                        ) : null}
                      </div>
                      <textarea
                        value={cluster.editedKnowledge}
                        onChange={(event) =>
                          setClusters((current) =>
                            current.map((item) =>
                              item.id === cluster.id
                                ? { ...item, editedKnowledge: event.target.value }
                                : item
                            )
                          )
                        }
                        rows={6}
                        className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-sm leading-6 outline-none transition focus:ring-2 focus:ring-blue-200 resize-y ${darkMode ? "bg-[#111827] border-[#2d3f52] text-slate-200" : "bg-white border-slate-200 text-slate-800"}`}
                        placeholder="Author or refine the response template that should represent this cluster."
                      />
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void commitCluster(cluster.id)}
                      disabled={cluster.status === "committed" || committingClusterId === cluster.id || needsResolution}
                      className="rounded-xl bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                    >
                      {cluster.status === "committed"
                        ? "Cluster committed"
                        : committingClusterId === cluster.id
                        ? "Committing..."
                        : "Validate & commit cluster"}
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectCluster(cluster.id)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${darkMode ? "border border-[#2d3f52] text-slate-300 hover:bg-[#111827]" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                    >
                      Reject cluster
                    </button>
                  </div>

                  {cluster.commitMessage ? (
                    <p className={`mt-3 text-xs ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>{cluster.commitMessage}</p>
                  ) : null}
                </div>
              );
            })}

            {unclustered ? (
              <div className={`${card} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${clusterBadgeTone("unclustered", darkMode)}`}>
                      Unclustered / low confidence
                    </span>
                    <h3 className={`mt-3 text-lg font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{unclustered.count} quer{unclustered.count === 1 ? "y" : "ies"} held for individual review</h3>
                    <p className={`mt-1 text-sm ${muted}`}>These queries were intentionally kept out of cluster validation. No organizational memory was created for them.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {unclustered.sampleQueries.map((sample) => (
                    <div key={sample.entryId} className={`rounded-xl border p-3 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
                      <p className={`text-sm ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{sample.message}</p>
                      <button
                        type="button"
                        onClick={() => onOpenSingleTicket(sample.message)}
                        className="mt-2 rounded-xl bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                      >
                        Open in single-ticket flow
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
