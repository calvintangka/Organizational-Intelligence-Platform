import { useEffect, useRef, useState } from "react";

import {
  AnimatedValue,
  Chip,
  ConnectionLine,
  FlywheelScene,
  MemoryGlyph,
  OIPCycle,
  Stagger,
  StagePanel,
  useFlywheel,
  useInView,
  useLatchedLive
} from "./flywheel";

const Arrow = ({ muted = false }: { muted?: boolean }) => (
  <span className={muted ? "lp-arrow lp-arrow-muted" : "lp-arrow"} aria-hidden="true">→</span>
);

function SceneIndex({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <p className={light ? "lp-scene-index lp-scene-index-light" : "lp-scene-index"}>{children}</p>;
}

function TicketRow({ id, title, meta, repeat, resolved }: { id: string; title: string; meta: string; repeat?: boolean; resolved?: boolean }) {
  return (
    <div className={`lp-ticket-row${repeat ? " is-repeat" : ""}${resolved ? " is-resolved" : ""}`}>
      <span className="lp-ticket-channel" aria-hidden="true">{repeat ? "↻" : "↗"}</span>
      <span className="lp-ticket-copy"><b>{title}</b><small>{id} · {meta}</small></span>
      <span className={`lp-ticket-state ${resolved ? "is-done" : ""}`}>{resolved ? "Resolved" : "Open"}</span>
    </div>
  );
}

function WorkspaceTopbar() {
  return (
    <div className="lp-workspace-topbar">
      <div className="lp-workspace-brand"><span className="lp-avatar">NS</span><span><b>Northstar Support</b><small>Customer operations</small></span></div>
      <div className="lp-workspace-search">Search conversations… <kbd>⌘ K</kbd></div>
      <div className="lp-live-status"><span /> 284 waiting</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SCENE 01 — THE VILLAIN                                             */
/* ------------------------------------------------------------------ */

export function HeroVillainScene() {
  return (
    <section className="lp-scene lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-glow" aria-hidden="true" />
      <div className="lp-container lp-hero-copy">
        <SceneIndex>01 / ORGANIZATIONAL FORGETTING</SceneIndex>
        <h1 id="hero-title">Your company keeps solving the same problems.<br /> <em>And forgetting the answers.</em></h1>
        <p>Tickets close. The knowledge disappears. The next agent starts over.</p>
      </div>
      <div className="lp-wide lp-support-stage" role="img" aria-label="A support workspace where the same mobile attendance problem returns again and again: earlier resolutions disappear into ticket history and no connection to the past remains">
        <WorkspaceTopbar />
        <div className="lp-workspace-body">
          <aside className="lp-support-sidebar">
            <b>Inbox</b>
            <ul>
              <li className="active"><span>All conversations</span><b>284</b></li>
              <li><span>Assigned to me</span><b>18</b></li>
              <li><span>High priority</span><b>34</b></li>
              <li><span>Resolved</span><b>2.4k</b></li>
            </ul>
            <div className="lp-pressure-meter"><span>Today</span><strong>+42%</strong><i><i /></i><small>Volume above normal</small></div>
          </aside>
          <div className="lp-ticket-list">
            <div className="lp-list-heading"><span>Latest</span><span>284 open</span></div>
            <TicketRow id="#4821" title="Can't submit attendance on mobile" meta="2m ago" repeat />
            <TicketRow id="#4819" title="Invoice shows the wrong tax amount" meta="4m ago" />
            <TicketRow id="#4818" title="Location button is disabled" meta="7m ago" repeat />
            <TicketRow id="#4816" title="Unable to invite a teammate" meta="11m ago" />
            <TicketRow id="#4814" title="Attendance not saving from phone" meta="14m ago" repeat />
            <TicketRow id="#4808" title="Password reset email expired" meta="19m ago" />
          </div>
          <div className="lp-forgetting-panel">
            <div className="lp-forgetting-label"><span className="lp-warning-dot" /> SAME PROBLEM · THIRD TIME</div>
            <h2>“I can’t submit attendance from my phone.”</h2>
            <div className="lp-forget-loop" aria-hidden="true">
              <div className="lp-forget-phase lp-forget-phase-1">
                <div className="lp-forget-card is-resolved">
                  <span className="lp-forget-card-glyph">✓</span>
                  <div><b>Ticket #3912</b><small>“I can’t submit attendance from my phone.”</small></div>
                  <em>RESOLVED · 47 DAYS AGO</em>
                </div>
                <div className="lp-forget-sink"><span>disappears into ticket history</span><i /></div>
              </div>
              <div className="lp-forget-phase lp-forget-phase-2">
                <div className="lp-forget-card is-new">
                  <span className="lp-forget-card-glyph">↗</span>
                  <div><b>Ticket #4821</b><small>“I can’t submit attendance from my phone.”</small></div>
                  <em>NEW · TODAY</em>
                </div>
                <div className="lp-forget-void">
                  <span className="lp-forget-no-conn">no connection to the past</span>
                  <div className="lp-forget-empty"><MemoryGlyph small /><span>ORGANIZATIONAL MEMORY · NOTHING RETAINED</span></div>
                </div>
              </div>
            </div>
            <p className="lp-forgetting-foot">The answer exists. Somewhere.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* SCENE 02 — SUPPORT PRESSURE                                         */
/* ------------------------------------------------------------------ */

const QUEUE_ROWS = [
  { id: "#4832", title: "Attendance won't submit", meta: "2m ago", repeat: true },
  { id: "#4830", title: "Location unavailable on phone", meta: "3m ago", repeat: true },
  { id: "#4828", title: "Can't record attendance", meta: "6m ago", repeat: true },
  { id: "#4827", title: "Export fails with large dataset", meta: "9m ago" },
  { id: "#4826", title: "Login keeps asking for 2FA", meta: "12m ago" },
  { id: "#4824", title: "Mobile submit button greyed out", meta: "15m ago", repeat: true },
  { id: "#4823", title: "Wrong rate shown on invoice", meta: "17m ago" },
  { id: "#4821", title: "Attendance not saving from phone", meta: "19m ago", repeat: true }
];

const AGENT_ACTIVITY = [
  { glyph: "⌕", label: "Searching old tickets", detail: "maybe someone solved this before" },
  { glyph: "#", label: "Asking in #support", detail: "does anyone remember this one?" },
  { glyph: "≡", label: "Checking internal docs", detail: "was this ever written down?" },
  { glyph: "?", label: "Trying to remember", detail: "I think this happened in March…" }
];

export function SupportPressureScene() {
  const { ref, inView } = useInView<HTMLElement>("0px 0px -15% 0px");
  return (
    <section ref={ref} className={`lp-scene lp-pressure-scene${inView ? " is-live" : ""}`} id="pressure" aria-labelledby="pressure-title">
      <div className="lp-container lp-split-heading lp-split-heading-dark">
        <div>
          <SceneIndex>02 / THE REAL BOTTLENECK</SceneIndex>
          <h2 id="pressure-title">A few people.<br /><em>Thousands of questions.</em></h2>
        </div>
        <p>The team is not the bottleneck. The organization has no durable memory.</p>
      </div>
      <div className="lp-wide lp-pressure-stage" role="img" aria-label="A support queue keeps growing while one agent splits attention between searching old tickets, asking coworkers, checking documentation, and trying to remember">
        <div className="lp-queue-panel">
          <div className="lp-panel-head"><span>SUPPORT QUEUE</span><b className="is-warm">+42% volume today</b></div>
          <div className="lp-queue-viewport">
            <div className="lp-queue-track">
              {[...QUEUE_ROWS, ...QUEUE_ROWS].map((row, index) => (
                <div className={`lp-queue-row${row.repeat ? " is-repeat" : ""}`} key={`${row.id}-${index}`}>
                  <span className="lp-ticket-channel" aria-hidden="true">{row.repeat ? "↻" : "↗"}</span>
                  <b>{row.title}</b>
                  <small>{row.id} · {row.meta}</small>
                </div>
              ))}
            </div>
          </div>
          <p className="lp-queue-note">The same three questions keep resurfacing.</p>
        </div>
        <div className="lp-agent-panel">
          <div className="lp-panel-head"><span>ONE AGENT’S DAY</span><b>Maya · 5 open chats</b></div>
          <div className="lp-agent-activity">
            {AGENT_ACTIVITY.map((item, index) => (
              <div className="lp-agent-activity-row" key={item.label}>
                <span aria-hidden="true">{item.glyph}</span>
                <div><b>{item.label}</b><small>{item.detail}</small></div>
                <i aria-hidden="true" />
              </div>
            ))}
          </div>
          <div className="lp-pressure-stat"><span>time spent re-solving known issues</span><b>≈68%</b></div>
          <p className="lp-agent-note">Recurring work becomes the bottleneck—<b>none of it becomes reusable knowledge.</b></p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* SCENE 03 — COMPANIES TRIED TO REMEMBER                              */
/* ------------------------------------------------------------------ */

const MEMORY_TOOLS = [
  "Help desk",
  "Knowledge base",
  "Documentation",
  "Ticket history",
  "Search",
  "Internal chat"
];

export function RememberingAttemptScene() {
  const { ref, inView } = useInView<HTMLElement>("0px 0px -15% 0px");
  return (
    <section ref={ref} className={`lp-scene lp-attempt-scene${inView ? " is-live" : ""}`} aria-labelledby="attempt-title">
      <div className="lp-container lp-split-heading">
        <div>
          <SceneIndex light>03 / COMPANIES TRIED TO REMEMBER</SceneIndex>
          <h2 id="attempt-title">So companies tried to remember.</h2>
        </div>
        <p>Useful tools still depend on someone noticing, documenting, and finding the lesson later.</p>
      </div>
      <div className="lp-container lp-tool-strip" role="list" aria-label="Tools companies use to try to remember">
        {MEMORY_TOOLS.map((tool) => (
          <div className="lp-tool-cell" role="listitem" key={tool}>
            <span aria-hidden="true" />
            <b>{tool}</b>
          </div>
        ))}
      </div>
      <div className="lp-container lp-attempt-limit" role="img" aria-label="Solved work becomes reusable only when a person notices, documents, and later finds it">
        <b>SOLVED WORK</b><Arrow muted /><span>someone must notice · write · maintain · find</span><Arrow muted /><b>A FEW ARTICLES</b>
      </div>
      <p className="lp-editorial-line">The lesson is created during the work. <em>Most tools capture it later.</em></p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* SCENE 04 — AI HAS CONTEXT, ORGANIZATIONS NEED MEMORY               */
/* ------------------------------------------------------------------ */

const AI_PIPELINE = ["READ", "REASON", "DRAFT"];
const CONTEXT_QUESTIONS = [
  { n: "01", label: "VALIDATED?", detail: "Did your organization approve it?" },
  { n: "02", label: "WORKED?", detail: "Did it resolve this before?" },
  { n: "03", label: "TRUSTED?", detail: "Should the system rely on it?" }
];

export function AIContextScene() {
  const { ref, inView } = useInView<HTMLElement>("0px 0px -18% 0px");
  return (
    <section ref={ref} className={`lp-scene lp-context-scene${inView ? " is-live" : ""}`} aria-labelledby="context-title">
      <div className="lp-container lp-split-heading">
        <div>
          <SceneIndex light>04 / CONTEXT ≠ MEMORY</SceneIndex>
          <h2 id="context-title">AI has context.<br />Organizations need <em>memory.</em></h2>
        </div>
        <p>A fast answer is not the same as a validated lesson your organization can trust.</p>
      </div>
      <div className="lp-container lp-context-stage" role="img" aria-label="An AI pipeline drafts a fast answer from temporary context while source, validation, previous outcomes, currency, and trust remain unanswered">
        <div className="lp-context-flow">
          <div className="lp-flow-object lp-flow-problem"><small>Customer problem</small><b>Mobile attendance fails</b><span>“Submit does nothing on my phone.”</span></div>
          <Arrow />
          <div className="lp-ai-window">
            <div><span className="lp-ai-spark" aria-hidden="true">✦</span><small>AI · TEMPORARY CONTEXT</small></div>
            <div className="lp-ai-pipeline" aria-hidden="true">
              {AI_PIPELINE.map((step, index) => <span key={step} style={{ "--i": index } as React.CSSProperties}>{step}</span>)}
            </div>
            <p>Recent ticket · Help article · Account details</p>
            <div className="lp-ai-speed"><span>DRAFT READY</span><b>0.8s</b></div>
          </div>
          <Arrow />
          <div className="lp-flow-object lp-flow-answer"><small>Generated answer</small><b>Enable location access</b><span>Fast. Confident. Ungrounded.</span></div>
        </div>
        <div className="lp-missing-grid">
          {CONTEXT_QUESTIONS.map((question) => (
            <div key={question.n}><span>{question.n}</span><b>{question.label}</b><small>{question.detail}</small></div>
          ))}
        </div>
        <div className="lp-context-conclusion"><span>Temporary context</span><i /><strong>Durable memory records what actually worked.</strong></div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* SCENE 05 — ENTER OIP                                                */
/* ------------------------------------------------------------------ */

export function OIPRevealScene() {
  const { ref, inView } = useInView<HTMLElement>("0px 0px -20% 0px");
  return (
    <section ref={ref} id="how-it-works" className={`lp-scene lp-reveal-scene${inView ? " is-live" : ""}`} aria-labelledby="reveal-title">
      <div className="lp-container lp-reveal-heading">
        <SceneIndex light>05 / MEET OIP</SceneIndex>
        <h2 id="reveal-title">Meet <em>OIP.</em></h2>
        <div className="lp-reveal-lockup" aria-hidden="true"><MemoryGlyph small /><span>Organizational Intelligence Platform</span></div>
        <p>OIP turns resolved work into trusted, reusable Organizational Memory.</p>
      </div>
      <OIPCycle />
      <div className="lp-reveal-signature">
        <div className="lp-reveal-sig-flow" aria-hidden="true">
          <span className="lp-sig-chip">PROBLEM ARRIVES</span>
          <ConnectionLine live={inView} />
          <span className="lp-sig-chip is-memory"><MemoryGlyph small />MEMORY RESPONDS</span>
          <ConnectionLine live={inView} />
          <span className="lp-sig-chip is-outcome">OUTCOME OCCURS</span>
        </div>
        <p>A problem arrives. Memory responds. The outcome makes the next response better.</p>
      </div>
      <p className="lp-editorial-line lp-editorial-line-indigo">Every resolved issue should make the whole organization <em>smarter.</em></p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FLYWHEEL SHARED PIECES                                              */
/* ------------------------------------------------------------------ */

function CaseCard({ stamp, channel, id, quote, customer, meta, initials, faded = false }: { stamp: string; channel: string; id: string; quote: string; customer: string; meta: string; initials: string; faded?: boolean }) {
  return (
    <div className={`lp-fw-case${faded ? " is-faded" : ""}`}>
      <div className="lp-fw-case-head"><span className="lp-fw-stamp">{stamp}</span><span>{channel} · {meta}</span></div>
      <div className="lp-fw-case-id">CASE {id}</div>
      <p className="lp-fw-case-quote">“{quote}”</p>
      <div className="lp-fw-case-customer"><span className="lp-avatar">{initials}</span><div><b>{customer}</b><small>Customer</small></div></div>
    </div>
  );
}

function MemoryCard({
  version,
  trust,
  outcomes,
  evidence,
  provenance,
  solution,
  ground = false,
  className = ""
}: {
  version: React.ReactNode;
  trust: React.ReactNode;
  outcomes: React.ReactNode;
  evidence: React.ReactNode;
  provenance: string;
  solution: string;
  ground?: boolean;
  className?: string;
}) {
  return (
    <div className={`lp-fw-memory${ground ? " is-grounded" : ""} ${className}`}>
      <div className="lp-fw-memory-head">
        <MemoryGlyph />
        <div><small>ORGANIZATIONAL MEMORY</small><b>Mobile Attendance — Location Permission Disabled</b></div>
        <span className="lp-version">{version}</span>
      </div>
      <p className="lp-fw-memory-solution"><small>VALIDATED SOLUTION</small>{solution}</p>
      <div className="lp-fw-memory-meta">
        <div><small>TRUST</small><b className="lp-trust-number">{trust}</b></div>
        <div><small>SUPPORTING CASES</small><b>{outcomes}</b></div>
        <div><small>EVIDENCE</small><b>{evidence}</b></div>
        <div><small>PROVENANCE</small><b>{provenance}</b></div>
      </div>
    </div>
  );
}

function FlywheelHead({ id, title, lead }: { id: string; title: React.ReactNode; lead: string }) {
  return (
    <div className="lp-fscene-head">
      <h3 id={id}>{title}</h3>
      <p>{lead}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FLYWHEEL 01 — ANALYZE                                               */
/* ------------------------------------------------------------------ */

export function AnalyzeScene() {
  const flywheel = useFlywheel();
  const live = flywheel?.activeStages.includes(1) ?? false;
  return (
    <FlywheelScene stages={[1]} stageChip="06 / MOMENT 01·06 — UNDERSTAND">
      <FlywheelHead id="fw-analyze" title="First, OIP understands the problem." lead="The ticket becomes a precise, reusable problem hypothesis." />
      <StagePanel label="A customer ticket arrives and OIP analyzes signals, category, and a canonical problem hypothesis">
        <div className="lp-fw-grid lp-fw-grid-3">
          <div className="lp-fw-case-wrap">
            <CaseCard stamp="INCOMING" channel="Email" id="#4821" quote="One of our staff can’t record attendance from their phone." customer="Marina H. · Acme Field Ops" meta="09:42" initials="MH" />
            <div className="lp-fw-scan" aria-hidden="true"><i /></div>
          </div>
          <ConnectionLine live={live} label="ANALYZING" />
          <div className="lp-fw-analysis">
            <div className="lp-fw-panel-head"><span aria-hidden="true">✦</span><b>OIP ANALYZES</b></div>
            <Stagger className="lp-fw-signal-list">
              <div className="lp-fw-signal"><small>SIGNAL</small><b>mobile</b></div>
              <div className="lp-fw-signal"><small>SIGNAL</small><b>attendance</b></div>
              <div className="lp-fw-signal"><small>SIGNAL</small><b>phone</b></div>
              <div className="lp-fw-signal is-category"><small>CATEGORY</small><b>Attendance</b></div>
            </Stagger>
            <div className="lp-fw-hypothesis">
              <small>CANONICAL PROBLEM HYPOTHESIS</small>
              <b>Mobile Attendance Failure</b>
              <ConnectionLine live={live} />
              <b className="is-refined">Location permission unavailable</b>
            </div>
          </div>
        </div>
      </StagePanel>
    </FlywheelScene>
  );
}

/* ------------------------------------------------------------------ */
/* FLYWHEEL 02–03 — REMEMBER + GROUND                                  */
/* ------------------------------------------------------------------ */

export function RememberGroundScene() {
  const flywheel = useFlywheel();
  const live = (flywheel?.activeStages.includes(2) ?? false) || (flywheel?.activeStages.includes(3) ?? false);
  return (
    <FlywheelScene stages={[2, 3]} stageChip="07 / MOMENT 02·06 — REMEMBER">
      <FlywheelHead id="fw-remember" title={<>Has this organization <em>solved this before?</em></>} lead="OIP retrieves the validated lesson and grounds the case in it." />
      <StagePanel label="The ticket connects to Organizational Memory: a matching validated lesson is found and the case is grounded in it">
        <div className="lp-fw-grid lp-fw-grid-2">
          <div className="lp-fw-case-wrap">
            <CaseCard stamp="ANALYZED" channel="Email" id="#4821" quote="One of our staff can’t record attendance from their phone." customer="Marina H. · Acme Field Ops" meta="09:42" initials="MH" />
          </div>
          <ConnectionLine live={live} label="MATCH FOUND" />
          <div className="lp-fw-memory-wrap">
            <MemoryCard
              version="v2"
              trust={42}
              outcomes={2}
              evidence="2 confirmed outcomes"
              provenance="Tickets #2840 · #3912"
              solution="Enable OS location permission for the app, reopen it, and retry attendance submission."
              ground={live}
            />
            <div className={`lp-fw-ground-banner${live ? " is-live" : ""}`}>
              <span aria-hidden="true">⛓</span>
              <div><b>GROUNDED</b><small>This answer comes from organizational knowledge supported by previous work—not generic AI memory.</small></div>
            </div>
          </div>
        </div>
      </StagePanel>
    </FlywheelScene>
  );
}

/* ------------------------------------------------------------------ */
/* FLYWHEEL 04–05 — ASSIST + HUMAN REVIEW                              */
/* ------------------------------------------------------------------ */

export function AssistReviewScene() {
  const flywheel = useFlywheel();
  const live = (flywheel?.activeStages.includes(4) ?? false) || (flywheel?.activeStages.includes(5) ?? false);
  return (
    <FlywheelScene stages={[4, 5]} stageChip="08 / MOMENT 03·06 — ASSIST">
      <FlywheelHead id="fw-assist" title="OIP drafts. The human decides." lead="The response carries its evidence; the agent keeps control." />
      <StagePanel label="OIP drafts a response grounded in Organizational Memory and a human agent reviews, approves, and sends it">
        <div className="lp-fw-grid lp-fw-grid-3">
          <div className="lp-fw-memory-wrap">
            <MemoryCard
              className="is-compact"
              version="v2"
              trust={42}
              outcomes={2}
              evidence="2 confirmed outcomes"
              provenance="Tickets #2840 · #3912"
              solution="Enable OS location permission for the app, reopen it, and retry attendance submission."
            />
            <div className="lp-fw-knowledge-used"><small>KNOWLEDGE USED</small><span>Location permission fix · v2</span><span>Evidence from #2840, #3912</span></div>
          </div>
          <ConnectionLine live={live} />
          <div className="lp-fw-draft">
            <Stagger className="lp-fw-draft-stack">
              <div className="lp-fw-draft-head"><span>AI DRAFT · GROUNDED IN ORGANIZATIONAL MEMORY</span><b className="is-amber">HUMAN REVIEW REQUIRED</b></div>
              <p className="lp-fw-draft-body">Hi Marina, it looks like location permission is disabled for the mobile app. Please enable location access, reopen the app, then record attendance again.</p>
              <div className="lp-fw-draft-evidence"><span aria-hidden="true">✓</span><div><b>Evidence &amp; provenance attached</b><small>Mobile Attendance — Location Permission Disabled · v2</small></div></div>
              <div className="lp-fw-review-row">
                <div className="lp-fw-reviewer"><span className="lp-avatar">MC</span><div><b>Maya Chen</b><small>Support · reviewer</small></div></div>
                <div className="lp-fw-review-actions">
                  <span className="is-primary">Approve</span><span>Edit</span><span>Reject</span><span>Escalate</span>
                </div>
              </div>
              <div className="lp-fw-sent"><span aria-hidden="true">✓</span><b>REVIEWED &amp; SENT</b><small>response delivered · 09:58</small></div>
            </Stagger>
          </div>
        </div>
      </StagePanel>
      <p className="lp-fscene-note">Human review is part of OIP governance—not a temporary obstacle.</p>
    </FlywheelScene>
  );
}

/* ------------------------------------------------------------------ */
/* FLYWHEEL 06–07 — OBSERVE + LEARN                                    */
/* ------------------------------------------------------------------ */

const LEARN_STEPS = ["EVIDENCE ATTACHED", "LESSON STRENGTHENED", "COMMIT TO ORGANIZATIONAL MEMORY"];

export function ObserveLearnScene() {
  const flywheel = useFlywheel();
  const live = (flywheel?.activeStages.includes(6) ?? false) || (flywheel?.activeStages.includes(7) ?? false);
  const countLive = useLatchedLive(live);
  return (
    <FlywheelScene stages={[6, 7]} stageChip="09 / MOMENT 04·06 — LEARN" labelId="fw-observe">
      <FlywheelHead id="fw-observe" title={<>The ticket closes. <em>The learning doesn’t.</em></>} lead="Confirmed outcome → evidence → stronger lesson → new memory version." />
      <StagePanel label="The customer confirms the solution worked; OIP confirms the outcome, attaches evidence, strengthens the lesson, and commits it to Organizational Memory">
        <div className="lp-fw-grid lp-fw-grid-3">
          <div className="lp-fw-learn">
            <Stagger className="lp-fw-learn-stack">
              <div className="lp-fw-customer-reply"><small>CUSTOMER · 10:06</small><b>“That worked. Thank you.”</b></div>
              <div className="lp-fw-outcome"><span aria-hidden="true">✓</span><b>OUTCOME CONFIRMED</b><small>resolution verified by the customer</small></div>
              <div className="lp-fw-learn-steps">
                {LEARN_STEPS.map((step, index) => (
                  <div key={step} className="lp-fw-learn-step" style={{ "--i": index } as React.CSSProperties}>
                    <span>{String(index + 1).padStart(2, "0")}</span><b>{step}</b>
                  </div>
                ))}
              </div>
              <div className="lp-fw-closed-ticket"><span>CLOSED</span><small>temporary work is done</small></div>
            </Stagger>
          </div>
          <ConnectionLine live={live} tone="green" label="LEARN" />
          <div className="lp-fw-memory-wrap">
            <MemoryCard
              version={<><s>v2</s> <b className="is-new">v3</b></>}
              trust={<AnimatedValue from={42} to={55} start={countLive} />}
              outcomes={<><s>2</s> <AnimatedValue from={2} to={3} start={countLive} /></>}
              evidence="3 confirmed outcomes"
              provenance="Tickets #2840 · #3912 · #4821"
              solution="Enable OS location permission for the app, reopen it, and retry attendance submission."
              ground={live}
            />
            <Stagger className="lp-fw-trust-reasons">
              <Chip tone="green">+1 confirmed outcome</Chip>
              <Chip tone="green">+1 evidence item</Chip>
              <Chip tone="green">+1 human validation</Chip>
            </Stagger>
          </div>
        </div>
      </StagePanel>
      <p className="lp-fscene-note">Temporary ticket work becomes persistent organizational knowledge.</p>
    </FlywheelScene>
  );
}

/* ------------------------------------------------------------------ */
/* FLYWHEEL 08 — REUSE                                                 */
/* ------------------------------------------------------------------ */

export function ReuseScene() {
  const flywheel = useFlywheel();
  const live = flywheel?.activeStages.includes(8) ?? false;
  const countLive = useLatchedLive(live);
  return (
    <FlywheelScene stages={[8]} stageChip="10 / MOMENT 05·06 — REUSE">
      <FlywheelHead id="fw-reuse" title={<>The same problem returns.<br /><em>This time, you don’t start from zero.</em></>} lead="OIP recognizes the known problem and prepares the grounded response immediately." />
      <StagePanel label="A new case from a different customer is matched immediately to the strengthened Organizational Memory, a grounded response is prepared, and trust rises again">
        <div className="lp-fw-grid lp-fw-grid-3">
          <div className="lp-fw-case-wrap">
            <CaseCard stamp="NEW CASE" channel="Email" id="#5103" quote="My team can’t log attendance from the mobile app." customer="Sanjay R. · Brightline Retail" meta="Today · 10:02" initials="SR" />
          </div>
          <ConnectionLine live={live} label="MATCH FOUND IMMEDIATELY" />
          <div className="lp-fw-memory-wrap">
            <MemoryCard
              version="v3"
              trust={55}
              outcomes={3}
              evidence="3 confirmed outcomes"
              provenance="Tickets #2840 · #3912 · #4821"
              solution="Enable OS location permission for the app, reopen it, and retry attendance submission."
              ground={live}
            />
            <div className="lp-fw-known"><span aria-hidden="true">✓</span><b>KNOWN SOLUTION · GROUNDED RESPONSE PREPARED</b></div>
          </div>
        </div>
        <div className="lp-fw-reuse-strip">
          <Stagger className="lp-fw-reuse-strip-grid">
            <div className="lp-fw-customer-reply is-inline"><small>CUSTOMER · 10:31</small><b>“That worked. Thank you.”</b></div>
            <div className="lp-fw-trust-delta">
              <span>TRUST</span>
              <b className="lp-trust-number"><AnimatedValue from={55} to={68} start={countLive} /></b>
              <i aria-hidden="true" />
              <span>SUPPORTING OUTCOMES</span>
              <b><AnimatedValue from={3} to={4} start={countLive} /></b>
            </div>
            <p><b>Solve once. Learn. Reuse.</b> The organization compounds with every confirmed outcome.</p>
          </Stagger>
        </div>
      </StagePanel>
    </FlywheelScene>
  );
}

/* ------------------------------------------------------------------ */
/* FLYWHEEL 09 — AUTOMATE                                              */
/* ------------------------------------------------------------------ */

const POLICY_CHECKS = ["MEMORY", "TRUST", "POLICY"];
const CHANNELS = ["Gmail", "Outlook", "Slack", "WhatsApp", "Telegram"];

export function AutomateScene() {
  const flywheel = useFlywheel();
  const live = flywheel?.activeStages.includes(9) ?? false;
  const countLive = useLatchedLive(live);
  return (
    <FlywheelScene stages={[9]} stageChip="11 / MOMENT 06·06 — AUTOMATE" id="automation">
      <FlywheelHead id="fw-automate" title="Trust unlocks automation." lead="OIP acts only when memory, trust, and policy agree. Uncertainty returns to a human." />
      <StagePanel dark id="security" label="Gmail sends a known problem to OIP. Memory, trust, and policy checks authorize the response; uncertainty routes to human review.">
        <div className="lp-policy-title"><div><small>OIP DECISION TRACE · CASE #5103</small><b>Known problem received</b></div><span className="lp-audit-badge">AUDIT LOG ON</span></div>
        <div className="lp-automation-decision" role="list" aria-label="Automation decision checks">
          {POLICY_CHECKS.map((check, index) => (
            <div className="lp-policy-check" role="listitem" key={check} style={{ "--i": index } as React.CSSProperties}>
              <span>{check === "TRUST" ? <>SCORE <AnimatedValue from={68} to={79} start={countLive} /> · REQUIRE 75</> : `CHECK ${index + 1}`}</span>
              <div><b>{check}</b><i aria-hidden="true">✓</i></div>
            </div>
          ))}
          <Arrow />
          <div className="lp-policy-result"><span>AUTHORIZED</span><b>OIP ACTS</b><small>ACT-8821 · auditable</small></div>
        </div>
        <div className="lp-channel-flow lp-channel-flow-compact">
          <div className="lp-channel-card is-inbound">
            <div className="lp-channel-card-head"><span className="lp-channel-letter">G</span><div><b>Gmail</b><small>Inbox · 10:02</small></div></div>
            <p>“Our staff can’t record attendance from the phone app.”</p>
          </div>
          <div className="lp-channel-mid">
            <ConnectionLine live={live} />
            <div className="lp-channel-steps"><span>OIP</span><span>AUTHORIZED ✓</span></div>
            <ConnectionLine live={live} />
          </div>
          <div className="lp-channel-card is-outbound">
            <div className="lp-channel-card-head"><span className="lp-channel-letter">G</span><div><b>Authorized response</b><small>Sent · 10:03</small></div></div>
            <p>Grounded in the validated location-permission fix.</p>
          </div>
        </div>
        <div className="lp-channel-fallback">
          <div className="lp-channel-fallback-card"><span className="is-amber" aria-hidden="true">⚠</span><div><b>REQUIREMENTS FAIL</b><small>low trust, missing memory, or blocked policy</small></div></div>
          <span className="lp-channel-fallback-arrow" aria-hidden="true">↳</span>
          <div className="lp-channel-fallback-human"><span aria-hidden="true">✋</span><div><b>HUMAN REVIEW</b><small>judgment stays with the team</small></div></div>
        </div>
        <div className="lp-channel-strip">
          <span>THE SAME GOVERNED LAYER WORKS ACROSS</span>
          {CHANNELS.map((channel) => <b key={channel}>{channel}</b>)}
        </div>
      </StagePanel>
      <p className="lp-fscene-note">Autonomy is earned. Human review remains the safe default.</p>
    </FlywheelScene>
  );
}

/* ------------------------------------------------------------------ */
/* SCENE 12 — VISION + CTA                                             */
/* ------------------------------------------------------------------ */

const OIP20_SOURCES = ["DOCS", "EMAIL", "CHAT", "DECISIONS", "PROCESSES", "CASES", "OUTCOMES", "POLICIES", "EXPERT KNOWLEDGE"];

const OIP20_STEPS = [
  {
    key: "begin",
    title: "Tickets were only the beginning.",
    copy: "Customer support is where OIP starts learning. But organizational knowledge lives far beyond tickets."
  },
  {
    key: "fragmented",
    title: "What if your whole organization could remember?",
    copy: "The organization already knows enormous amounts. It simply doesn't possess one persistent, structured memory of everything it has learned."
  },
  {
    key: "structured",
    title: "Turn scattered knowledge into living Organizational Memory.",
    copy: "OIP 2.0 structures related concepts, relationships, evidence, and lessons into one evolving memory network."
  },
  {
    key: "updating",
    title: "Memory should evolve as the organization evolves.",
    copy: "New evidence strengthens knowledge. Conflicting evidence can revise it. Old versions remain historically traceable."
  },
  {
    key: "agents",
    title: "AI agents shouldn't have to start from zero either.",
    copy: "Today's agents can reason and act. The future OIP vision is to give them continuously evolving Organizational Memory built from what the company itself has learned."
  },
  {
    key: "vision",
    title: "OIP 2.0 — The memory layer for an organization of humans and AI.",
    copy: "Give AI agents more than tools. Give them organizational experience."
  }
] as const;

function OIP20StepVisual({ stepKey }: { stepKey: string }) {
  if (stepKey === "begin") {
    return (
      <div className="lp-c31-v-begin">
        <span className="lp-c31-beachhead">BEACHHEAD</span>
        <div className="lp-c31-memory-node"><MemoryGlyph small /><span>ORGANIZATIONAL MEMORY</span></div>
        <span className="lp-c31-source-chip">Tickets</span>
      </div>
    );
  }
  if (stepKey === "fragmented") {
    return (
      <div className="lp-c31-source-grid is-fragmented">
        {OIP20_SOURCES.map((source) => <span key={source}>{source}</span>)}
      </div>
    );
  }
  if (stepKey === "structured") {
    return (
      <div className="lp-c31-net">
        <div className="lp-c31-memory-node is-core"><MemoryGlyph small /><span>OIP 2.0</span></div>
        <div className="lp-c31-net-sources">
          {OIP20_SOURCES.slice(0, 6).map((source) => <span key={source}>{source}</span>)}
        </div>
      </div>
    );
  }
  if (stepKey === "updating") {
    return (
      <div className="lp-c31-updating">
        <div className="lp-c31-version-flow">
          <span>v3</span><i aria-hidden="true">↓</i>
          <span>NEW EVIDENCE</span><i aria-hidden="true">↓</i>
          <span>REVIEWED</span><i aria-hidden="true">↓</i>
          <span className="is-new">v4</span>
        </div>
        <div className="lp-c31-memory-node"><MemoryGlyph small /><span>LIVING MEMORY</span><em>versioned · evidenced · traceable</em></div>
        <div className="lp-c31-update-chips">
          <span>validation ✓</span><span>evidence +1</span><span>trust updated</span>
        </div>
      </div>
    );
  }
  if (stepKey === "agents") {
    return (
      <div className="lp-c31-agent">
        <div className="lp-c31-agent-card"><span>AI AGENT</span><b>Investigate why enterprise customers are failing SSO onboarding and recommend the next action.</b></div>
        <div className="lp-c31-loaded"><b>ORGANIZATIONAL CONTEXT LOADED</b><div className="lp-c31-context-list"><span>Relevant lessons: 4</span><span>Current process: v7</span><span>Known exceptions: 2</span><span>Validated outcomes: 6</span><span>Policy constraints: loaded</span></div></div>
        <div className="lp-c31-memory-node is-small"><MemoryGlyph small /><span>MEMORY</span></div>
      </div>
    );
  }
  return (
    <div className="lp-c31-final">
      <div className="lp-c31-final-flow"><span>HUMANS</span><i aria-hidden="true">↘</i><div className="lp-c31-memory-node"><MemoryGlyph small /><span>ORGANIZATIONAL MEMORY</span></div><i aria-hidden="true">↗</i><span>AI AGENTS</span></div>
      <p className="lp-c31-final-line">OIP 2.0 — The memory layer for an organization of humans and AI.</p>
    </div>
  );
}

export function OIP20FutureReveal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key === "ArrowRight") {
        setStep((previous) => Math.min(OIP20_STEPS.length - 1, previous + 1));
      }
      if (event.key === "ArrowLeft") {
        setStep((previous) => Math.max(0, previous - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus({ preventScroll: true });
    }
  }, [open]);

  const openReveal = () => {
    setStep(0);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const activeStep = OIP20_STEPS[step];

  return (
    <div className="lp-c31">
      <button
        ref={triggerRef}
        type="button"
        className="lp-c31-trigger"
        aria-expanded={open}
        aria-controls="oip20-future-reveal"
        onClick={() => (open ? close() : openReveal())}
      >
        <span>See where this is going</span>
        <i aria-hidden="true">→</i>
      </button>
      {open && (
        <div id="oip20-future-reveal" ref={panelRef} className="lp-c31-reveal" tabIndex={-1} role="region" aria-label="OIP 2.0 future reveal">
          <div className="lp-c31-reveal-inner">
            <div className="lp-c31-reveal-head">
              <p className="lp-scene-index">OIP 2.0 / FUTURE VISION</p>
              <h2>Beyond tickets. <em>Toward organizational intelligence.</em></h2>
              <p className="lp-c31-sub">Where OIP is going — not what ships today.</p>
            </div>
            <div className="lp-c31-layout">
              <div className="lp-c31-copy" key={step} aria-live="polite">
                <p className="lp-c31-step-count">{String(step + 1).padStart(2, "0")} / {String(OIP20_STEPS.length).padStart(2, "0")}</p>
                <h3>{activeStep.title}</h3>
                <p>{activeStep.copy}</p>
                <div className="lp-c31-nav">
                  <button type="button" className="lp-c31-nav-button" onClick={() => setStep((previous) => Math.max(0, previous - 1))} disabled={step === 0} aria-label="Previous step">←</button>
                  <button type="button" className="lp-c31-nav-button" onClick={() => setStep((previous) => Math.min(OIP20_STEPS.length - 1, previous + 1))} disabled={step === OIP20_STEPS.length - 1} aria-label="Next step">→</button>
                </div>
              </div>
              <div className="lp-c31-stage" key={activeStep.key} aria-hidden="true">
                <OIP20StepVisual stepKey={activeStep.key} />
              </div>
            </div>
            <div className="lp-c31-dots" role="tablist" aria-label="OIP 2.0 steps">
              {OIP20_STEPS.map((item, index) => (
                <button
                  type="button"
                  key={item.key}
                  className={index === step ? "is-active" : ""}
                  role="tab"
                  aria-selected={index === step}
                  aria-label={`Step ${index + 1}: ${item.title}`}
                  onClick={() => setStep(index)}
                />
              ))}
            </div>
            <div className="lp-c31-close-row">
              <button type="button" className="lp-c31-return" onClick={close}>← Back to OIP today</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function VisionScene() {
  const vision = [
    { label: "MEMORY", detail: "preserve what worked" },
    { label: "INTELLIGENCE", detail: "learn what to trust" },
    { label: "AUTONOMY", detail: "act when policy permits" }
  ];
  return (
    <section className="lp-scene lp-vision-scene" id="vision" aria-labelledby="vision-title">
      <div className="lp-container lp-vision-progression" aria-label="Memory to Intelligence to Autonomy">
        {vision.map((stage, index) => (
          <div key={stage.label} className="lp-vision-word">
            {index > 0 && <span className="lp-vision-arrow" aria-hidden="true">→</span>}
            <div><b>{stage.label}</b><small>{stage.detail}</small></div>
          </div>
        ))}
      </div>
      <div className="lp-container lp-c31-placement">
        <OIP20FutureReveal />
      </div>
      <div className="lp-container lp-final-cta">
        <SceneIndex light>12 / THE OIP VISION</SceneIndex>
        <p className="lp-vision-kicker">Memory <span>→</span> Intelligence <span>→</span> Autonomy</p>
        <h2 id="vision-title">Stop starting from zero.</h2>
        <p>Turn today’s solved problems into trusted organizational memory for tomorrow’s work.</p>
        <div className="lp-cta-actions">
          <a className="lp-button lp-button-primary" href="/?auth=signup">Sign Up Now <span aria-hidden="true">↗</span></a>
          <a className="lp-signin-link" href="/?auth=login">Already have an account? <b>Sign in</b></a>
        </div>
      </div>
      <footer className="lp-footer">
        <div className="lp-container">
          <a className="lp-brand lp-brand-dark" href="#top"><span className="lp-brand-mark lp-brand-mark-indigo" aria-hidden="true"><i /><i /><i /></span><span>OIP</span></a>
          <p>Every resolved issue should make the whole organization smarter.</p>
          <span>Organizational Intelligence Platform</span>
        </div>
      </footer>
    </section>
  );
}
