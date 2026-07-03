"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KnowledgeItem } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NodePos {
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
  label: string;
}

interface Props {
  items: KnowledgeItem[];
  darkMode: boolean;
  orgId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_W = 180;
const NODE_H = 72;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const HINT_TIMEOUT = 4000;
const STORAGE_PREFIX = "oip.memoryNetwork.positions.";
const INSPECTOR_W = 320;

// ---------------------------------------------------------------------------
// Position persistence
// ---------------------------------------------------------------------------

function loadPositions(orgId: string): Record<string, NodePos> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + orgId);
    return raw ? (JSON.parse(raw) as Record<string, NodePos>) : {};
  } catch {
    return {};
  }
}

function savePositions(orgId: string, positions: Record<string, NodePos>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + orgId, JSON.stringify(positions));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Layout — simple radial for small counts, grid fallback for larger
// ---------------------------------------------------------------------------

function initialLayout(
  items: KnowledgeItem[],
  saved: Record<string, NodePos>,
  canvasW: number,
  canvasH: number,
): Record<string, NodePos> {
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const out: Record<string, NodePos> = {};
  const unsaved: KnowledgeItem[] = [];

  for (const item of items) {
    if (saved[item.id]) {
      out[item.id] = saved[item.id];
    } else {
      unsaved.push(item);
    }
  }

  if (unsaved.length === 0) return out;

  // If all items are new, do a full radial/grid layout
  const toLayout = Object.keys(out).length === 0 ? items : unsaved;
  const layoutCx = Object.keys(out).length === 0 ? cx : cx + 200;
  const layoutCy = Object.keys(out).length === 0 ? cy : cy;

  if (toLayout.length === 1) {
    out[toLayout[0].id] = { x: layoutCx - NODE_W / 2, y: layoutCy - NODE_H / 2 };
  } else if (toLayout.length <= 8) {
    const radius = Math.min(canvasW, canvasH) * 0.28;
    toLayout.forEach((item, i) => {
      const angle = (2 * Math.PI * i) / toLayout.length - Math.PI / 2;
      out[item.id] = {
        x: layoutCx + radius * Math.cos(angle) - NODE_W / 2,
        y: layoutCy + radius * Math.sin(angle) - NODE_H / 2,
      };
    });
  } else {
    const cols = Math.ceil(Math.sqrt(toLayout.length));
    const gap = 40;
    toLayout.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      out[item.id] = {
        x: layoutCx - ((cols * (NODE_W + gap)) / 2) + col * (NODE_W + gap),
        y: layoutCy - 200 + row * (NODE_H + gap),
      };
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Edge derivation
// ---------------------------------------------------------------------------

function deriveEdges(items: KnowledgeItem[]): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key)) continue;

      // Same canonical problem
      if (a.canonicalProblemId && a.canonicalProblemId === b.canonicalProblemId) {
        seen.add(key);
        edges.push({ from: a.id, to: b.id, label: "Same canonical" });
        continue;
      }

      // Same category
      if (a.category && a.category === b.category) {
        seen.add(key);
        edges.push({ from: a.id, to: b.id, label: "Related category" });
        continue;
      }

      // Shared tags (2+ overlap)
      const sharedTags = a.tags.filter((t) => b.tags.includes(t));
      if (sharedTags.length >= 2) {
        seen.add(key);
        edges.push({ from: a.id, to: b.id, label: `Tags: ${sharedTags.slice(0, 2).join(", ")}` });
      }
    }
  }

  return edges;
}

// ---------------------------------------------------------------------------
// Trust color helpers
// ---------------------------------------------------------------------------

function trustColor(score: number): string {
  if (score >= 71) return "#34d399"; // emerald-400
  if (score >= 41) return "#fbbf24"; // amber-400
  return "#94a3b8"; // slate-400
}

