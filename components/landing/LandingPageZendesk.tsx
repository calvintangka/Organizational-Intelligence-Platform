"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const WAITLIST_URL = "https://docs.google.com/forms/d/e/1FAIpQLScet84g9pbR0-rvZ4F7z93ve61QB1SuGQYXYy3ENl7Y-q4XAA/viewform?usp=publish-editor";

const HERO_EDUCATION = [
  {
    name: "Source",
    note: "what happened",
    description: "The record of what happened — a ticket, decision, conversation, document, incident, or result.",
  },
  {
    name: "Evidence",
    note: "why believe it",
    description: "The facts, context, scope, and provenance people need to judge whether a lesson is trustworthy.",
  },
  {
    name: "Outcome",
    note: "what happened next",
    description: "The result after action — evidence that can confirm, challenge, or refine what the organization remembers.",
  },
] as const;

type UseCaseVisual =
  | {
    kind: "photo";
    src: string;
    beforeAlt: string;
    afterAlt: string;
  }
  | {
    kind: "system";
    scene: "version" | "outcome" | "trust" | "ai-context";
    beforeAlt: string;
    afterAlt: string;
  };

type UseCaseDefinition = {
  title: string;
  before: string;
  problem: string;
  after: string;
  beforeCue: string;
  afterCue: string;
  visual: UseCaseVisual;
};

const USE_CASES = [
  {
    title: "We solved this before, but nobody remembers how.",
    before: "The team investigates the same issue from zero.",
    problem: "The resolution stayed inside one ticket and one person's memory.",
    after: "The prior resolution and its supporting evidence are easier to retrieve.",
    beforeCue: "Ticket · chat · personal recall",
    afterCue: "Relevant Memory · evidence attached",
    visual: {
      kind: "photo",
      src: "/maesa-use-case-01-solved-before.webp",
      beforeAlt: "IT specialist repeating a difficult repair while searching scattered old records",
      afterAlt: "The same specialist calmly applying a previously validated resolution",
    },
  },
  {
    title: "Support agents give different answers.",
    before: "Each agent answers from personal memory.",
    problem: "Useful answers exist, but their evidence and authority are unclear.",
    after: "Agents can reuse the same validated Organizational Memory.",
    beforeCue: "Conflicting replies",
    afterCue: "One governed current answer",
    visual: {
      kind: "photo",
      src: "/maesa-use-case-02-shared-answer.webp",
      beforeAlt: "Support agent comparing contradictory replies with an uncertain colleague",
      afterAlt: "The same support agent and colleague aligned around one shared trusted answer",
    },
  },
  {
    title: "A key employee leaves — and their knowledge leaves too.",
    before: "Critical know-how walks out with its owner.",
    problem: "The organization depended on access to a person, not a durable lesson.",
    after: "Validated learning remains available with its provenance intact.",
    beforeCue: "Knowledge concentrated in one person",
    afterCue: "Learning retained by the organization",
    visual: {
      kind: "photo",
      src: "/maesa-use-case-03-employee-leaves.webp",
      beforeAlt: "Experienced employee packing to leave while concerned teammates receive a rushed handoff",
      afterAlt: "The remaining team calmly using retained organizational knowledge beside the empty chair",
    },
  },
  {
    title: "New employees keep asking the same questions.",
    before: "Senior staff repeat the same explanations.",
    problem: "Answers are passed verbally instead of becoming governed shared Memory.",
    after: "New employees can find trusted organizational knowledge themselves.",
    beforeCue: "Repeated interruption",
    afterCue: "Self-serve trusted Memory",
    visual: {
      kind: "photo",
      src: "/maesa-use-case-04-new-hire.webp",
      beforeAlt: "New hire overwhelmed by documents and interrupting a busy mentor",
      afterAlt: "The same new hire independently finding a trusted answer while the mentor works",
    },
  },
  {
    title: "We waste too much time searching for information.",
    before: "People jump across email, chat, documents, and tickets.",
    problem: "The information exists, but the relevant learned answer is fragmented.",
    after: "Relevant previous knowledge becomes easier to retrieve in context.",
    beforeCue: "Four systems · no clear answer",
    afterCue: "Context-matched retrieval",
    visual: {
      kind: "photo",
      src: "/maesa-use-case-05-search.webp",
      beforeAlt: "Knowledge worker frustrated while searching across scattered tools and documents",
      afterAlt: "The same worker focused on a relevant governed answer",
    },
  },
  {
    title: "Important context gets lost during handoffs.",
    before: "The task transfers, but the reasoning does not.",
    problem: "Ownership changes without carrying forward evidence, scope, or provenance.",
    after: "The knowledge keeps its evidence, context, and provenance attached.",
    beforeCue: "Task passed · context missing",
    afterCue: "Reasoning travels with the work",
    visual: {
      kind: "photo",
      src: "/maesa-use-case-06-handoff.webp",
      beforeAlt: "Two colleagues transferring a task while the receiver lacks its reasoning and history",
      afterAlt: "The same colleagues completing a contextual handoff with evidence and prior learning visible",
    },
  },
  {
    title: "A process changed, but people still use the old way.",
    before: "Old messages and documents remain everywhere.",
    problem: "Stored information does not clearly distinguish current guidance from old Source material.",
    after: "Current validated Memory is distinguishable from outdated sources.",
    beforeCue: "Old and new instructions mixed",
    afterCue: "Current version · history preserved",
    visual: {
      kind: "system",
      scene: "version",
      beforeAlt: "Old and new process documents overlap without a clear current version",
      afterAlt: "One validated current process is prominent while version history remains traceable",
    },
  },
  {
    title: "The same mistake keeps happening.",
    before: "An incident is fixed, then the lesson is forgotten.",
    problem: "The outcome never returns as evidence for organizational learning.",
    after: "Outcomes can strengthen or challenge Memory through human review.",
    beforeCue: "Fix completed · lesson lost",
    afterCue: "Outcome → Evidence → review",
    visual: {
      kind: "system",
      scene: "outcome",
      beforeAlt: "A recurring incident loops back without preserving the previous outcome",
      afterAlt: "The outcome becomes evidence and enters a human-governed learning loop",
    },
  },
  {
    title: "Nobody knows which answer to trust.",
    before: "Documents and expert opinions conflict.",
    problem: "People can see claims, but not the evidence, scope, or authority behind them.",
    after: "Evidence, scope, and validation make current trusted Memory explainable.",
    beforeCue: "Three answers · no authority",
    afterCue: "Evidence · scope · validation",
    visual: {
      kind: "system",
      scene: "trust",
      beforeAlt: "Several contradictory answers compete without evidence or authority",
      afterAlt: "One current governed answer is connected to evidence, scope, and human validation",
    },
  },
  {
    title: "AI answers without enough company context.",
    before: "AI works from generic or fragmented information.",
    problem: "A model can read documents without knowing what the organization has governed as current.",
    after: "AI can retrieve governed organizational knowledge with clear provenance and boundaries.",
    beforeCue: "Generic model context",
    afterCue: "Governed Memory · humans retain authority",
    visual: {
      kind: "system",
      scene: "ai-context",
      beforeAlt: "Disconnected sources feed fragmented context into an AI model and produce uncertain answers",
      afterAlt: "Governed Organizational Memory with provenance and scope grounds the AI response under human authority",
    },
  },
] as const satisfies readonly UseCaseDefinition[];

