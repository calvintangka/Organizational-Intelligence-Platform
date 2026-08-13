"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from "react";

export const FLYWHEEL_STAGES = [
  { key: "analyze", label: "ANALYZE" },
  { key: "remember", label: "REMEMBER" },
  { key: "ground", label: "GROUND" },
  { key: "assist", label: "ASSIST" },
  { key: "review", label: "REVIEW" },
  { key: "observe", label: "OBSERVE" },
  { key: "learn", label: "LEARN" },
  { key: "reuse", label: "REUSE" },
  { key: "automate", label: "AUTOMATE" }
] as const;

export const FLYWHEEL_MOMENTS = [
  { key: "understand", label: "UNDERSTAND", stages: [1] },
  { key: "remember", label: "REMEMBER", stages: [2, 3] },
  { key: "assist", label: "ASSIST", stages: [4, 5] },
  { key: "learn", label: "LEARN", stages: [6, 7] },
  { key: "reuse", label: "REUSE", stages: [8] },
  { key: "automate", label: "AUTOMATE", stages: [9] }
] as const;

interface FlywheelContextValue {
  register: (element: HTMLElement, stages: number[]) => () => void;
  activeStages: number[];
}

const FlywheelContext = createContext<FlywheelContextValue | null>(null);

export function useFlywheel(): FlywheelContextValue | null {
  return useContext(FlywheelContext);
}

/**
 * The Knowledge Flywheel is one pinned product stage on desktop. Normal page
 * scrolling advances a single horizontal track; the six readable moments are
 * backed by the same nine internal stages used by the product story.
 */
export function FlywheelZone({ children }: { children: ReactNode }) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [activeMomentIndex, setActiveMomentIndex] = useState(0);

  useEffect(() => {
    const update = () => {
      const zone = zoneRef.current;
      if (!zone || window.innerWidth <= 1050) return;
      const maxScroll = Math.max(1, zone.offsetHeight - window.innerHeight);
      const zoneTop = zone.getBoundingClientRect().top + window.scrollY;
      const progress = Math.min(1, Math.max(0, (window.scrollY - zoneTop) / maxScroll));
      setActiveMomentIndex(Math.min(FLYWHEEL_MOMENTS.length - 1, Math.floor(progress * FLYWHEEL_MOMENTS.length)));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    document.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      document.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const register = useCallback(() => () => undefined, []);
  const activeStages = [...FLYWHEEL_MOMENTS[activeMomentIndex].stages];

  const value = useMemo<FlywheelContextValue>(() => ({ register, activeStages }), [register, activeStages]);
  const furthestActive = Math.max(...activeStages);
  const currentMoment = FLYWHEEL_MOMENTS[activeMomentIndex];
  const completedMoments = activeMomentIndex + 1;

  return (
    <FlywheelContext.Provider value={value}>
      <div ref={zoneRef} className="lp-fw-zone">
        <div className="lp-fw-sticky">
          <div className="lp-fw-rail-wrap">
            <div className="lp-fw-rail" aria-label={`Knowledge Flywheel progress. Current moment: ${currentMoment.label}. Internal stage ${furthestActive} of ${FLYWHEEL_STAGES.length}.`}>
              <span className="lp-fw-rail-name">KNOWLEDGE FLYWHEEL</span>
              <div className="lp-fw-rail-track" aria-hidden="true">
                <i style={{ width: `${(completedMoments / FLYWHEEL_MOMENTS.length) * 100}%` }} />
              </div>
              <div className="lp-fw-rail-nodes">
                {FLYWHEEL_MOMENTS.map((moment, index) => {
                  const state =
                    completedMoments >= index + 1
                      ? index === activeMomentIndex
                        ? "active"
                        : "done"
                      : "pending";
                  return (
                    <span key={moment.key} className={`lp-fw-rail-node is-${state}`}>
                      <i aria-hidden="true" />
                      {moment.label}
                    </span>
                  );
                })}
              </div>
              <span className="lp-fw-rail-now" aria-hidden="true">
                {completedMoments}/{FLYWHEEL_MOMENTS.length} · {currentMoment.label}
              </span>
            </div>
          </div>
          <div className="lp-fw-horizontal-track" style={{ transform: `translateX(-${activeMomentIndex * (100 / FLYWHEEL_MOMENTS.length)}%)` }}>
            {children}
          </div>
        </div>
      </div>
    </FlywheelContext.Provider>
  );
}

/**
 * One continuous step of the Knowledge Flywheel. The scene keeps its internal
 * stage mapping for accessibility and motion while the zone owns active-state
 * selection for the unified desktop track.
 */
export function FlywheelScene({
  stages,
  stageChip,
  id,
  labelId,
  children
}: {
  stages: number[];
  stageChip: string;
  id?: string;
  labelId?: string;
  children: ReactNode;
}) {
  const flywheel = useFlywheel();
  const ref = useRef<HTMLElement | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!flywheel || !ref.current) return;
    return flywheel.register(ref.current, stages);
  }, [flywheel, stages]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setLive(true);
      return;
    }
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (record.isIntersecting) {
            setLive(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -18% 0px", threshold: 0.04 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isActive = flywheel !== null && stages.some((stage) => flywheel.activeStages.includes(stage));

  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={labelId}
      data-stages={stages.join(",")}
      className={`lp-fscene${live ? " is-live" : ""}${isActive ? " is-active" : ""}`}
    >
      <p className="lp-fscene-chip">{stageChip}</p>
      {children}
    </section>
  );
}