function trustBg(score: number): string {
  if (score >= 71) return "rgba(52,211,153,0.15)";
  if (score >= 41) return "rgba(251,191,36,0.15)";
  return "rgba(148,163,184,0.15)";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemoryNetworkOverlay({ items, darkMode, orgId, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Canvas state
  const [positions, setPositions] = useState<Record<string, NodePos>>({});
  const [pan, setPan] = useState<NodePos>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Interaction state
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);

  // Drag tracking refs (avoid stale closures)
  const dragStart = useRef<{ x: number; y: number; nodeX: number; nodeY: number }>({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });

  const edges = useMemo(() => deriveEdges(items), [items]);

  // Initialize positions on mount
  useEffect(() => {
    const saved = loadPositions(orgId);
    const w = window.innerWidth - 256; // sidebar
    const h = window.innerHeight;
    const pos = initialLayout(items, saved, w, h);
    setPositions(pos);

    // Fit-to-view: compute bounding box and set pan/zoom
    const xs = Object.values(pos).map((p) => p.x);
    const ys = Object.values(pos).map((p) => p.y);
    if (xs.length > 0) {
      const minX = Math.min(...xs) - 60;
      const maxX = Math.max(...xs) + NODE_W + 60;
      const minY = Math.min(...ys) - 60;
      const maxY = Math.max(...ys) + NODE_H + 60;
      const bw = maxX - minX;
      const bh = maxY - minY;
      const scaleX = w / bw;
      const scaleY = h / bh;
      const s = Math.min(scaleX, scaleY, 1.2);
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s));
      setZoom(clampedZoom);
      setPan({
        x: (w - bw * clampedZoom) / 2 - minX * clampedZoom,
        y: (h - bh * clampedZoom) / 2 - minY * clampedZoom,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save positions whenever they change (debounced by user action)
  const saveRef = useRef(positions);
  saveRef.current = positions;
  useEffect(() => {
    return () => { savePositions(orgId, saveRef.current); };
  }, [orgId]);

  // Hint auto-hide
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), HINT_TIMEOUT);
    return () => clearTimeout(t);
  }, []);

  // Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedNode) {
          setSelectedNode(null);
        } else {
          savePositions(orgId, positions);
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, orgId, positions, selectedNode]);

  // ---- Mouse handlers ----

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDraggingNode(id);
    const pos = positions[id] ?? { x: 0, y: 0 };
    dragStart.current = { x: e.clientX, y: e.clientY, nodeX: pos.x, nodeY: pos.y };
  }, [positions]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (draggingNode) return;
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [draggingNode, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingNode) {
      const dx = (e.clientX - dragStart.current.x) / zoom;
      const dy = (e.clientY - dragStart.current.y) / zoom;
      setPositions((prev) => ({
        ...prev,
        [draggingNode]: {
          x: dragStart.current.nodeX + dx,
          y: dragStart.current.nodeY + dy,
        },
      }));
    } else if (panning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    }
  }, [draggingNode, panning, zoom]);

  const handleMouseUp = useCallback(() => {
    if (draggingNode) {
      savePositions(orgId, positions);
    }
    setDraggingNode(null);
    setPanning(false);
  }, [draggingNode, orgId, positions]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * delta));
    const ratio = newZoom / zoom;
    setPan({
      x: mx - (mx - pan.x) * ratio,
      y: my - (my - pan.y) * ratio,
    });
    setZoom(newZoom);
  }, [zoom, pan]);

  const handleNodeClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Only open inspector if it wasn't a drag
    const dx = Math.abs(e.clientX - dragStart.current.x);
    const dy = Math.abs(e.clientY - dragStart.current.y);
    if (dx < 5 && dy < 5) {
      setSelectedNode(id);
    }
  }, []);

  // ---- Derived ----

  const connectionCount = edges.length;
  const selectedItem = selectedNode ? items.find((i) => i.id === selectedNode) : null;

  // Edges with connected node IDs
  const connectedToHovered = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const s = new Set<string>();
    for (const e of edges) {
      if (e.from === hoveredNode) s.add(e.to);
      if (e.to === hoveredNode) s.add(e.from);
    }
    return s;
  }, [hoveredNode, edges]);

  // ---- Render ----

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] flex"
      style={{ fontFamily: "inherit" }}
    >
      {/* Sidebar spacer — transparent, lets sidebar clicks through */}
      <div className="w-64 shrink-0 pointer-events-none" />

      {/* Main overlay area */}
      <div
        className="flex-1 flex flex-col relative"
        style={{
          backgroundColor: darkMode ? "#0f1a27" : "#f1f5f9",
          animation: "memnet-fadein 200ms ease-out",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0 border-b"
          style={{
            backgroundColor: darkMode ? "#111d2e" : "#ffffff",
            borderColor: darkMode ? "#2d3f52" : "#e2e8f0",
          }}
        >
          <div>
            <h2 className="text-xl font-bold" style={{ color: darkMode ? "#ffffff" : "#111827" }}>
              Memory Network
            </h2>
            <p className="text-xs mt-0.5" style={{ color: darkMode ? "#94a3b8" : "#667085" }}>
              {items.length} knowledge item{items.length !== 1 ? "s" : ""} · {connectionCount} connection{connectionCount !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { savePositions(orgId, positions); onClose(); }}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
            style={{
              backgroundColor: darkMode ? "#1a2b3c" : "#f1f5f9",
              color: darkMode ? "#94a3b8" : "#667085",
            }}
            aria-label="Close memory network"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden select-none"
          style={{ cursor: panning ? "grabbing" : draggingNode ? "grabbing" : "grab" }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className="absolute inset-0"
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {edges.map((edge) => {
                const fromPos = positions[edge.from];
                const toPos = positions[edge.to];
                if (!fromPos || !toPos) return null;
                const x1 = fromPos.x + NODE_W / 2;
                const y1 = fromPos.y + NODE_H / 2;
                const x2 = toPos.x + NODE_W / 2;
                const y2 = toPos.y + NODE_H / 2;

                const isHighlighted =
                  hoveredNode === edge.from || hoveredNode === edge.to;
                const isDimmed = hoveredNode && !isHighlighted;

                return (
                  <g key={`${edge.from}-${edge.to}`}>
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={isHighlighted
                        ? (darkMode ? "#60a5fa" : "#2563EB")
                        : (darkMode ? "#2d3f52" : "#cbd5e1")}
                      strokeWidth={isHighlighted ? 2 : 1}
                      opacity={isDimmed ? 0.15 : 0.6}
                    />
                    {/* Small dot at target end */}
                    <circle
                      cx={x2}
                      cy={y2}
                      r={3}
                      fill={isHighlighted
                        ? (darkMode ? "#60a5fa" : "#2563EB")
                        : (darkMode ? "#2d3f52" : "#cbd5e1")}
                      opacity={isDimmed ? 0.15 : 0.6}
                    />
                    {/* Edge label at midpoint */}
                    {isHighlighted && (
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 8}
                        textAnchor="middle"
                        fontSize="10"
                        fill={darkMode ? "#94a3b8" : "#667085"}
                        fontWeight="500"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {items.map((item) => {
                const pos = positions[item.id];
                if (!pos) return null;
                const trust = item.trustScore ?? 20;
                const versionCount = (item.knowledgeVersions?.length ?? 0) || 1;
                const title = (item.canonicalProblemTitle ?? item.title);
                const isHovered = hoveredNode === item.id;
                const isSelected = selectedNode === item.id;
                const isConnected = connectedToHovered.has(item.id);
                const isDimmed = hoveredNode !== null && !isHovered && !isConnected;

                return (
                  <g
                    key={item.id}
                    transform={`translate(${pos.x},${pos.y})`}
                    style={{
                      cursor: draggingNode === item.id ? "grabbing" : "pointer",
                      opacity: isDimmed ? 0.25 : 1,
                      transition: draggingNode ? "none" : "opacity 200ms ease",
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(e, item.id)}
                    onMouseUp={(e) => handleNodeClick(e, item.id)}
                    onMouseEnter={() => setHoveredNode(item.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {/* Glow behind selected/hovered */}
                    {(isHovered || isSelected) && (
                      <rect
                        x={-4}
                        y={-4}
                        width={NODE_W + 8}
                        height={NODE_H + 8}
                        rx={16}
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth={2}
                        opacity={0.5}
                        filter="url(#glow)"
                      />
                    )}

                    {/* Card body */}
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={12}
                      fill={darkMode ? "#1a2b3c" : "#ffffff"}
                      stroke={isHovered || isSelected
                        ? "#2563EB"
                        : (darkMode ? "#2d3f52" : "#e2e8f0")}
                      strokeWidth={isHovered || isSelected ? 1.5 : 1}
                    />

                    {/* Title */}
                    <text
                      x={12}
                      y={24}
                      fontSize="12"
                      fontWeight="600"
                      fill={darkMode ? "#ffffff" : "#111827"}
                    >
                      {title.length > 20 ? title.slice(0, 18) + "…" : title}
                    </text>

                    {/* Trust badge */}
                    <rect
                      x={12}
                      y={38}
                      width={52}
                      height={20}
                      rx={10}
                      fill={trustBg(trust)}
                    />
                    <text
                      x={38}
                      y={52}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={trustColor(trust)}
                    >
                      Trust {trust}
                    </text>

                    {/* Version badge */}
                    <rect
                      x={70}
                      y={38}
                      width={30}
                      height={20}
                      rx={10}
                      fill={darkMode ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.1)"}
                    />
                    <text
                      x={85}
                      y={52}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={darkMode ? "#60a5fa" : "#2563EB"}
                    >
                      v{versionCount}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* SVG filter for glow */}
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          </svg>
        </div>

        {/* Navigation hint */}
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none transition-opacity duration-500"
          style={{
            opacity: showHint ? 1 : 0,
          }}
        >
          <div
            className="rounded-xl px-5 py-2.5 text-xs font-medium"
            style={{
              backgroundColor: darkMode ? "rgba(26,43,60,0.9)" : "rgba(255,255,255,0.9)",
              color: darkMode ? "#94a3b8" : "#667085",
              border: `1px solid ${darkMode ? "#2d3f52" : "#e2e8f0"}`,
              backdropFilter: "blur(8px)",
            }}
          >
            Scroll to zoom · Drag to pan · Click a node to inspect
          </div>
        </div>

        {/* Inspector panel */}
        {selectedItem && (
          <InspectorPanel
            item={selectedItem}
            darkMode={darkMode}
            onClose={() => setSelectedNode(null)}
            onViewDetails={() => {
              savePositions(orgId, positions);
              onClose();
            }}
          />
        )}
      </div>

      {/* Fade-in keyframe */}
      <style>{`
        @keyframes memnet-fadein {
          from { opacity: 0; transform: scale(0.98); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes memnet-slide-in {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}

// ---------------------------------------------------------------------------
// Inspector side-panel
// ---------------------------------------------------------------------------

function InspectorPanel({
  item,
  darkMode,
  onClose,
  onViewDetails,
}: {
  item: KnowledgeItem;
  darkMode: boolean;
  onClose: () => void;
  onViewDetails: () => void;
}) {
  const trust = item.trustScore ?? 20;
  const versionCount = (item.knowledgeVersions?.length ?? 0) || 1;
  const tickets = item.exampleTickets?.length ?? 0;
  const lastUpdated = item.lastUpdated ?? item.lastValidated ?? item.approvedAt ?? item.createdAt;
  const dateStr = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <div
      className="absolute top-0 right-0 h-full flex flex-col border-l"
      style={{
        width: INSPECTOR_W,
        backgroundColor: darkMode ? "#111d2e" : "#ffffff",
        borderColor: darkMode ? "#2d3f52" : "#e2e8f0",
        animation: "memnet-slide-in 200ms ease-out",
      }}
    >
      {/* Inspector header */}
      <div className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: darkMode ? "#2d3f52" : "#e2e8f0" }}
      >
        <p className="text-xs font-bold uppercase tracking-widest"
          style={{ color: darkMode ? "#60a5fa" : "#2563EB" }}
        >
          Node inspector
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
          style={{
            backgroundColor: darkMode ? "#1a2b3c" : "#f1f5f9",
            color: darkMode ? "#94a3b8" : "#667085",
          }}
          aria-label="Close inspector"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Inspector body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Title */}
        <h3 className="text-lg font-bold" style={{ color: darkMode ? "#ffffff" : "#111827" }}>
          {item.canonicalProblemTitle ?? item.title}
        </h3>

        {/* Problem summary */}
        {item.problemSummary && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ color: darkMode ? "#64748b" : "#94a3b8" }}
            >
              Canonical problem
            </p>
            <p className="text-sm leading-relaxed"
              style={{ color: darkMode ? "#cbd5e1" : "#374151" }}
            >
              {item.problemSummary}
            </p>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCell label="Trust score" darkMode={darkMode}>
            <span className="text-lg font-bold" style={{ color: trustColor(trust) }}>
              {trust}
            </span>
          </StatCell>
          <StatCell label="Version" darkMode={darkMode}>
            <span className="text-lg font-bold" style={{ color: darkMode ? "#60a5fa" : "#2563EB" }}>
              v{versionCount}
            </span>
          </StatCell>
          <StatCell label="Tickets" darkMode={darkMode}>
            <span className="text-lg font-bold" style={{ color: darkMode ? "#ffffff" : "#111827" }}>
              {tickets}
            </span>
          </StatCell>
          <StatCell label="Last updated" darkMode={darkMode}>
            <span className="text-xs font-semibold" style={{ color: darkMode ? "#cbd5e1" : "#374151" }}>
              {dateStr}
            </span>
          </StatCell>
        </div>

        {/* Category */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
            style={{ color: darkMode ? "#64748b" : "#94a3b8" }}
          >
            Category
          </p>
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: darkMode ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.1)",
              color: darkMode ? "#60a5fa" : "#2563EB",
            }}
          >
            {item.category}
          </span>
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ color: darkMode ? "#64748b" : "#94a3b8" }}
            >
              Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: darkMode ? "#1a2b3c" : "#f1f5f9",
                    color: darkMode ? "#94a3b8" : "#667085",
                    border: `1px solid ${darkMode ? "#2d3f52" : "#e2e8f0"}`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* View full details link */}
      <div className="px-5 py-4 border-t" style={{ borderColor: darkMode ? "#2d3f52" : "#e2e8f0" }}>
        <button
          type="button"
          onClick={onViewDetails}
          className="w-full rounded-xl py-2.5 text-sm font-semibold transition-colors text-center"
          style={{
            backgroundColor: darkMode ? "#1a2b3c" : "#f1f5f9",
            color: darkMode ? "#60a5fa" : "#2563EB",
            border: `1px solid ${darkMode ? "#2d3f52" : "#e2e8f0"}`,
          }}
        >
          View full details →
        </button>
      </div>
    </div>
  );
}

function StatCell({
  label,
  darkMode,
  children,
}: {
  label: string;
  darkMode: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        backgroundColor: darkMode ? "#1a2b3c" : "#f8fafc",
        border: `1px solid ${darkMode ? "#2d3f52" : "#e2e8f0"}`,
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
        style={{ color: darkMode ? "#64748b" : "#94a3b8" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}