const FLYWHEEL_STAGES = [
  {
    name: "Capture",
    detail: "Source",
    description: "Bring real work into view without pretending every source is already trusted Memory.",
    points: ["Connect documents and conversations", "Preserve source and provenance", "Structure candidate knowledge"],
  },
  {
    name: "Validate",
    detail: "Evidence",
    description: "Check evidence, scope, and authority before a candidate can guide people or systems.",
    points: ["Review supporting evidence", "Confirm scope and ownership", "Keep human authority visible"],
  },
  {
    name: "Retrieve",
    detail: "Context",
    description: "Find the current, applicable Memory with the evidence and context needed to trust it.",
    points: ["Match the situation and scope", "Surface provenance with the answer", "Prefer current validated versions"],
  },
  {
    name: "Apply",
    detail: "Governed use",
    description: "Put Memory into action while policy and people retain control over consequential decisions.",
    points: ["Use knowledge in the right context", "Respect policy and permissions", "Record what was actually done"],
  },
  {
    name: "Learn",
    detail: "Outcome",
    description: "Compare outcomes with what the organization believed and strengthen Memory through evidence.",
    points: ["Observe the real outcome", "Challenge or confirm prior knowledge", "Create a traceable new version"],
  },
] as const;

const BRAIN_NODES = [
  [204, 122], [265, 92], [328, 108], [385, 145], [422, 198], [397, 250],
  [342, 292], [278, 302], [223, 270], [182, 224], [248, 183], [310, 161],
  [358, 210], [302, 238], [235, 224], [278, 135], [340, 132], [375, 176],
] as const;

const BRAIN_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9],
  [9, 0], [0, 10], [1, 15], [2, 16], [3, 17], [4, 12], [5, 12], [6, 13],
  [7, 13], [8, 14], [9, 14], [10, 11], [11, 12], [12, 13], [13, 14], [14, 10],
  [10, 15], [15, 16], [16, 17], [17, 12], [11, 16], [11, 13], [15, 11],
] as const;

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

function MaesaLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`maesa-logo${compact ? " maesa-logo--compact" : ""}`}>
      <span className="maesa-logo__mark" aria-hidden="true">
        <Image src="/maesa-logo-reference.png" alt="" width={1536} height={1536} priority />
      </span>
      <span className="maesa-logo__word">MAESA</span>
    </span>
  );
}

function NeuralMemoryVisual() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedItem = selectedIndex === null ? null : HERO_EDUCATION[selectedIndex];

  return (
    <div className={`maesa-neural${selectedItem ? " has-selection" : ""}`} aria-label="Sources and evidence connecting into governed Organizational Memory">
      <div className="maesa-neural__halo" aria-hidden="true" />
      <svg className="maesa-neural__svg" viewBox="0 0 560 430" aria-hidden="true">
        <defs>
          <radialGradient id="brainFill" cx="55%" cy="45%" r="58%">
            <stop offset="0" stopColor="#0a78c2" stopOpacity=".34" />
            <stop offset=".62" stopColor="#04172a" stopOpacity=".5" />
            <stop offset="1" stopColor="#02070d" stopOpacity=".08" />
          </radialGradient>
          <linearGradient id="brainLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c9efff" />
            <stop offset=".48" stopColor="#28b8ff" />
            <stop offset="1" stopColor="#0873d6" />
          </linearGradient>
          <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <clipPath id="brainClip">
            <path d="M181 226C154 194 160 145 196 124C197 81 237 57 274 75C306 45 356 57 374 92C416 84 448 115 444 154C478 176 475 228 444 248C447 289 409 316 372 306C344 340 294 341 267 312C224 322 187 294 188 255C171 249 164 239 181 226Z" />
          </clipPath>
        </defs>
        <g className="maesa-neural__incoming">
          <path d="M22 120C86 118 126 152 190 171" />
          <path d="M12 214C76 214 119 218 180 224" />
          <path d="M34 316C98 292 132 272 194 255" />
          <circle cx="82" cy="127" r="3" /><circle cx="118" cy="145" r="2.5" />
          <circle cx="72" cy="214" r="3" /><circle cx="133" cy="219" r="2.5" />
          <circle cx="96" cy="294" r="3" /><circle cx="145" cy="274" r="2.5" />
        </g>
        <path className="maesa-neural__brain-fill" d="M181 226C154 194 160 145 196 124C197 81 237 57 274 75C306 45 356 57 374 92C416 84 448 115 444 154C478 176 475 228 444 248C447 289 409 316 372 306C344 340 294 341 267 312C224 322 187 294 188 255C171 249 164 239 181 226Z" />
        <g clipPath="url(#brainClip)">
          {BRAIN_EDGES.map(([from, to], index) => (
            <line key={`${from}-${to}`} className="maesa-neural__edge" style={{ "--edge": index } as React.CSSProperties} x1={BRAIN_NODES[from][0]} y1={BRAIN_NODES[from][1]} x2={BRAIN_NODES[to][0]} y2={BRAIN_NODES[to][1]} />
          ))}
        </g>
        <path className="maesa-neural__outline" d="M181 226C154 194 160 145 196 124C197 81 237 57 274 75C306 45 356 57 374 92C416 84 448 115 444 154C478 176 475 228 444 248C447 289 409 316 372 306C344 340 294 341 267 312C224 322 187 294 188 255C171 249 164 239 181 226Z" />
        {BRAIN_NODES.map(([x, y], index) => (
          <g key={`${x}-${y}`} className="maesa-neural__node" style={{ "--node": index } as React.CSSProperties}>
            <circle className="maesa-neural__node-glow" cx={x} cy={y} r="8" />
            <circle cx={x} cy={y} r={index % 4 === 0 ? 4.4 : 3} />
          </g>
        ))}
        <g className="maesa-neural__core">
          <circle cx="309" cy="199" r="55" />
          <text x="309" y="191">ORGANIZATIONAL</text>
          <text x="309" y="211">MEMORY</text>
          <text className="maesa-neural__core-note" x="309" y="230">EVIDENCE-BACKED</text>
        </g>
      </svg>
      <div className="maesa-neural__education" role="group" aria-label="Source, Evidence, and Outcome education">
        {HERO_EDUCATION.map((item, index) => {
          const selected = selectedIndex === index;
          return (
            <button
              className={`maesa-neural__source maesa-neural__source--${["one", "two", "three"][index]}${selected ? " is-selected" : ""}`}
              key={item.name}
              type="button"
              aria-pressed={selected}
              aria-controls="hero-education-detail"
              onClick={() => setSelectedIndex(selected ? null : index)}
            >
              <span>0{index + 1}</span><b>{item.name}</b><small>{item.note}</small>
            </button>
          );
        })}
      </div>
      <aside
        className={`maesa-neural__detail${selectedItem ? " is-active" : ""}`}
        id="hero-education-detail"
        aria-live="polite"
        hidden={!selectedItem}
      >
        {selectedItem && (
          <>
            <span>0{selectedIndex! + 1} · {selectedItem.name}</span>
            <p>{selectedItem.description}</p>
            <button type="button" onClick={() => setSelectedIndex(null)} aria-label={`Close ${selectedItem.name} explanation`}>Close <span aria-hidden="true">×</span></button>
          </>
        )}
      </aside>
      <div className="maesa-neural__governance"><span>✓</span> Human validated</div>
    </div>
  );
}

