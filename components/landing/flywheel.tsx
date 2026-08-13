"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
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
