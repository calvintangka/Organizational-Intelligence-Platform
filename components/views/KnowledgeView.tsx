"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type {
  EmergingPattern,
  KnowledgeCandidate,
  KnowledgeItem,
  KnowledgePack,
  KnowledgePackCandidateDraft,
  KnowledgePackPreview,
  MemoryChangeRecord,
  ValidationRecord
} from "@/types";
import apiIntegrationsPack from "@/data/packs/api-integrations-v1.json";
import billingInvoicesPack from "@/data/packs/billing-invoices-v1.json";
import clientPortalPack from "@/data/packs/client-portal-v1.json";
import loginIssuesPack from "@/data/packs/login-issues-v1.json";
import shipmentIssuesPack from "@/data/packs/shipment-issues-v1.json";
import subscriptionTrialPack from "@/data/packs/subscription-trial-v1.json";
import { candidateToPackDraft, getKnowledgePackCategoryWarning, parseKnowledgePackText } from "@/lib/knowledgePacks";
import { MemoryNetworkOverlay } from "@/components/MemoryNetworkOverlay";

interface KnowledgeViewProps {
  knowledgeItems: KnowledgeItem[];
  knowledgeCandidates: KnowledgeCandidate[];
  emergingPatterns: EmergingPattern[];
  validationRecords: ValidationRecord[];
  memoryChangeRecords: MemoryChangeRecord[];
  darkMode: boolean;
  orgId: string;
  onPromote: (patternId: string) => void;
  onImportPack: (pack: KnowledgePack) => void;
  onValidatePackCandidate: (candidateId: string, draft: KnowledgePackCandidateDraft) => KnowledgeItem | null | Promise<KnowledgeItem | null>;
  onRejectPackCandidate: (candidateId: string) => void;
}

function TrustBadge({ score, darkMode }: { score: number; darkMode: boolean }) {
  const isAuto = score >= 80;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      isAuto
        ? darkMode ? "bg-emerald-900/60 text-emerald-300" : "bg-emerald-100 text-emerald-700"
        : darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
    }`}>
      Trust {score}
    </span>
  );
}

function VersionBadge({ count, darkMode }: { count: number; darkMode: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${darkMode ? "bg-blue-900/50 text-blue-300" : "bg-blue-50 text-blue-700"}`}>
      v{count}
    </span>
  );
}