/**
 * Latched version of an active state: once true, it stays true. Used for
 * one-shot counters so a value animation can never be cancelled mid-flight
 * when the visitor scrolls past the scene.
 */
export function useLatchedLive(active: boolean) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (active) setLive(true);
  }, [active]);
  return live;
}

/** One-shot in-view observer for scenes outside the flywheel zone. */
export function useInView<T extends HTMLElement>(rootMargin = "0px 0px -15% 0px") {  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (record.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin, threshold: 0.08 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);
  return { ref, inView };
}

/**
 * Animated counter for trust / version / supporting-outcome changes. Numbers
 * only ever move with visible reasons behind them; reduced motion jumps
 * straight to the final value.
 */
export function AnimatedValue({
  from,
  to,
  prefix = "",
  suffix = "",
  duration = 1000,
  start
}: {
  from: number;
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  start: boolean;
}) {
  const [value, setValue] = useState(from);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!start || startedRef.current) return;
    startedRef.current = true;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    const startTime = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, from, to, duration]);

  return (
    <>
      {prefix}
      {value}
      {suffix}
    </>
  );
}

/**
 * The recurring OIP visual signature: problem → indigo connection → memory
 * activates. A restrained line draw with a traveling pulse. Reduced motion
 * shows the final connected state.
 */
export function ConnectionLine({
  tone = "indigo",
  label,
  live,
  className = ""
}: {
  tone?: "indigo" | "green" | "amber";
  label?: string;
  live: boolean;
  className?: string;
}) {
  return (
    <div className={`lp-conn ${className}${live ? " is-live" : ""}${tone === "green" ? " is-green" : ""}${tone === "amber" ? " is-amber" : ""}`} aria-hidden="true">
      {label && <b>{label}</b>}
      <span className="lp-conn-track" />
      <span className="lp-conn-fill" />
      <span className="lp-conn-dot" />
    </div>
  );
}

/**
 * Staggered reveal: each child fades up in sequence once the parent gains
 * `.is-live`. Children stay direct grid/flex items (no extra wrapper), and
 * reduced motion keeps everything permanently visible.
 */
export function Stagger({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`lp-stagger ${className}`}>
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;
        const element = child as ReactElement<{ className?: string; style?: CSSProperties }>;
        const childClassName = element.props.className ? `${element.props.className} lp-stagger-item` : "lp-stagger-item";
        const childStyle = { ...(element.props.style ?? {}), "--i": index } as CSSProperties;
        return cloneElement(element, { className: childClassName, style: childStyle });
      })}
    </div>
  );
}