const SCATTERED_SOURCES = [
  {
    code: "EM",
    kind: "email",
    title: "Email",
    note: "A fix in a reply",
    explanation: "Email carries useful fixes in private threads. The answer can remain in one inbox and, without shared evidence, scope, and ownership, is still Source—not Organizational Memory.",
  },
  {
    code: "SS",
    kind: "spreadsheet",
    title: "Spreadsheet",
    note: "A tracker or manual file",
    explanation: "Spreadsheets hold operational context inside trackers and manual files. They can be difficult to discover or interpret later, and do not establish evidence, scope, or authority by themselves.",
  },
  {
    code: "CH",
    kind: "chat",
    title: "Chat",
    note: "A quick expert answer",
    explanation: "Chat can solve a problem once, then bury the reasoning in conversation history. A message is not governed Memory until its evidence, context, and authority are made explicit.",
  },
  {
    code: "SC",
    kind: "support",
    title: "Support case",
    note: "A resolved issue",
    explanation: "A support case may contain a proven resolution, but the lesson can stay trapped in one historical ticket. The outcome still needs evidence, scope, and human validation before reuse.",
  },
  {
    code: "DC",
    kind: "document",
    title: "Document",
    note: "A process change",
    explanation: "Documents preserve important process knowledge, but people may not know where it is, whether it is current, or why to trust it. Publication alone does not make it Memory.",
  },
  {
    code: "MT",
    kind: "meeting",
    title: "Meeting",
    note: "A decision discussed",
    explanation: "Meetings contain decisions and reasoning that can become incomplete, inconsistent, or forgotten. Discussion is Source until the learning is evidenced, owned, and governed.",
  },
  {
    code: "IK",
    kind: "knowledge",
    title: "Internal knowledge",
    note: "Notes and wikis",
    explanation: "Notes and wikis preserve information, but trusted Memory also needs context, evidence, ownership, and governance. A stored page is not automatically an accepted organizational belief.",
  },
  {
    code: "+",
    kind: "tools",
    title: "Other tools",
    note: "Many more sources",
    explanation: "Knowledge is spread across many systems without one governed layer connecting what the organization learned. Fragmented information remains Source until people validate what should become Memory.",
  },
] as const;

const SCATTER_PATHS = [
  "M158 66C250 66 252 210 352 250",
  "M602 66C510 66 508 210 408 250",
  "M152 190C248 190 258 250 350 272",
  "M608 190C512 190 502 250 410 272",
  "M166 365C260 365 270 310 352 296",
  "M594 365C500 365 490 310 408 296",
  "M220 492C302 492 300 348 360 318",
  "M540 492C458 492 460 348 400 318",
] as const;

function SourceGlyph({ kind, code }: { kind: typeof SCATTERED_SOURCES[number]["kind"]; code: string }) {
  if (kind === "email") return <span className={`maesa-scatter__glyph is-${kind}`} aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="4" y="7" width="24" height="18" rx="3" /><path d="m6 10 10 8 10-8" /></svg></span>;
  if (kind === "spreadsheet") return <span className={`maesa-scatter__glyph is-${kind}`} aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="6" y="4" width="20" height="24" rx="2" /><path d="M6 11h20M13 11v17M20 11v17M6 18h20" /></svg></span>;
  if (kind === "chat") return <span className={`maesa-scatter__glyph is-${kind}`} aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 6h22v16H14l-6 5v-5H5z" /><circle cx="11" cy="14" r="1" /><circle cx="16" cy="14" r="1" /><circle cx="21" cy="14" r="1" /></svg></span>;
  if (kind === "support") return <span className={`maesa-scatter__glyph is-${kind}`} aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 18v-4a10 10 0 0 1 20 0v4M6 17h5v8H8a2 2 0 0 1-2-2zM26 17h-5v8h3a2 2 0 0 0 2-2zM21 26c-2 2-5 2-7 1" /></svg></span>;
  if (kind === "document") return <span className={`maesa-scatter__glyph is-${kind}`} aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M8 4h11l6 6v18H8zM19 4v7h6M12 16h9M12 20h9M12 24h6" /></svg></span>;
  if (kind === "meeting") return <span className={`maesa-scatter__glyph is-${kind}`} aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="12" cy="11" r="4" /><circle cx="22" cy="13" r="3" /><path d="M5 27c0-6 3-9 7-9s7 3 7 9M18 20c4-2 8 1 8 7" /></svg></span>;
  if (kind === "knowledge") return <span className={`maesa-scatter__glyph is-${kind}`} aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 5h20v22H6zM11 22V10l10 12V10" /></svg></span>;
  return <span className={`maesa-scatter__glyph is-${kind}`} aria-hidden="true"><span>{code}</span><i /><i /><i /></span>;
}