function VersionTimeline({ count, darkMode }: { count: number; darkMode: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full ${
            i === count - 1
              ? "w-6 bg-[#2563EB]"
              : darkMode ? "w-4 bg-slate-600" : "w-4 bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

function MemoryNetwork({ items, darkMode, onExpand }: { items: KnowledgeItem[]; darkMode: boolean; onExpand: () => void }) {
  if (items.length === 0) return null;

  const positions = [
    { x: 55, y: 35 },
    { x: 20, y: 60 },
    { x: 80, y: 65 },
    { x: 40, y: 80 },
    { x: 65, y: 85 },
  ];

  const colors = ["#c7d2fe", "#bbf7d0", "#fde68a", "#ddd6fe"];

  return (
    <div
      className={`group cursor-pointer rounded-2xl border p-5 transition-colors ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52] hover:border-blue-500/40" : "bg-white border-slate-200 hover:border-blue-300"}`}
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onExpand(); }}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className={`font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Memory network</h2>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className={`transition-opacity ${darkMode ? "text-slate-500 group-hover:text-blue-400" : "text-slate-400 group-hover:text-blue-600"}`}
        >
          <path d="M6 2H2v4M14 2h-4m4 0v4M6 14H2v-4m12 4h-4m4 0v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="relative" style={{ height: "200px" }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {items.slice(0, 5).map((item, i) => {
            const pos = positions[i] ?? { x: 50, y: 50 };
            const nextPos = positions[(i + 1) % Math.min(items.length, 5)];
            return (
              <g key={item.id}>
                {i < items.length - 1 && (
                  <line
                    x1={pos.x} y1={pos.y} x2={nextPos.x} y2={nextPos.y}
                    stroke={darkMode ? "#2d3f52" : "#e2e8f0"} strokeWidth="0.5"
                  />
                )}
              </g>
            );
          })}
          {items.slice(0, 5).map((item, i) => {
            const pos = positions[i] ?? { x: 50, y: 50 };
            const title = (item.canonicalProblemTitle ?? item.title).split(" ").slice(0, 2).join(" ");
            return (
              <g key={item.id}>
                <ellipse cx={pos.x} cy={pos.y} rx="14" ry="8" fill={colors[i % colors.length]} opacity="0.8" />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" fontSize="3.5" fill="#374151" fontWeight="500">
                  {title}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className={`mt-1 text-center text-[10px] transition-opacity opacity-0 group-hover:opacity-100 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
        Click to expand
      </p>
    </div>
  );
}

function parseCsvLine(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const bundledPackPreviews = [
  { fileName: "data/packs/login-issues-v1.json", pack: loginIssuesPack as KnowledgePack },
  { fileName: "data/packs/billing-invoices-v1.json", pack: billingInvoicesPack as KnowledgePack },
  { fileName: "data/packs/subscription-trial-v1.json", pack: subscriptionTrialPack as KnowledgePack },
  { fileName: "data/packs/api-integrations-v1.json", pack: apiIntegrationsPack as KnowledgePack },
  { fileName: "data/packs/shipment-issues-v1.json", pack: shipmentIssuesPack as KnowledgePack },
  { fileName: "data/packs/client-portal-v1.json", pack: clientPortalPack as KnowledgePack }
];

export function KnowledgeView({
  knowledgeItems,
  knowledgeCandidates,
  emergingPatterns,
  validationRecords,
  memoryChangeRecords,
  darkMode,
  orgId,
  onPromote,
  onImportPack,
  onValidatePackCandidate,
  onRejectPackCandidate
}: KnowledgeViewProps) {
  const [networkOpen, setNetworkOpen] = useState(false);
  const [preview, setPreview] = useState<KnowledgePackPreview | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [reviewCandidateId, setReviewCandidateId] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<KnowledgePackCandidateDraft | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pendingPackCandidates = knowledgeCandidates.filter(
    (candidate) => candidate.status === "proposed" && candidate.proposedContent.importMetadata?.sourceType === "knowledge_pack"
  );
  const reviewingCandidate = pendingPackCandidates.find((candidate) => candidate.id === reviewCandidateId) ?? null;

  async function handlePackFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError("");
    setReviewCandidateId(null);
    setReviewDraft(null);
    try {
      const nextPreview = parseKnowledgePackText(await file.text());
      setPreview(nextPreview);
      setPreviewFileName(file.name);
    } catch (error) {
      setPreview(null);
      setPreviewFileName("");
      setImportError(error instanceof Error ? error.message : "Unable to read this knowledge pack.");
    } finally {
      event.target.value = "";
    }
  }

  function openReview(candidate: KnowledgeCandidate) {
    const draft = candidateToPackDraft(candidate);
    if (!draft) {
      setImportError("This candidate does not contain a valid knowledge pack payload.");
      return;
    }
    setImportError("");
    setPreview(null);
    setPreviewFileName("");
    setReviewCandidateId(candidate.id);
    setReviewDraft(draft);
  }

  async function validateReview() {
    if (!reviewCandidateId || !reviewDraft) return;
    setIsValidating(true);
    setImportError("");
    try {
      const result = await onValidatePackCandidate(reviewCandidateId, reviewDraft);
      if (result) {
        setReviewCandidateId(null);
        setReviewDraft(null);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Knowledge pack validation failed.");
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className={`text-xs font-bold uppercase tracking-widest ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>MEMORY</span>
          <h1 className={`mt-1 text-3xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>Organizational Memory</h1>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
            Living knowledge with trust, provenance, and version history.
          </p>
          {knowledgeItems.length > 0 && (
            <p className={`mt-2 text-sm font-semibold ${darkMode ? "text-slate-300" : "text-[#111827]"}`}>
              Canonical problems become reusable organizational knowledge
            </p>
          )}
        </div>
        <div className={`w-full max-w-sm rounded-2xl border p-4 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>Starter knowledge packs</p>
          <p className={`mt-1 text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>Import knowledge pack</p>
          <p className={`mt-1 text-xs leading-5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            JSON packs enter as pending candidates only. They do not become validated memory until a human approves them.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
            >
              Import knowledge pack
            </button>
            {bundledPackPreviews.map(({ fileName, pack }) => (
              <button
                key={pack.packId}
                type="button"
                onClick={() => {
                  setImportError("");
                  setPreview({
                    pack,
                    categoryWarning: getKnowledgePackCategoryWarning(pack)
                  });
                  setPreviewFileName(fileName);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                Preview {pack.packName}
              </button>
            ))}
            <span className={`self-center text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              {pendingPackCandidates.length} awaiting validation
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handlePackFileChange}
          />
        </div>
      </div>

      {importError && (
        <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${darkMode ? "border-rose-700/40 bg-rose-900/20 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {importError}
        </div>
      )}

      {preview && (
        <div className={`mb-6 rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>Preview</p>
              <h2 className={`mt-1 text-xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>{preview.pack.packName}</h2>
              <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{preview.pack.description}</p>
            </div>
            <div className={`rounded-xl px-3 py-2 text-xs ${darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-600"}`}>
              {previewFileName || `${preview.pack.packId}.json`}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className={`rounded-xl p-3 ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Canonical problem</p>
              <p className={`mt-1 text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>{preview.pack.canonicalProblem.title}</p>
              <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{preview.pack.canonicalProblem.category}</p>
            </div>
            <div className={`rounded-xl p-3 ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Version</p>
              <p className={`mt-1 text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>{preview.pack.version}</p>
              <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{preview.pack.author} - {preview.pack.language}</p>
            </div>
            <div className={`rounded-xl p-3 ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Lessons</p>
              <p className={`mt-1 text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>{preview.pack.lessons.length} lesson{preview.pack.lessons.length !== 1 ? "s" : ""}</p>
              <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Nothing is created until you import as candidates.</p>
            </div>
          </div>
          {preview.categoryWarning && (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${darkMode ? "border-amber-700/40 bg-amber-900/20 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {preview.categoryWarning}
            </div>
          )}
          <div className="mt-4 space-y-2">
            {preview.pack.lessons.map((lesson, index) => (
              <div key={`${lesson.title}-${index}`} className={`rounded-xl border p-3 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>{lesson.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${darkMode ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                    {lesson.signals.length} signals
                  </span>
                </div>
                <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{lesson.rootCause}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onImportPack(preview.pack);
                setPreview(null);
                setPreviewFileName("");
              }}
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
            >
              Import as candidates
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setPreviewFileName("");
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {reviewingCandidate && reviewDraft && (
        <div className={`mb-6 rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-amber-400" : "text-amber-700"}`}>Pending validation</p>
              <h2 className={`mt-1 text-xl font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>
                {reviewingCandidate.proposedContent.importMetadata?.packName ?? reviewDraft.canonicalProblemTitle}
              </h2>
              <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                Review the canonical problem and lessons, edit wording if needed, remove lessons that should not be committed, then validate through the shared memory path.
              </p>
            </div>
            <span className={`rounded-full border border-dashed px-3 py-1 text-xs font-semibold ${darkMode ? "border-amber-600 text-amber-300" : "border-amber-300 text-amber-700"}`}>
              Imported - awaiting validation
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Canonical problem title</span>
              <input
                type="text"
                value={reviewDraft.canonicalProblemTitle}
                onChange={(e) => setReviewDraft((prev) => prev ? { ...prev, canonicalProblemTitle: e.target.value } : prev)}
                className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#111827] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
              />
            </label>
            <label className="block">
              <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Category</span>
              <input
                type="text"
                value={reviewDraft.category}
                onChange={(e) => setReviewDraft((prev) => prev ? { ...prev, category: e.target.value } : prev)}
                className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#111827] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Problem summary</span>
            <textarea
              value={reviewDraft.problemSummary}
              onChange={(e) => setReviewDraft((prev) => prev ? { ...prev, problemSummary: e.target.value } : prev)}
              rows={3}
              className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#111827] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
            />
          </label>

          <label className="mt-3 block">
            <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Internal guidance</span>
            <textarea
              value={reviewDraft.internalGuidance}
              onChange={(e) => setReviewDraft((prev) => prev ? { ...prev, internalGuidance: e.target.value } : prev)}
              rows={3}
              className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#111827] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
            />
          </label>

          <label className="mt-3 block">
            <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Fallback customer response template</span>
            <textarea
              value={reviewDraft.customerResponseTemplate}
              onChange={(e) => setReviewDraft((prev) => prev ? { ...prev, customerResponseTemplate: e.target.value } : prev)}
              rows={5}
              className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#111827] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
            />
          </label>

          <div className="mt-4 space-y-3">
            {reviewDraft.lessons.map((lesson, index) => (
              <details key={lesson.id} className={`rounded-xl border ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-200 bg-slate-50"}`} open>
                <summary className={`cursor-pointer list-none px-4 py-3 ${darkMode ? "text-white" : "text-[#111827]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{index + 1}. {lesson.title ?? lesson.rootCause}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-700"}`}>
                      {lesson.signals.length} signals
                    </span>
                  </div>
                </summary>
                <div className={`space-y-3 border-t px-4 py-4 ${darkMode ? "border-[#2d3f52]" : "border-slate-200"}`}>
                  <label className="block">
                    <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Lesson title</span>
                    <input
                      type="text"
                      value={lesson.title ?? ""}
                      onChange={(e) => setReviewDraft((prev) => prev ? ({
                        ...prev,
                        lessons: prev.lessons.map((entry, lessonIndex) =>
                          lessonIndex === index ? { ...entry, title: e.target.value } : entry
                        )
                      }) : prev)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
                    />
                  </label>
                  <label className="block">
                    <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Root cause</span>
                    <input
                      type="text"
                      value={lesson.rootCause}
                      onChange={(e) => setReviewDraft((prev) => prev ? ({
                        ...prev,
                        lessons: prev.lessons.map((entry, lessonIndex) =>
                          lessonIndex === index ? { ...entry, rootCause: e.target.value } : entry
                        )
                      }) : prev)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
                    />
                  </label>
                  <label className="block">
                    <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Solution</span>
                    <textarea
                      value={lesson.solution}
                      onChange={(e) => setReviewDraft((prev) => prev ? ({
                        ...prev,
                        lessons: prev.lessons.map((entry, lessonIndex) =>
                          lessonIndex === index ? { ...entry, solution: e.target.value } : entry
                        )
                      }) : prev)}
                      rows={3}
                      className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
                    />
                  </label>
                  <label className="block">
                    <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Customer response</span>
                    <textarea
                      value={lesson.customerResponse}
                      onChange={(e) => setReviewDraft((prev) => prev ? ({
                        ...prev,
                        lessons: prev.lessons.map((entry, lessonIndex) =>
                          lessonIndex === index ? { ...entry, customerResponse: e.target.value } : entry
                        )
                      }) : prev)}
                      rows={7}
                      className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
                    />
                  </label>
                  <label className="block">
                    <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Signals (comma separated)</span>
                    <input
                      type="text"
                      value={lesson.signals.join(", ")}
                      onChange={(e) => setReviewDraft((prev) => prev ? ({
                        ...prev,
                        lessons: prev.lessons.map((entry, lessonIndex) =>
                          lessonIndex === index ? { ...entry, signals: parseCsvLine(e.target.value) } : entry
                        )
                      }) : prev)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
                    />
                  </label>
                  <label className="block">
                    <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>When to escalate</span>
                    <textarea
                      value={lesson.whenToEscalate ?? ""}
                      onChange={(e) => setReviewDraft((prev) => prev ? ({
                        ...prev,
                        lessons: prev.lessons.map((entry, lessonIndex) =>
                          lessonIndex === index ? { ...entry, whenToEscalate: e.target.value } : entry
                        )
                      }) : prev)}
                      rows={2}
                      className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
                    />
                  </label>
                  <label className="block">
                    <span className={`mb-1 block text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>Do not promise (comma separated)</span>
                    <input
                      type="text"
                      value={(lesson.doNotPromise ?? []).join(", ")}
                      onChange={(e) => setReviewDraft((prev) => prev ? ({
                        ...prev,
                        lessons: prev.lessons.map((entry, lessonIndex) =>
                          lessonIndex === index ? { ...entry, doNotPromise: parseCsvLine(e.target.value) } : entry
                        )
                      }) : prev)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-[#2d3f52] bg-[#0f172a] text-white" : "border-slate-200 bg-white text-[#111827]"}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setReviewDraft((prev) => prev ? ({
                      ...prev,
                      lessons: prev.lessons.filter((_, lessonIndex) => lessonIndex !== index)
                    }) : prev)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${darkMode ? "bg-rose-900/30 text-rose-200 hover:bg-rose-900/50" : "bg-rose-50 text-rose-700 hover:bg-rose-100"}`}
                  >
                    Remove lesson
                  </button>
                </div>
              </details>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={validateReview}
              disabled={isValidating}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isValidating ? "Validating..." : "Validate & commit to organizational memory"}
            </button>
            <button
              type="button"
              onClick={() => {
                onRejectPackCandidate(reviewingCandidate.id);
                setReviewCandidateId(null);
                setReviewDraft(null);
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${darkMode ? "bg-rose-900/30 text-rose-200 hover:bg-rose-900/50" : "bg-rose-50 text-rose-700 hover:bg-rose-100"}`}
            >
              Reject pack
            </button>
            <button
              type="button"
              onClick={() => {
                setReviewCandidateId(null);
                setReviewDraft(null);
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              Close review
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {pendingPackCandidates.length > 0 && (
            <div className={`rounded-2xl border border-dashed p-5 ${darkMode ? "border-amber-600/50 bg-amber-900/10" : "border-amber-300 bg-amber-50/70"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-amber-400" : "text-amber-700"}`}>Pending validation</p>
                  <p className={`mt-1 text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>Imported packs are waiting for human review</p>
                </div>
                <span className={`rounded-full border border-dashed px-3 py-1 text-xs font-semibold ${darkMode ? "border-amber-600 text-amber-300" : "border-amber-300 text-amber-700"}`}>
                  Imported - awaiting validation
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {pendingPackCandidates.map((candidate) => {
                  const lessons = candidate.proposedContent.lessons ?? [];
                  const metadata = candidate.proposedContent.importMetadata;
                  return (
                    <div key={candidate.id} className={`rounded-xl border border-dashed p-4 ${darkMode ? "border-[#2d3f52] bg-[#111827]" : "border-slate-300 bg-white"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>
                            {candidate.proposedContent.canonicalProblemTitle ?? metadata?.packName ?? candidate.id}
                          </p>
                          <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                            {metadata?.sourceLabel ?? "knowledge_pack"} - {lessons.length} lesson{lessons.length !== 1 ? "s" : ""} - category {candidate.proposedContent.category ?? "Unspecified"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openReview(candidate)}
                            className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
                          >
                            Review & validate pack
                          </button>
                          <button
                            type="button"
                            onClick={() => onRejectPackCandidate(candidate.id)}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${darkMode ? "bg-rose-900/30 text-rose-200 hover:bg-rose-900/50" : "bg-rose-50 text-rose-700 hover:bg-rose-100"}`}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {lessons.map((lesson) => (
                          <div key={lesson.id} className={`rounded-lg px-3 py-2 text-xs ${darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                    <span className="font-semibold">{lesson.title ?? lesson.rootCause}</span>
                            <span className={`ml-2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                              {lesson.signals.length} signals
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {knowledgeItems.length === 0 ? (
            <div className={`rounded-2xl border border-dashed p-12 text-center ${darkMode ? "border-[#2d3f52]" : "border-slate-300"}`}>
              <p className={`font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>No validated organizational memory yet</p>
              <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                Imported packs stay pending here until a human validates them into memory.
              </p>
            </div>
          ) : (
            <>
              {knowledgeItems.map((item) => {
                const trust = item.trustScore ?? 20;
                const versionCount = (item.knowledgeVersions?.length ?? 0) || 1;
                const tickets = item.exampleTickets?.length ?? 0;
                const lastUpdated = item.lastUpdated ?? item.lastValidated ?? item.approvedAt ?? item.createdAt;
                const itemValidations = validationRecords.filter((record) => record.knowledgeId === item.id);
                const itemChanges = memoryChangeRecords.filter((record) => record.knowledgeId === item.id);
                const dateStr = lastUpdated
                  ? new Date(lastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                  : "-";

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-5 ${darkMode ? "bg-[#1a2b3c] border-[#2d3f52]" : "bg-white border-slate-200"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className={`text-lg font-bold ${darkMode ? "text-white" : "text-[#111827]"}`}>
                          {item.canonicalProblemTitle ?? item.title}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <TrustBadge score={trust} darkMode={darkMode} />
                          <VersionBadge count={versionCount} darkMode={darkMode} />
                          <span className={`text-xs ${darkMode ? "text-slate-400" : "text-[#667085]"}`}>
                            {tickets} supporting ticket{tickets !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <p className={`text-xs font-semibold ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Version timeline</p>
                      <VersionTimeline count={versionCount} darkMode={darkMode} />
                    </div>

                    <p className={`mt-3 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                      Provenance verified - Last updated {dateStr}
                    </p>

                    {item.customerResponseTemplate && (
                      <details className="mt-3">
                        <summary className={`cursor-pointer text-xs font-semibold ${darkMode ? "text-blue-400" : "text-[#2563EB]"} hover:underline`}>
                          View knowledge details
                        </summary>
                        <div className="mt-3 space-y-3">
                          {item.internalGuidance && (
                            <div>
                              <p className={`mb-1 text-xs font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Internal guidance</p>
                              <p className={`rounded-lg p-3 text-xs leading-5 ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                                {item.internalGuidance}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className={`mb-1 text-xs font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Customer response template</p>
                            <p className={`rounded-lg p-3 whitespace-pre-line text-xs leading-5 ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                              {item.customerResponseTemplate}
                            </p>
                          </div>
                          {item.knowledgeVersions && item.knowledgeVersions.length > 1 && (
                            <div>
                              <p className={`mb-1 text-xs font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Version history</p>
                              <div className="space-y-1">
                                {item.knowledgeVersions.map((v) => (
                                  <div key={v.versionId} className={`rounded-lg p-2 text-xs ${darkMode ? "bg-[#111827]" : "bg-slate-50"}`}>
                                    <span className={`font-semibold ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>v{v.version ?? v.versionId}</span>
                                    {v.changeReason && <span className={`ml-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{v.changeReason}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <p className={`mb-1 text-xs font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Validation history</p>
                            {itemValidations.length === 0 ? (
                              <p className={`rounded-lg p-3 text-xs ${darkMode ? "bg-[#111827] text-slate-400" : "bg-slate-50 text-slate-500"}`}>
                                No validation records found for this item.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {itemValidations.slice(-4).map((record) => (
                                  <div key={record.id} className={`rounded-lg p-2 text-xs ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                                    <span className={`font-semibold ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>{record.decision}</span>
                                    <span className="ml-2">{record.actor} as {record.roleExercised}</span>
                                    <span className={`ml-2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                      {new Date(record.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className={`mb-1 text-xs font-bold uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Memory change history</p>
                            {itemChanges.length === 0 ? (
                              <p className={`rounded-lg p-3 text-xs ${darkMode ? "bg-[#111827] text-slate-400" : "bg-slate-50 text-slate-500"}`}>
                                No memory change records found for this item.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {itemChanges.slice(-4).map((record) => (
                                  <div key={record.id} className={`rounded-lg p-2 text-xs ${darkMode ? "bg-[#111827] text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                                    <span className={`font-semibold ${darkMode ? "text-blue-400" : "text-[#2563EB]"}`}>{record.changeType}</span>
                                    <span className="ml-2">Candidate {record.candidateId.slice(-8)}</span>
                                    <span className={`ml-2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                      before: {record.beforeState ? "snapshot" : "none"} / after: snapshot
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {item.lessons && item.lessons.length > 0 && (
                            <div>
                              <p className={`mb-1 text-xs font-bold uppercase tracking-wide ${darkMode ? "text-amber-400" : "text-amber-700"}`}>Lessons learned</p>
                              <div className="space-y-2">
                                {item.lessons.map((lesson) => (
                                  <div key={lesson.id} className={`rounded-lg border p-3 ${darkMode ? "border-amber-700/30 bg-amber-900/20" : "border-amber-200 bg-amber-50"}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <p className={`text-xs font-semibold ${darkMode ? "text-amber-300" : "text-amber-800"}`}>{lesson.title ?? lesson.rootCause}</p>
                                      <span className={`flex-shrink-0 text-[10px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                        {new Date(lesson.createdAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <p className={`mt-1 text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{lesson.solution}</p>
                                    {lesson.whenToEscalate && (
                                      <p className={`mt-2 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                        Escalate when: {lesson.whenToEscalate}
                                      </p>
                                    )}
                                    {lesson.doNotPromise && lesson.doNotPromise.length > 0 && (
                                      <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                        Do not promise: {lesson.doNotPromise.join(", ")}
                                      </p>
                                    )}
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {lesson.signals.map((signal) => (
                                        <span key={signal} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${darkMode ? "bg-amber-900/40 text-amber-300" : "bg-amber-100 text-amber-700"}`}>
                                          {signal}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}

              {emergingPatterns.filter((p) => p.status === "suggested" && p.suggestedCanonicalProblem).length > 0 && (
                <div className={`rounded-2xl border p-5 ${darkMode ? "bg-amber-900/20 border-amber-700/30" : "bg-amber-50 border-amber-200"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wide ${darkMode ? "text-amber-400" : "text-amber-700"}`}>Emerging patterns</p>
                  <p className={`mt-1 font-semibold ${darkMode ? "text-white" : "text-[#111827]"}`}>Patterns ready for promotion</p>
                  <div className="mt-3 space-y-2">
                    {emergingPatterns.filter((p) => p.status === "suggested" && p.suggestedCanonicalProblem).map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`text-sm font-medium ${darkMode ? "text-slate-200" : "text-[#111827]"}`}>{p.title}</p>
                          <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{p.confidenceScore}% confidence - {p.timesSeen} tickets</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPromote(p.id)}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
                        >
                          Promote
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <MemoryNetwork items={knowledgeItems} darkMode={darkMode} onExpand={() => setNetworkOpen(true)} />
        </div>
      </div>

      {networkOpen && knowledgeItems.length > 0 && (
        <MemoryNetworkOverlay
          items={knowledgeItems}
          darkMode={darkMode}
          orgId={orgId}
          onClose={() => setNetworkOpen(false)}
        />
      )}
    </div>
  );
}