export function MemoryGlyph({ small = false }: { small?: boolean }) {
  return (
    <span className={`lp-memory-glyph${small ? " is-small" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function Chip({
  tone = "plain",
  children
}: {
  tone?: "indigo" | "green" | "amber" | "red" | "violet" | "plain" | "ink";
  children: ReactNode;
}) {
  return <span className={`lp-chip is-${tone}`}>{children}</span>;
}

/** Product-panel chrome wrapper used by every flywheel stage. */
export function StagePanel({
  label,
  title = "OIP · Support workspace",
  org = "Northstar",
  dark = false,
  className = "",
  id,
  children
}: {
  label: string;
  title?: string;
  org?: string;
  dark?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className={`lp-stage-panel${dark ? " is-dark" : ""} ${className}`} role="img" aria-label={label}>
      <div className="lp-stage-chrome">
        <div aria-hidden="true"><span /><span /><span /></div>
        <b>{title}</b>
        <span>{org}</span>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OPTION C.3 â€” INTERACTIVE OIP CYCLE                                 */
/* ------------------------------------------------------------------ */

export type OIPStageKey = "understand" | "remember" | "assist" | "learn" | "reuse" | "automate";

export interface OIPStageContent {
  key: OIPStageKey;
  label: string;
  number: string;
  title: string;
  copy: string;
  state: string;
}

export const OIP_STAGE_CONTENT: OIPStageContent[] = [
  {
    key: "understand",
    label: "UNDERSTAND",
    number: "01",
    title: "Understand the problem",
    copy: "OIP analyzes incoming work to identify what is actually happening, including the underlying problem and relevant signals.",
    state: "Problem identified"
  },
  {
    key: "remember",
    label: "REMEMBER",
    number: "02",
    title: "Remember what the organization knows",
    copy: "OIP searches Organizational Memory for validated lessons, evidence, and outcomes from similar problems.",
    state: "Memory match found"
  },
  {
    key: "assist",
    label: "ASSIST",
    number: "03",
    title: "Help people act with context",
    copy: "OIP uses trusted organizational knowledge to prepare a grounded response or recommended action.",
    state: "Grounded response prepared"
  },
  {
    key: "learn",
    label: "LEARN",
    number: "04",
    title: "Learn from what actually happened",
    copy: "After the outcome is known, OIP preserves evidence, strengthens or revises knowledge, and records what the organization learned.",
    state: "Outcome confirmed â†’ Memory updated"
  },
  {
    key: "reuse",
    label: "REUSE",
    number: "05",
    title: "Use the lesson when the problem returns",
    copy: "When a similar issue appears again, OIP brings the relevant Organizational Memory back into the workflow.",
    state: "Knowledge reused"
  },
  {
    key: "automate",
    label: "AUTOMATE",
    number: "06",
    title: "Act when trust and policy allow it",
    copy: "Repeatedly validated knowledge can eventually support policy-controlled automation while uncertain cases stay with humans.",
    state: "Trust âœ“ Â· Policy âœ“ Â· Authorized"
  }
];

export const OIP_MEMORY_CONTENT = {
  title: "Organizational Memory",
  copy: "The persistent layer where validated lessons, evidence, outcomes, trust, provenance, and version history remain reusable across future work."
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

type CycleLine = { x1: number; y1: number; x2: number; y2: number; w: number; h: number } | null;

export function OIPCycle() {
  const cycleRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Partial<Record<OIPStageKey, HTMLButtonElement | null>>>({});
  const [selected, setSelected] = useState<OIPStageKey | "memory" | null>(null);
  const [hovered, setHovered] = useState<OIPStageKey | null>(null);
  const [line, setLine] = useState<CycleLine>(null);
  const reducedMotion = usePrefersReducedMotion();
  const lineTargetRef = useRef<OIPStageKey | null>(null);

  const lineTarget: OIPStageKey | null = selected && selected !== "memory" ? selected : selected === "memory" ? null : hovered;
  lineTargetRef.current = lineTarget;
  const paused = selected !== null || hovered !== null || reducedMotion;

  const measureLine = useCallback(() => {
    const cycle = cycleRef.current;
    const core = coreRef.current;
    const target = lineTargetRef.current;
    if (!cycle || !core || !target) {
      setLine(null);
      return;
    }
    const node = nodeRefs.current[target];
    if (!node) {
      setLine(null);
      return;
    }
    const cycleRect = cycle.getBoundingClientRect();
    const coreRect = core.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const toCycle = (rect: DOMRect) => ({
      x: rect.left + rect.width / 2 - cycleRect.left,
      y: rect.top + rect.height / 2 - cycleRect.top
    });
    const start = toCycle(coreRect);
    const end = toCycle(nodeRect);
    setLine({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, w: cycleRect.width, h: cycleRect.height });
  }, []);

  useLayoutEffect(() => {
    measureLine();
  }, [lineTarget, measureLine]);

  useEffect(() => {
    const onResize = () => measureLine();
    window.addEventListener("resize", onResize);
    const visualViewport = window.visualViewport;
    if (visualViewport) visualViewport.addEventListener("resize", onResize);
    let observer: ResizeObserver | null = null;
    if (cycleRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measureLine());
      observer.observe(cycleRef.current);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      visualViewport?.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [measureLine]);

  useEffect(() => {
    if (selected === null) return;
    const timeout = window.setTimeout(() => setSelected(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [selected, hovered]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (selected !== null && panelRef.current) {
      panelRef.current.focus({ preventScroll: true });
    }
  }, [selected]);

  const selectedStage = selected && selected !== "memory" ? OIP_STAGE_CONTENT.find((stage) => stage.key === selected) ?? null : null;

  return (
    <div className="lp-wide lp-reveal-ring-stage">
      <div
        ref={cycleRef}
        className="lp-cycle"
        style={{ "--cycle-play-state": paused ? "paused" : "running" } as CSSProperties}
      >
        <div className="lp-cycle-track" aria-hidden="true" />
        <div className="lp-reveal-fragments" aria-hidden="true">
          <span className="fragment-tickets">TICKETS</span>
          <span className="fragment-docs">DOCS</span>
          <span className="fragment-chat">CHAT</span>
          <span className="fragment-outcomes">OUTCOMES</span>
          <span className="fragment-policy">POLICY</span>
          <span className="fragment-agents">AGENTS</span>
        </div>
        <button
          ref={coreRef}
          type="button"
          className={`lp-cycle-core${selected === "memory" ? " is-selected" : ""}`}
          aria-expanded={selected === "memory"}
          aria-controls="oip-cycle-panel"
          aria-label={`${OIP_MEMORY_CONTENT.title}: ${OIP_MEMORY_CONTENT.copy}`}
          onClick={() => setSelected((previous) => (previous === "memory" ? null : "memory"))}
        >
          <MemoryGlyph small />
          <small>ORGANIZATIONAL</small>
          <b>MEMORY</b>
          <em>validated Â· versioned Â· traceable</em>
        </button>
        {line && (
          <svg className="lp-cycle-connection" viewBox={`0 0 ${line.w} ${line.h}`} aria-hidden="true" focusable="false">
            <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div className="lp-cycle-orbit">
          {OIP_STAGE_CONTENT.map((stage, index) => (
            <div className="lp-cycle-slot" style={{ "--angle": `${index * 60}deg` } as CSSProperties} key={stage.key}>
              <span className="lp-cycle-untilt">
                <span className="lp-cycle-counter">
                  <button
                    ref={(element) => {
                      nodeRefs.current[stage.key] = element;
                    }}
                    type="button"
                    className={`lp-cycle-node${selected === stage.key ? " is-selected" : ""}${hovered === stage.key ? " is-hovered" : ""}`}
                    aria-expanded={selected === stage.key}
                    aria-controls="oip-cycle-panel"
                    aria-label={`${stage.label}: ${stage.title}`}
                    onClick={() => setSelected((previous) => (previous === stage.key ? null : stage.key))}
                    onMouseEnter={() => setHovered(stage.key)}
                    onMouseLeave={() => setHovered((previous) => (previous === stage.key ? null : previous))}
                    onFocus={() => setHovered(stage.key)}
                    onBlur={() => setHovered((previous) => (previous === stage.key ? null : previous))}
                  >
                    <span>{stage.number}</span>
                    <b>{stage.label}</b>
                  </button>
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        id="oip-cycle-panel"
        ref={panelRef}
        className={`lp-cycle-panel${selected !== null ? " is-active" : ""}`}
        tabIndex={-1}
        role="region"
        aria-live="polite"
        aria-label="OIP cycle explanation"
      >
        {selectedStage ? (
          <div className="lp-cycle-panel-body">
            <div className="lp-cycle-panel-kicker"><span>STAGE {selectedStage.number}</span><b>{selectedStage.label}</b></div>
            <h3>{selectedStage.title}</h3>
            <p>{selectedStage.copy}</p>
            <div className="lp-cycle-panel-state"><span>SUPPORTING STATE</span><b>{selectedStage.state}</b></div>
          </div>
        ) : selected === "memory" ? (
          <div className="lp-cycle-panel-body">
            <div className="lp-cycle-panel-kicker"><span>CORE</span><b>ORGANIZATIONAL MEMORY</b></div>
            <h3>{OIP_MEMORY_CONTENT.title}</h3>
            <p>{OIP_MEMORY_CONTENT.copy}</p>
          </div>
        ) : (
          <div className="lp-cycle-panel-hint">
            <span aria-hidden="true">â—Œ</span>
            <p>Select a stage to explore the continuous OIP learning cycle.</p>
          </div>
        )}
        {selected !== null && (
          <button type="button" className="lp-cycle-panel-close" onClick={() => setSelected(null)} aria-label="Close explanation">
            Close
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OPTION C.3 â€” ONE CONTINUOUS KNOWLEDGE FLYWHEEL                     */
/* ------------------------------------------------------------------ */

type FlywheelMomentKey = (typeof FLYWHEEL_MOMENTS)[number]["key"];

const JOURNEY_STEPS = [
  { key: "customer", label: "CUSTOMER ISSUE" },
  { key: "understand", label: "UNDERSTAND" },
  { key: "remember", label: "REMEMBER" },
  { key: "assist", label: "ASSIST" },
  { key: "learn", label: "LEARN" },
  { key: "reuse", label: "REUSE" },
  { key: "automate", label: "AUTOMATE" }
] as const;

function JourneyTicket({
  faded = false,
  isNew = false,
  customer = "Marina H. · Acme Field Ops",
  quote = "One of our staff can't record attendance from their phone.",
  id = "#4821",
  channel = "Email",
  time = "09:42",
  initials = "MH"
}: {
  faded?: boolean;
  isNew?: boolean;
  customer?: string;
  quote?: string;
  id?: string;
  channel?: string;
  time?: string;
  initials?: string;
}) {
  return (
    <div className={`lp-c3-ticket${faded ? " is-faded" : ""}${isNew ? " is-new" : ""}`}>
      <div className="lp-c3-ticket-head"><span>{isNew ? "NEW CASE" : faded ? "CLOSED" : "INCOMING"}</span><span>{channel} · {time}</span></div>
      <div className="lp-c3-ticket-id">CASE {id}</div>
      <p className="lp-c3-ticket-quote">“{quote}”</p>
      <div className="lp-c3-ticket-customer"><span className="lp-avatar">{initials}</span><div><b>{customer}</b><small>Customer</small></div></div>
    </div>
  );
}

function JourneyMemory({
  trust,
  outcomes,
  active = false,
  strengthened = false,
  compact = false,
  match = true
}: {
  trust: ReactNode;
  outcomes: ReactNode;
  active?: boolean;
  strengthened?: boolean;
  compact?: boolean;
  match?: boolean;
}) {
  return (
    <div className={`lp-c3-memory${active ? " is-active" : ""}${strengthened ? " is-strengthened" : ""}${compact ? " is-compact" : ""}`}>
      <div className="lp-c3-memory-head">
        <MemoryGlyph small />
        <div><small>ORGANIZATIONAL MEMORY</small><b>Mobile Attendance — Location Permission Disabled</b></div>
      </div>
      {match && <div className="lp-c3-memory-match">MATCH FOUND</div>}
      <div className="lp-c3-memory-state">
        <span>Validated ✓</span>
        <span>{outcomes}</span>
        <span className="lp-trust-number">Trust {trust}</span>
      </div>
    </div>
  );
}

function KnowledgeFlywheelMoment({ momentKey, active = true }: { momentKey: FlywheelMomentKey; active?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>("0px 0px -12% 0px");
  const live = active && inView;

  let body: ReactNode;
  switch (momentKey) {
    case "understand":
      body = (
        <div className="lp-c3-flow lp-c3-flow-2">
          <JourneyTicket />
          <div className="lp-c3-intel-arrow" aria-hidden="true"><span /></div>
          <div className="lp-c3-interpretation">
            <div className="lp-c3-panel-kicker"><span>OIP ANALYZES</span></div>
            <div className="lp-c3-interpret-step"><small>CUSTOMER ISSUE</small><b>Mobile attendance</b></div>
            <div className="lp-c3-interpret-step"><small>CANONICAL PROBLEM HYPOTHESIS</small><b className="is-refined">Location permission unavailable</b></div>
          </div>
        </div>
      );
      break;
    case "remember":
      body = (
        <div className="lp-c3-flow lp-c3-flow-2">
          <JourneyTicket faded />
          <div className="lp-c3-intel-arrow" aria-hidden="true"><span /></div>
          <JourneyMemory trust={68} outcomes="3 confirmed outcomes" active />
        </div>
      );
      break;
    case "assist":
      body = (
        <div className="lp-c3-flow lp-c3-flow-2">
          <JourneyMemory trust={68} outcomes="3 confirmed outcomes" active compact />
          <div className="lp-c3-intel-arrow" aria-hidden="true"><span /></div>
          <div className="lp-c3-draft">
            <div className="lp-c3-panel-kicker"><span>GROUNDED DRAFT</span><b className="is-amber">HUMAN REVIEW</b></div>
            <p>Hi Marina, it looks like location permission is disabled for the mobile app. Please enable location access, reopen the app, then record attendance again.</p>
            <div className="lp-c3-controls"><span className="is-primary">Approve</span><span>Edit</span><span>Escalate</span></div>
          </div>
        </div>
      );
      break;
    case "learn":
      body = (
        <div className="lp-c3-flow lp-c3-flow-2">
          <div className="lp-c3-learn">
            <div className="lp-c3-customer-reply"><small>CUSTOMER</small><b>“That worked. Thank you.”</b></div>
            <div className="lp-c3-outcome"><span>✓</span><b>OUTCOME CONFIRMED</b></div>
            <p className="lp-c3-moment-message">The ticket closes. <em>The learning doesn't.</em></p>
          </div>
          <div className="lp-c3-intel-arrow" aria-hidden="true"><span /></div>
          <JourneyMemory
            trust={<AnimatedValue from={68} to={74} start={live} />}
            outcomes={<><s>3</s> <AnimatedValue from={3} to={4} start={live} /> confirmed outcomes</>}
            active
            strengthened
          />
        </div>
      );
      break;
    case "reuse":
      body = (
        <div className="lp-c3-flow lp-c3-flow-2">
          <JourneyTicket isNew customer="Sanjay R. · Brightline Retail" quote="My team can't log attendance from the mobile app." id="#5103" time="Today · 10:02" initials="SR" />
          <div className="lp-c3-intel-arrow is-fast" aria-hidden="true"><span /></div>
          <div className="lp-c3-reuse">
            <JourneyMemory trust={74} outcomes="4 confirmed outcomes" active />
            <p className="lp-c3-moment-message">The same problem comes back. <em>This time, you don't start from zero.</em></p>
          </div>
        </div>
      );
      break;
    case "automate":
      body = (
        <div className="lp-c3-automate">
          <div className="lp-c3-policy-gate">
            <div className="lp-c3-policy-checks">
              <span><b>MEMORY</b><i>✓</i></span>
              <span><b>TRUST</b><i>✓</i></span>
              <span><b>POLICY</b><i>✓</i></span>
            </div>
            <div className="lp-c3-authorized"><span>AUTHORIZED</span><small>response sent · Gmail</small></div>
          </div>
          <div className="lp-c3-fallback"><span>UNCERTAIN</span><i>→</i><span>HUMAN REVIEW</span></div>
          <p className="lp-c3-moment-message">Autonomy is earned through organizational trust.</p>
        </div>
      );
      break;
    default:
      body = null;
  }

  const moment = FLYWHEEL_MOMENTS.find((item) => item.key === momentKey)!;

  return (
    <div ref={ref} className={`lp-c3-moment${live ? " is-live" : ""}`} data-moment={moment.key}>
      <p className="lp-c3-moment-chip">{moment.label}</p>
      {body}
    </div>
  );
}

export function KnowledgeFlywheel() {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const updateDesktop = () => setDesktop(window.innerWidth > 1050);
    updateDesktop();
    window.addEventListener("resize", updateDesktop);
    return () => window.removeEventListener("resize", updateDesktop);
  }, []);

  useEffect(() => {
    if (!desktop) {
      setActiveIndex(0);
      return;
    }
    const update = () => {
      const zone = zoneRef.current;
      if (!zone) return;
      const maxScroll = Math.max(1, zone.offsetHeight - window.innerHeight);
      const zoneTop = zone.getBoundingClientRect().top + window.scrollY;
      const progress = Math.min(1, Math.max(0, (window.scrollY - zoneTop) / maxScroll));
      setActiveIndex(Math.min(FLYWHEEL_MOMENTS.length - 1, Math.floor(progress * FLYWHEEL_MOMENTS.length)));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    document.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      document.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [desktop]);

  const current = FLYWHEEL_MOMENTS[activeIndex];

  const navigateTo = (index: number) => {
    const zone = zoneRef.current;
    if (!zone || !desktop) return;
    const maxScroll = Math.max(1, zone.offsetHeight - window.innerHeight);
    const zoneTop = zone.getBoundingClientRect().top + window.scrollY;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: zoneTop + (index / FLYWHEEL_MOMENTS.length) * maxScroll, behavior: reduced ? "auto" : "smooth" });
  };

  const journeyActiveStep = activeIndex + 1;

  if (!desktop) {
    return (
      <div className="lp-fw-mobile-story">
        {FLYWHEEL_MOMENTS.map((moment) => (
          <KnowledgeFlywheelMoment key={moment.key} momentKey={moment.key} active />
        ))}
      </div>
    );
  }

  return (
    <div ref={zoneRef} className="lp-fw-zone lp-fw-zone-c3">
      <div className="lp-fw-sticky">
        <div className="lp-fw-rail-wrap">
          <div className="lp-fw-rail lp-fw-rail-c3" aria-label={`Knowledge Flywheel progress. Current moment: ${current.label}.`}>
            <span className="lp-fw-rail-name">KNOWLEDGE FLYWHEEL</span>
            <div className="lp-fw-rail-track" aria-hidden="true">
              <i style={{ width: `${(activeIndex / (FLYWHEEL_MOMENTS.length - 1)) * 100}%` }} />
            </div>
            <div className="lp-fw-rail-nodes lp-fw-rail-nodes-c3">
              {FLYWHEEL_MOMENTS.map((moment, index) => {
                const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
                return (
                  <button
                    type="button"
                    key={moment.key}
                    className={`lp-fw-rail-node is-${state}`}
                    aria-label={`View ${moment.label} moment`}
                    aria-current={index === activeIndex ? "step" : undefined}
                    onClick={() => navigateTo(index)}
                  >
                    <i aria-hidden="true" />
                    {moment.label}
                  </button>
                );
              })}
            </div>
            <span className="lp-fw-rail-now" aria-hidden="true">{activeIndex + 1}/{FLYWHEEL_MOMENTS.length} · {current.label}</span>
          </div>
        </div>
        <div className="lp-fw-c3-stage">
          <StagePanel
            dark={current.key === "automate"}
            label={`Knowledge Flywheel moment: ${current.label}`}
            className="lp-c3-stage-panel"
          >
            <div className="lp-c3-journey" aria-hidden="true">
              <div className="lp-c3-journey-line"><i style={{ width: `${(journeyActiveStep / (JOURNEY_STEPS.length - 1)) * 100}%` }} /></div>
              <div className="lp-c3-journey-nodes">
                {JOURNEY_STEPS.map((step, index) => {
                  const state = index < journeyActiveStep ? "done" : index === journeyActiveStep ? "active" : "pending";
                  return <span key={step.key} className={`is-${state}`}><i />{step.label}</span>;
                })}
              </div>
            </div>
            <div className="lp-c3-content">
              <KnowledgeFlywheelMoment key={current.key} momentKey={current.key} active />
            </div>
          </StagePanel>
        </div>
      </div>
    </div>
  );
}