function ScatteredSources() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedSource = selectedIndex === null ? null : SCATTERED_SOURCES[selectedIndex];

  return (
    <div className={`maesa-scatter${selectedSource ? " has-selection" : ""}`} aria-label="Disconnected sources that have not yet become Organizational Memory">
      <div className="maesa-scatter__visual" aria-hidden="true">
        <svg viewBox="0 0 760 560">
          <defs>
            <radialGradient id="scatterCore" cx="50%" cy="45%" r="60%">
              <stop offset="0" stopColor="#0c4671" stopOpacity=".6" />
              <stop offset=".68" stopColor="#04101c" stopOpacity=".88" />
              <stop offset="1" stopColor="#010407" stopOpacity=".2" />
            </radialGradient>
            <filter id="scatterGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g className="maesa-scatter__connections">
            {SCATTER_PATHS.map((path, index) => <path key={path} className={selectedIndex === index ? "is-selected" : ""} d={path} />)}
          </g>
          <g className="maesa-scatter__fragments">
            {[[314, 198], [448, 191], [292, 294], [469, 304], [329, 369], [432, 374], [379, 166]].map(([x, y], index) => (
              <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${index % 2 ? 8 : -7})`}>
                <g className="maesa-scatter__fragment" style={{ "--fragment": index } as React.CSSProperties}>
                  <rect x="-17" y="-14" width="34" height="28" rx="4" />
                  <path d="M-9 -6H8M-9 0H5M-9 6H10" />
                </g>
              </g>
            ))}
          </g>
          <g className="maesa-scatter__network">
            {[94, 124, 153].map((radius) => <circle key={radius} cx="380" cy="278" r={radius} />)}
            {Array.from({ length: 14 }, (_, index) => {
              const angle = index * (360 / 14);
              const radians = angle * Math.PI / 180;
              const x = 380 + 146 * Math.cos(radians);
              const y = 278 + 146 * Math.sin(radians);
              return <g key={index}><line x1="380" y1="278" x2={x} y2={y} /><circle cx={x} cy={y} r={index % 4 === 0 ? 4 : 2.5} /></g>;
            })}
          </g>
          <g className="maesa-scatter__orbit maesa-scatter__orbit--one"><circle cx="380" cy="124" r="4" /><circle cx="380" cy="124" r="2.5" transform="rotate(135 380 278)" /></g>
          <g className="maesa-scatter__orbit maesa-scatter__orbit--two"><circle cx="380" cy="168" r="3" /><circle cx="380" cy="168" r="2" transform="rotate(210 380 278)" /></g>
          <g className="maesa-scatter__core-cloud">
            <circle cx="340" cy="262" r="72" /><circle cx="410" cy="248" r="82" /><circle cx="432" cy="304" r="66" /><circle cx="355" cy="316" r="78" />
          </g>
        </svg>
        <div className="maesa-scatter__gap"><span>?</span><b>Not yet Memory</b><small>No shared evidence, scope, or owner</small></div>
      </div>
      <div className="maesa-scatter__sources" role="group" aria-label="Sources of scattered organizational information">
        {SCATTERED_SOURCES.map((source, index) => {
          const selected = selectedIndex === index;
          return (
            <button
              className={`maesa-scatter__item maesa-scatter__item--${index + 1}${selected ? " is-selected" : ""}`}
              key={source.title}
              type="button"
              aria-pressed={selected}
              aria-controls="scatter-source-detail"
              onClick={() => setSelectedIndex(selected ? null : index)}
            >
              <SourceGlyph kind={source.kind} code={source.code} />
              <span className="maesa-scatter__item-copy"><b>{source.title}</b><small>{source.note}</small></span>
              <span className="maesa-scatter__item-arrow" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
      <aside className={`maesa-scatter__detail${selectedSource ? " is-active" : ""}`} id="scatter-source-detail" aria-live="polite">
        {selectedSource ? (
          <>
            <span>0{selectedIndex! + 1} · Source</span>
            <b>{selectedSource.title}</b>
            <p>{selectedSource.explanation}</p>
            <button type="button" onClick={() => setSelectedIndex(null)} aria-label="Close source explanation">Close <span aria-hidden="true">×</span></button>
          </>
        ) : (
          <>
            <span>Source ≠ Memory</span>
            <b>Valuable information is still scattered.</b>
            <p>Select a source to see why information stored there is not yet shared, governed Organizational Memory.</p>
          </>
        )}
      </aside>
    </div>
  );
}

function StageGlyph({ index }: { index: number }) {
  if (index === 0) return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 6h13l6 6v22H11zM24 6v7h6M15 19h11M15 24h11M15 29h8" /></svg>;
  if (index === 1) return <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" /><path d="m13 20 5 5 9-10" /></svg>;
  if (index === 2) return <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="17" cy="17" r="10" /><path d="m25 25 9 9" /></svg>;
  if (index === 3) return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 5v5M20 30v5M5 20h5M30 20h5M9 9l4 4M27 27l4 4M31 9l-4 4M13 27l-4 4" /><circle cx="20" cy="20" r="7" /></svg>;
  return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 31V22h6v9M17 31V15h6v16M26 31V8h6v23M6 34h28" /></svg>;
}

function KnowledgeFlywheel() {
  const center = 320;
  const radius = 224;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedStage = selectedIndex === null ? null : FLYWHEEL_STAGES[selectedIndex];

  return (
    <div className={`maesa-flywheel-experience${selectedStage ? " is-paused" : ""}`}>
      <div className="maesa-flywheel" aria-label="Interactive knowledge flywheel: Capture, Validate, Retrieve, Apply, Learn, then return to Capture">
        <svg viewBox="0 0 640 640" aria-hidden="true">
          <defs>
            <radialGradient id="flywheelCore" cx="50%" cy="45%" r="60%">
              <stop offset="0" stopColor="#092b4a" />
              <stop offset=".72" stopColor="#030b14" />
              <stop offset="1" stopColor="#010408" />
            </radialGradient>
            <filter id="flywheelGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g className="maesa-flywheel__inner-motion">
            <g className="maesa-flywheel__grid">
              {[126, 164, 204].map((ring) => <circle key={ring} cx={center} cy={center} r={ring} />)}
              {Array.from({ length: 20 }, (_, index) => <line key={index} x1="320" y1="108" x2="320" y2="126" transform={`rotate(${index * 18} 320 320)`} />)}
            </g>
            <g className="maesa-flywheel__network">
              {Array.from({ length: 12 }, (_, index) => {
                const angle = index * 30;
                const radians = angle * Math.PI / 180;
                const x = center + 154 * Math.cos(radians);
                const y = center + 154 * Math.sin(radians);
                return <g key={index}><line x1={center} y1={center} x2={x} y2={y} /><circle cx={x} cy={y} r={index % 3 === 0 ? 4 : 2.5} /></g>;
              })}
            </g>
          </g>
          <g className="maesa-flywheel__outer-motion">
            <circle className="maesa-flywheel__rail" cx={center} cy={center} r={radius} />
            <circle className="maesa-flywheel__energy" cx={center} cy={center} r={radius} />
            {FLYWHEEL_STAGES.map((stage, index) => {
              const arrowAngle = -54 + index * 72;
              return <g key={stage.name} className="maesa-flywheel__arrow" transform={`rotate(${arrowAngle} ${center} ${center}) translate(${center} ${center - radius})`}><path d="M-7 -7L9 0L-7 7Z" /></g>;
            })}
          </g>
          <g className="maesa-flywheel__particles maesa-flywheel__particles--one"><circle cx="320" cy="82" r="4" /><circle cx="320" cy="82" r="2" transform="rotate(145 320 320)" /></g>
          <g className="maesa-flywheel__particles maesa-flywheel__particles--two"><circle cx="320" cy="130" r="3" /><circle cx="320" cy="130" r="2.5" transform="rotate(210 320 320)" /></g>
          <g className="maesa-flywheel__particles maesa-flywheel__particles--three"><circle cx="320" cy="52" r="2.5" /><circle cx="320" cy="52" r="2" transform="rotate(96 320 320)" /></g>
          <circle className="maesa-flywheel__core-ring" cx={center} cy={center} r="104" />
          <circle className="maesa-flywheel__core" cx={center} cy={center} r="90" />
          <image href="/maesa-logo-reference.png" x="265" y="260" width="110" height="110" />
          <text className="maesa-flywheel__core-label" x="320" y="388">GOVERNED MEMORY</text>
        </svg>
        <div className="maesa-flywheel__controls" role="group" aria-label="Knowledge flywheel stages">
          {FLYWHEEL_STAGES.map((stage, index) => {
          const angle = -90 + index * 72;
          const radians = angle * Math.PI / 180;
          const x = 50 + 35 * Math.cos(radians);
          const y = 50 + 35 * Math.sin(radians);
          const selected = selectedIndex === index;
          return (
            <button
              className={`maesa-flywheel__stage${selected ? " is-selected" : ""}`}
              style={{ "--stage": index, "--stage-x": `${x}%`, "--stage-y": `${y}%` } as React.CSSProperties}
              key={stage.name}
              type="button"
              aria-pressed={selected}
              aria-controls="flywheel-detail"
              onClick={() => setSelectedIndex(selected ? null : index)}
            >
              <span className="maesa-flywheel__stage-disc"><StageGlyph index={index} /></span>
              <span className="maesa-flywheel__stage-name">{stage.name}</span>
              <span className="maesa-flywheel__stage-detail">0{index + 1} · {stage.detail}</span>
            </button>
          );
          })}
        </div>
        <span className="maesa-flywheel__caption">Continuous, evidence-backed learning</span>
      </div>
      <aside className={`maesa-flywheel-detail${selectedStage ? " is-active" : ""}`} id="flywheel-detail" aria-live="polite">
        {selectedStage ? (
          <>
            <span className="maesa-flywheel-detail__index">0{selectedIndex! + 1}</span>
            <span className="maesa-eyebrow"><i /> {selectedStage.detail}</span>
            <h3>{selectedStage.name}</h3>
            <p>{selectedStage.description}</p>
            <ul>{selectedStage.points.map((point) => <li key={point}>{point}</li>)}</ul>
            <button className="maesa-flywheel-detail__resume" type="button" onClick={() => setSelectedIndex(null)}>Resume flywheel <Arrow /></button>
          </>
        ) : (
          <>
            <span className="maesa-flywheel-detail__index">01—05</span>
            <span className="maesa-eyebrow"><i /> Explore the cycle</span>
            <h3>Inspect how Memory moves.</h3>
            <p>Select any stage to pause the system and see how source material becomes evidence-backed, governed Organizational Memory.</p>
            <span className="maesa-flywheel-detail__hint">Select a stage on the flywheel</span>
          </>
        )}
      </aside>
    </div>
  );
}

function SystemStoryDiagram({ scene, phase, label }: { scene: Extract<UseCaseVisual, { kind: "system" }>["scene"]; phase: "before" | "after"; label: string }) {
  const after = phase === "after";

  return (
    <div className={`maesa-system-story maesa-system-story--${scene} is-${phase}`} role="img" aria-label={label} data-visual={`${scene}-${phase}`}>
      <svg viewBox="0 0 560 410" aria-hidden="true">
        <defs>
          <linearGradient id={`${scene}-${phase}-panel`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={after ? "#08283c" : "#17131b"} />
            <stop offset="1" stopColor="#02070c" />
          </linearGradient>
          <filter id={`${scene}-${phase}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect className="maesa-system-story__frame" x="1" y="1" width="558" height="408" rx="20" fill={`url(#${scene}-${phase}-panel)`} />
        <path className="maesa-system-story__grid" d="M0 82H560M0 164H560M0 246H560M0 328H560M112 0V410M224 0V410M336 0V410M448 0V410" />

        {scene === "version" && (after ? (
          <>
            <g className="maesa-system-story__ghost-card"><rect x="95" y="112" width="224" height="176" rx="14" /><path d="M126 160h98M126 190h142M126 220h112" /></g>
            <g className="maesa-system-story__card is-current"><rect x="194" y="74" width="270" height="222" rx="16" /><path d="M232 130h145M232 168h184M232 206h152" /><circle cx="411" cy="249" r="24" /><path d="m399 249 9 9 17-20" /></g>
            <path className="maesa-system-story__link is-active" d="M148 320c58 30 202 30 271-2" />
            <text x="223" y="333">VERSION HISTORY PRESERVED</text>
            <text className="is-accent" x="232" y="112">CURRENT · VALIDATED</text>
          </>
        ) : (
          <>
            <g className="maesa-system-story__card is-warning"><rect x="74" y="103" width="230" height="196" rx="16" /><path d="M110 157h132M110 195h154M110 233h112" /><text x="110" y="275">OLD PROCESS · V1</text></g>
            <g className="maesa-system-story__card is-conflict"><rect x="256" y="73" width="230" height="196" rx="16" /><path d="M292 127h132M292 165h154M292 203h112" /><text x="292" y="245">UPDATED · V3</text></g>
            <circle className="maesa-system-story__question" cx="280" cy="320" r="36" /><text className="is-question" x="270" y="333">?</text>
            <path className="maesa-system-story__link is-broken" d="M180 300 247 320M313 320l74-50" />
          </>
        ))}

        {scene === "outcome" && (after ? (
          <>
            <path className="maesa-system-story__link is-active" d="M116 218A166 134 0 1 1 203 337" />
            <path className="maesa-system-story__arrow" d="m188 326 20 12-22 9" />
            <g className="maesa-system-story__node"><circle cx="116" cy="218" r="54" /><path d="M91 232h50M104 205h24" /><text x="75" y="292">OUTCOME</text></g>
            <g className="maesa-system-story__node"><circle cx="282" cy="82" r="54" /><path d="m258 82 17 17 32-38" /><text x="243" y="156">EVIDENCE</text></g>
            <g className="maesa-system-story__node"><circle cx="445" cy="218" r="54" /><path d="M423 194h44v48h-44zM433 208h24M433 220h17" /><text x="408" y="292">MEMORY</text></g>
            <g className="maesa-system-story__authority"><circle cx="282" cy="328" r="43" /><path d="M262 330c12-19 28-19 40 0M272 310a10 10 0 1 0 20 0" /><text x="235" y="392">HUMAN REVIEW</text></g>
          </>
        ) : (
          <>
            <path className="maesa-system-story__link is-broken" d="M122 214c40-104 148-128 223-77M405 180c38 70 0 142-74 162M270 349c-90 4-154-54-151-120" />
            {[0, 1, 2].map((index) => <g key={index} transform={`translate(${120 + index * 142} ${index === 1 ? 105 : 252})`} className="maesa-system-story__incident"><path d="M0-42 42 36h-84Z" /><path d="M0-18v27M0 20v2" /></g>)}
            <circle className="maesa-system-story__question" cx="280" cy="220" r="52" /><text className="is-question" x="270" y="233">?</text>
            <text x="208" y="302">LESSON NOT CAPTURED</text>
          </>
        ))}

        {scene === "trust" && (after ? (
          <>
            <g className="maesa-system-story__evidence"><rect x="54" y="82" width="132" height="88" rx="12" /><path d="M78 113h83M78 137h58" /><text x="80" y="199">SOURCE</text></g>
            <g className="maesa-system-story__evidence"><rect x="54" y="238" width="132" height="88" rx="12" /><path d="M78 269h83M78 293h58" /><text x="73" y="355">EVIDENCE</text></g>
            <path className="maesa-system-story__link is-active" d="M186 126 254 178M186 282l68-52" />
            <g className="maesa-system-story__memory"><path d="M257 105h219v198H257z" /><path d="M292 162h145M292 202h116M292 242h134" /><circle cx="434" cy="273" r="21" /><path d="m423 273 8 8 15-18" /><text className="is-accent" x="292" y="139">CURRENT MEMORY</text></g>
            <g className="maesa-system-story__authority"><path d="M323 334h90l-10 42h-70z" /><path d="m344 353 10 10 20-24" /><text x="320" y="399">HUMAN VALIDATED</text></g>
          </>
        ) : (
          <>
            {[0, 1, 2].map((index) => <g key={index} transform={`translate(${52 + index * 160} ${78 + (index % 2) * 70})`} className={`maesa-system-story__answer answer-${index + 1}`}><rect width="144" height="166" rx="14" /><path d="M24 48h92M24 79h71M24 110h84" /><path className="maesa-system-story__answer-arrow" d={index === 0 ? "m49 140 38-18" : index === 1 ? "m48 122 42 24" : "m46 142 46-35"} /></g>)}
            <circle className="maesa-system-story__question" cx="280" cy="342" r="38" /><text className="is-question" x="270" y="355">?</text>
            <text x="188" y="400">NO EVIDENCE · NO AUTHORITY</text>
          </>
        ))}

        {scene === "ai-context" && (after ? (
          <>
            <g className="maesa-system-story__memory is-ai-memory"><path d="M55 89h180v232H55z" /><circle cx="145" cy="164" r="48" /><path d="M109 164h72M145 128v72" /><path d="M89 250h112M89 282h84" /><text className="is-accent" x="83" y="118">GOVERNED MEMORY</text></g>
            <path className="maesa-system-story__link is-active" d="M235 205h77" /><path className="maesa-system-story__arrow" d="m302 194 18 11-18 11" />
            <g className="maesa-system-story__ai"><circle cx="371" cy="205" r="55" /><path d="M344 186h54v38h-54zM355 174v12M387 174v12M359 203h3M381 203h3" /><text x="354" y="286">AI</text></g>
            <path className="maesa-system-story__link is-active" d="M426 205h67" /><g className="maesa-system-story__grounded"><rect x="470" y="124" width="74" height="162" rx="12" /><path d="M486 158h42M486 188h42M486 218h30" /><circle cx="509" cy="251" r="13" /><path d="m502 251 5 5 10-12" /></g>
            <g className="maesa-system-story__authority"><path d="M243 344h255" /><text x="250" y="373">PROVENANCE · SCOPE · HUMAN AUTHORITY</text></g>
          </>
        ) : (
          <>
            {[0, 1, 2, 3].map((index) => <g key={index} transform={`translate(${30 + index * 78} ${72 + (index % 2) * 180})`} className="maesa-system-story__source-fragment"><rect width="62" height="82" rx="9" /><path d="M14 24h34M14 42h27M14 60h32" /></g>)}
            <path className="maesa-system-story__link is-broken" d="M90 110c72 10 92 80 170 90M168 286c35-60 69-64 98-70M245 108l30 75" />
            <g className="maesa-system-story__ai is-uncertain"><circle cx="320" cy="205" r="60" /><path d="M291 183h58v42h-58zM304 170v13M336 170v13M307 203h3M332 203h3" /><text className="is-question" x="307" y="301">?</text></g>
            <path className="maesa-system-story__link is-broken" d="M380 188 437 129M380 222l57 61" />
            <g className="maesa-system-story__uncertain-output"><rect x="436" y="72" width="96" height="118" rx="12" /><rect x="436" y="220" width="96" height="118" rx="12" /><path d="M453 105h61M453 132h46M453 253h61M453 280h38" /></g>
            <text x="399" y="384">FRAGMENTED CONTEXT</text>
          </>
        ))}
      </svg>
    </div>
  );
}

function UseCaseVisualPanel({ visual, phase }: { visual: UseCaseVisual; phase: "before" | "after" }) {
  const alt = phase === "before" ? visual.beforeAlt : visual.afterAlt;

  if (visual.kind === "system") {
    return <SystemStoryDiagram scene={visual.scene} phase={phase} label={alt} />;
  }

  return (
    <div className="maesa-use-case-story__photo is-photo" data-visual={`${visual.src}-${phase}`}>
      <Image src={visual.src} alt={alt} fill sizes="(max-width: 620px) 100vw, 50vw" />
    </div>
  );
}

function UseCaseStories() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedCase = selectedIndex === null ? null : USE_CASES[selectedIndex];
  const storyHeadingRef = useRef<HTMLHeadingElement>(null);
  const problemButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const lastSelectedRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedIndex !== null) {
      storyHeadingRef.current?.focus();
    } else if (lastSelectedRef.current !== null) {
      problemButtonsRef.current[lastSelectedRef.current]?.focus();
    }
  }, [selectedIndex]);

  const selectProblem = (index: number) => {
    lastSelectedRef.current = index;
    setSelectedIndex(index);
  };

  return (
    <div className={`maesa-use-cases__experience${selectedCase ? " is-detail" : ""}`} id="use-case-story">
      {selectedCase ? (
        <article className="maesa-use-case-story" aria-live="polite">
          <div className="maesa-use-case-story__header">
            <div>
              <span className="maesa-use-case-story__index">Problem {String(selectedIndex! + 1).padStart(2, "0")}</span>
              <h3 ref={storyHeadingRef} tabIndex={-1}>{selectedCase.title}</h3>
            </div>
            <button className="maesa-use-case-story__back" type="button" onClick={() => setSelectedIndex(null)}><span aria-hidden="true">←</span> Back to problems</button>
          </div>

          <div className="maesa-use-case-story__comparison">
            <section className="maesa-use-case-story__state is-before" aria-labelledby="before-maesa-title">
              <div className={`maesa-use-case-story__visual${selectedCase.visual.kind === "system" ? " is-system" : ""}`}>
                <UseCaseVisualPanel visual={selectedCase.visual} phase="before" />
                <span className="maesa-use-case-story__cue">{selectedCase.beforeCue}</span>
              </div>
              <div className="maesa-use-case-story__state-copy">
                <span>Before MAESA</span>
                <h4 id="before-maesa-title">{selectedCase.before}</h4>
              </div>
            </section>

            <div className="maesa-use-case-story__bridge" aria-hidden="true"><span>Source</span><i>→</i><span>Governed Memory</span></div>

            <section className="maesa-use-case-story__state is-after" aria-labelledby="after-maesa-title">
              <div className={`maesa-use-case-story__visual${selectedCase.visual.kind === "system" ? " is-system" : ""}`}>
                <UseCaseVisualPanel visual={selectedCase.visual} phase="after" />
                <span className="maesa-use-case-story__cue">{selectedCase.afterCue}</span>
              </div>
              <div className="maesa-use-case-story__state-copy">
                <span>After MAESA</span>
                <h4 id="after-maesa-title">{selectedCase.after}</h4>
              </div>
            </section>
          </div>

          <div className="maesa-use-case-story__truth">
            <span>What is actually going wrong</span>
            <p>{selectedCase.problem}</p>
            <small>AI may propose. People and policy govern what becomes Memory.</small>
          </div>
        </article>
      ) : (
        <ol className="maesa-use-cases__list" aria-label="Real problems MAESA can address">
          {USE_CASES.map((useCase, index) => (
            <li key={useCase.title}>
              <button
                ref={(element) => { problemButtonsRef.current[index] = element; }}
                type="button"
                aria-controls="use-case-story"
                onClick={() => selectProblem(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{useCase.title}</b>
                <i aria-hidden="true">→</i>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BenefitIcon({ type }: { type: "retrieve" | "govern" | "learn" }) {
  if (type === "retrieve") return <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="21" cy="21" r="10" /><path d="m29 29 9 9" /></svg>;
  if (type === "govern") return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6 38 12v10c0 9-5 15-14 20C15 37 10 31 10 22V12Z" /><path d="m17 24 5 5 10-11" /></svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 38V25h8v13M20 38V17h8v21M32 38V9h8v29" /><path d="m9 17 9-7 8 4 13-9" /></svg>;
}

function LandingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="maesa-header">
      <div className="maesa-shell maesa-header__inner">
        <a className="maesa-brand-link" href="#top" aria-label="MAESA home"><MaesaLogo /></a>
        <nav id="maesa-navigation" className={`maesa-nav${open ? " is-open" : ""}`} aria-label="Primary navigation">
          <a href="#flywheel" onClick={() => setOpen(false)}>Product</a>
          <a href="#solution" onClick={() => setOpen(false)}>Solutions</a>
          <a href="#problem" onClick={() => setOpen(false)}>About</a>
        </nav>
        <a className="maesa-button maesa-button--small maesa-header__cta" href={WAITLIST_URL} target="_blank" rel="noopener noreferrer">Join Waitlist <Arrow /></a>
        <button className="maesa-menu" type="button" aria-expanded={open} aria-controls="maesa-navigation" onClick={() => setOpen((value) => !value)}>
          <span /><span /><span /><b className="maesa-sr-only">Toggle navigation</b>
        </button>
      </div>
    </header>
  );
}

export function ZendeskLandingPage() {
  return (
    <div className="oip-zendesk-page maesa-page" id="top">
      <a className="maesa-skip-link" href="#main-content">Skip to content</a>
      <LandingHeader />
      <main id="main-content">
        <section className="maesa-hero" aria-labelledby="maesa-hero-title">
          <div className="maesa-shell maesa-hero__grid">
            <div className="maesa-hero__copy">
              <span className="maesa-eyebrow"><i /> Organizational Intelligence Platform</span>
              <h1 id="maesa-hero-title">This may not be<br />a people problem.</h1>
              <h2>It may be a memory problem.</h2>
              <p>MAESA turns scattered company knowledge and real-world experience into living, evidence-backed Organizational Memory that people and AI can use.</p>
              <div className="maesa-actions">
                <a className="maesa-button maesa-button--light" href={WAITLIST_URL} target="_blank" rel="noopener noreferrer">Join Waitlist <Arrow /></a>
                <a className="maesa-button maesa-button--ghost" href="#flywheel"><span className="maesa-play" aria-hidden="true">▶</span> See How It Works</a>
              </div>
              <div className="maesa-trust-note"><span>✓</span> AI may propose. People and policy govern what becomes Memory.</div>
            </div>
            <NeuralMemoryVisual />
          </div>
        </section>

        <section className="maesa-section maesa-problem" id="problem" aria-labelledby="problem-title">
          <div className="maesa-shell maesa-two-column">
            <div className="maesa-section-copy">
              <span className="maesa-eyebrow"><i /> The problem</span>
              <h2 id="problem-title">Important knowledge<br />gets lost.</h2>
              <p>Answers are scattered across emails, chats, documents, internal knowledge, spreadsheets, support cases, meetings, and other tools. When someone leaves or a similar issue returns, teams often start from zero.</p>
              <div className="maesa-principle"><span>Source ≠ Memory</span><p>What happened becomes organizational knowledge only when evidence, scope, and human validation make it trustworthy.</p></div>
            </div>
            <ScatteredSources />
          </div>
        </section>

        <section className="maesa-section maesa-flywheel-section" id="flywheel" aria-labelledby="flywheel-title">
          <div className="maesa-shell maesa-flywheel-layout">
            <div className="maesa-section-copy maesa-flywheel-copy">
              <span className="maesa-eyebrow"><i /> The knowledge flywheel</span>
              <h2 id="flywheel-title">Turn knowledge<br />into momentum.</h2>
              <p>Capture what happened, validate the evidence, retrieve the right Memory, apply it with governance, and learn from the outcome.</p>
            </div>
            <KnowledgeFlywheel />
          </div>
        </section>

        <section className="maesa-section maesa-solution" id="solution" aria-labelledby="solution-title">
          <div className="maesa-shell">
            <div className="maesa-solution__intro">
              <div className="maesa-section-copy">
                <span className="maesa-eyebrow"><i /> The solution</span>
                <h2 id="solution-title">A company memory<br />for your organization.</h2>
              </div>
              <p>MAESA connects knowledge across work, structures what was learned, and makes it usable by people and AI—with provenance, scope, and human authority intact.</p>
            </div>
            <div className="maesa-benefits">
              <article><span className="maesa-benefit-icon"><BenefitIcon type="retrieve" /></span><b>Find answers faster</b><p>Retrieve relevant, trusted Memory from past experience—with the reason it applies.</p></article>
              <article><span className="maesa-benefit-icon"><BenefitIcon type="govern" /></span><b>Keep people in authority</b><p>Make evidence, scope, validation, and policy visible before knowledge guides action.</p></article>
              <article><span className="maesa-benefit-icon"><BenefitIcon type="learn" /></span><b>Learn from outcomes</b><p>Turn every confirmed result into stronger, versioned organizational knowledge.</p></article>
            </div>
          </div>
        </section>

        <section className="maesa-section maesa-use-cases" id="use-cases" aria-labelledby="use-cases-title">
          <div className="maesa-shell">
            <div className="maesa-use-cases__intro">
              <span className="maesa-eyebrow"><i /> Real problems</span>
              <h2 id="use-cases-title">Problems your team<br />already knows.</h2>
              <p>Select one situation to see how governed Organizational Memory changes the work — without removing human judgment.</p>
            </div>
            <UseCaseStories />
          </div>
        </section>

        <section className="maesa-cta" id="get-started" aria-labelledby="cta-title">
          <div className="maesa-shell">
            <div className="maesa-cta__panel">
              <div><span className="maesa-eyebrow"><i /> Get started</span><h2 id="cta-title">Build a more intelligent organization.</h2><p>See how MAESA can help your team preserve what it learns and reuse it with confidence.</p></div>
              <a className="maesa-button maesa-button--light" href={WAITLIST_URL} target="_blank" rel="noopener noreferrer">Join Waitlist <Arrow /></a>
              <div className="maesa-cta__wave" aria-hidden="true"><span /><span /><span /><span /></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="maesa-footer">
        <div className="maesa-shell">
          <div className="maesa-footer__top">
            <div className="maesa-footer__identity"><a href="#top" aria-label="MAESA home"><MaesaLogo /></a><p>Evidence-backed Organizational Memory for people and AI.</p></div>
            <address className="maesa-footer__contact">
              <span>Contact Calvin</span>
              <a href="mailto:fxcalvintangka@gmail.com">fxcalvintangka@gmail.com</a>
              <a href="https://wa.me/628971689440" target="_blank" rel="noopener noreferrer">WhatsApp · +62 897-1689-440</a>
            </address>
          </div>
          <div className="maesa-footer__bottom"><span>© 2026 MAESA. All rights reserved.</span><span>AI may propose. Humans govern.</span></div>
        </div>
      </footer>
    </div>
  );
}
