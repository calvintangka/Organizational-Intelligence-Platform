"use client";

import { useState, type KeyboardEvent } from "react";

const WAITLIST_URL = "https://docs.google.com/forms/d/e/1FAIpQLScet84g9pbR0-rvZ4F7z93ve61QB1SuGQYXYy3ENl7Y-q4XAA/viewform?usp=publish-editor";

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`zp-logo${inverse ? " is-inverse" : ""}`} aria-label="OIP">
      <span className="zp-logo-mark" aria-hidden="true"><i /><i /><i /></span>
      <span className="zp-logo-word">OIP</span>
    </span>
  );
}

function ArrowIcon() {
  return <span aria-hidden="true" className="zp-arrow">↗</span>;
}

function ChevronIcon() {
  return <span aria-hidden="true" className="zp-chevron">⌄</span>;
}

function CheckIcon() {
  return <span aria-hidden="true" className="zp-check">✓</span>;
}

function MemoryMini({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`zp-memory-mini${compact ? " is-compact" : ""}`}>
      <div className="zp-memory-mini-top">
        <span className="zp-memory-glyph" aria-hidden="true">M</span>
        <span><b>ORGANIZATIONAL MEMORY</b><small>Validated learning · v2</small></span>
        <span className="zp-status">Trusted</span>
      </div>
      <p>Location permission must be enabled before mobile attendance can be recorded.</p>
      {!compact && (
        <div className="zp-memory-mini-meta">
          <span><b>Scope</b> Mobile app</span>
          <span><b>Evidence</b> 4 sources</span>
          <span><b>Owner</b> Support ops</span>
        </div>
      )}
    </div>
  );
}

function MemoryProof() {
  return (
    <div className="zp-proof-shell" aria-label="OIP organizational memory product preview">
      <div className="zp-proof-toolbar">
        <div className="zp-proof-brand"><span className="zp-proof-dot" /> <span>OIP workspace</span></div>
        <span className="zp-proof-context">Support operations <ChevronIcon /></span>
        <span className="zp-proof-avatar">JR</span>
      </div>
      <div className="zp-proof-body">
        <aside className="zp-proof-sidebar">
          <span className="zp-proof-sidebar-label">WORKSPACE</span>
          <span className="is-selected">Memory</span>
          <span>Experiences</span>
          <span>Challenges</span>
          <span>Retrieval</span>
          <span className="zp-proof-sidebar-label is-lower">GOVERNANCE</span>
          <span>Validation queue</span>
          <span>Audit history</span>
        </aside>
        <div className="zp-proof-main">
          <div className="zp-proof-heading">
            <div><span className="zp-overline">EXAMPLE MEMORY / M-014</span><h3>Mobile attendance location access</h3></div>
            <span className="zp-live-badge"><CheckIcon /> Validated</span>
          </div>
          <p className="zp-proof-lead">Location permission must be enabled before mobile attendance can be recorded.</p>
          <div className="zp-proof-grid">
            <div className="zp-proof-card zp-proof-evidence">
              <div className="zp-card-head"><span>Evidence</span><b>Linked</b></div>
              <div className="zp-evidence-row"><span className="zp-source-mark is-support">S</span><span><b>Resolved support case</b><small>Case #4821 · 12 Jun 2026</small></span><CheckIcon /></div>
              <div className="zp-evidence-row"><span className="zp-source-mark is-monitor">↗</span><span><b>Resolution outcome</b><small>Confirmed by customer · 12 Jun 2026</small></span><CheckIcon /></div>
              <div className="zp-evidence-row"><span className="zp-source-mark is-review">R</span><span><b>Human review</b><small>J. Reyes · Support ops</small></span><CheckIcon /></div>
            </div>
            <div className="zp-proof-card zp-proof-scope">
              <div className="zp-card-head"><span>Why this is trusted</span><b>Explainable</b></div>
              <div className="zp-trust-score"><strong>Evidence-backed</strong><span>current support</span></div>
              <div className="zp-trust-line"><i style={{ width: "100%" }} /></div>
              <div className="zp-trust-list"><span><CheckIcon /> Human validated</span><span><CheckIcon /> Reuse outcome recorded</span><span><CheckIcon /> No open challenges</span></div>
            </div>
          </div>
          <div className="zp-proof-footer"><span><b>Scope</b> Mobile attendance · All support teams</span><span><b>History</b> v1 → v2 <ArrowIcon /></span></div>
        </div>
      </div>
    </div>
  );
}

function LearningLoop() {
  return (
    <div className="zp-loop-card" aria-label="Source to outcome learning loop">
      <div className="zp-loop-top"><span className="zp-overline">THE OIP LEARNING LOOP</span><span className="zp-loop-hint">A governed path from work to reusable knowledge</span></div>
      <div className="zp-loop-flow">
        <div className="zp-loop-node is-source"><span className="zp-loop-node-icon">S</span><b>Source</b><small>What happened</small></div>
        <span className="zp-loop-connector" aria-hidden="true">→</span>
        <div className="zp-loop-node is-evidence"><span className="zp-loop-node-icon">E</span><b>Evidence</b><small>Why believe it</small></div>
        <span className="zp-loop-connector" aria-hidden="true">→</span>
        <div className="zp-loop-node is-memory"><span className="zp-loop-node-icon">M</span><b>Memory</b><small>Human validated</small></div>
        <span className="zp-loop-connector" aria-hidden="true">→</span>
        <div className="zp-loop-node is-retrieval"><span className="zp-loop-node-icon">↗</span><b>Retrieval</b><small>When relevant</small></div>
        <span className="zp-loop-connector" aria-hidden="true">→</span>
        <div className="zp-loop-node is-outcome"><span className="zp-loop-node-icon">✓</span><b>Outcome</b><small>Learning evolves</small></div>
      </div>
    </div>
  );
}

type LifecycleTab = "source" | "challenge" | "retrieval";

function LifecycleDemo() {
  const [active, setActive] = useState<LifecycleTab>("source");
  const tabs: Array<{ key: LifecycleTab; label: string; note: string }> = [
    { key: "source", label: "Experience → Memory", note: "A solved problem becomes reusable learning." },
    { key: "challenge", label: "Challenge → Version", note: "Contradiction starts a review; history stays intact." },
    { key: "retrieval", label: "Context → Retrieval", note: "Relevant Memory arrives with the reason it applies." }
  ];

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActive(nextTab.key);
    document.getElementById(`oip-lifecycle-tab-${nextTab.key}`)?.focus();
  }

  return (
    <div className="zp-lifecycle-demo">
      <div className="zp-tabs" role="tablist" aria-label="OIP product stories">
        {tabs.map((tab, index) => <button key={tab.key} id={`oip-lifecycle-tab-${tab.key}`} type="button" role="tab" aria-selected={active === tab.key} aria-controls="oip-lifecycle-panel" tabIndex={active === tab.key ? 0 : -1} className={active === tab.key ? "is-active" : ""} onClick={() => setActive(tab.key)} onKeyDown={(event) => handleTabKeyDown(event, index)}>{tab.label}</button>)}
      </div>
      <div className="zp-tab-panel" id="oip-lifecycle-panel" role="tabpanel" aria-labelledby={`oip-lifecycle-tab-${active}`}>
        <div className="zp-tab-copy"><span className="zp-overline">{active === "source" ? "FROM EXPERIENCE" : active === "challenge" ? "MEMORY EVOLVES" : "RELEVANT CONTEXT"}</span><h3>{tabs.find((tab) => tab.key === active)?.note}</h3></div>
        {active === "source" && <div className="zp-source-to-memory"><div className="zp-ticket"><span className="zp-ticket-label">SOURCE · SUPPORT CASE #4821</span><b>“The mobile app won&apos;t let me record attendance.”</b><small>Customer reply · 12 Jun 2026</small></div><span className="zp-big-arrow">→</span><MemoryMini /></div>}
        {active === "challenge" && <div className="zp-version-flow"><div className="zp-version-card is-old"><span className="zp-version-label">MEMORY V1</span><b>Location access is required for attendance.</b><small>Validated · 3 outcomes</small></div><span className="zp-challenge-mark">!</span><div className="zp-version-card is-new"><span className="zp-version-label">MEMORY V2</span><b>Location access is required on Android 14 devices.</b><small>Scope narrowed · J. Reyes</small></div></div>}
        {active === "retrieval" && <div className="zp-retrieval-flow"><div className="zp-query-card"><span className="zp-version-label">CURRENT SITUATION</span><b>“Attendance fails after the latest phone update.”</b><small>New support case · Android 14</small></div><span className="zp-big-arrow">→</span><div className="zp-retrieval-result"><span className="zp-status">MATCHED MEMORY</span><MemoryMini compact /><small className="zp-applies"><CheckIcon /> Applies because device scope and issue context match.</small></div></div>}
      </div>
    </div>
  );
}

function SharedMemoryScene() {
  return (
    <div className="zp-shared-scene" aria-label="People systems and AI agents sharing organizational memory">
      <div className="zp-shared-source">
        <span className="zp-shared-kicker">SYSTEMS · SOURCE</span>
        <b>Support case #4821</b>
        <small>Resolution outcome returned and linked as evidence.</small>
      </div>
      <div className="zp-shared-connector"><span>evidence + validation</span></div>
      <div className="zp-shared-memory">
        <div className="zp-shared-memory-top">
          <span className="zp-memory-glyph" aria-hidden="true">M</span>
          <span><small>ORGANIZATIONAL MEMORY · M-014</small><b>Location permission is required for mobile attendance.</b></span>
        </div>
        <div className="zp-shared-memory-meta">
          <span><CheckIcon /><b>Human validated</b></span>
          <span><b>Scope</b> Mobile support</span>
          <span><b>Authority</b> Support Ops</span>
        </div>
      </div>
      <div className="zp-shared-connector is-output"><span>governed retrieval</span></div>
      <div className="zp-shared-consumers">
        <div className="zp-shared-actor is-people"><span>People</span><b>Retrieve &amp; decide</b><small>Validate learning and govern what becomes accepted.</small><em><CheckIcon /> Accepted by Support Ops</em></div>
        <div className="zp-shared-actor is-systems"><span>Systems</span><b>Return outcomes</b><small>What happened next can strengthen or challenge Memory.</small><em>Outcome linked · resolved</em></div>
        <div className="zp-shared-actor is-agents"><span>AI</span><b>Retrieve &amp; propose</b><small>Use governed Memory; act only within granted authority.</small><em>Proposal · review required</em></div>
      </div>
    </div>
  );
}

function FAQ() {
  const items = [
    ["Is OIP a knowledge base?", "Not quite. A knowledge base stores published content; OIP preserves what the organization has learned, including its evidence, scope, validation, outcomes, challenges, and history."],
    ["Does OIP replace our existing systems?", "No. Support, documents, conversations, systems, and agent activity can remain where they are. OIP is the organizational memory layer around those sources."],
    ["Does OIP let AI decide what is true?", "AI can summarize, retrieve, and propose learning. People and policy govern what becomes accepted Organizational Memory and what action is authorized."],
    ["What is available today?", "OIP is an early foundation focused on Source → Evidence → Proposed Learning → Human Validation → Organizational Memory → Retrieval → Outcomes. Broader integrations and intelligence capabilities are future direction."],
  ];
  return <div className="zp-faq-list">{items.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>;
}

function LandingNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="zp-announce"><span><b>OIP is shaping the next layer of organizational infrastructure.</b> A small number of design partnerships are open.</span><a href="#access">Talk to us <ArrowIcon /></a></div>
      <header className="zp-header">
        <nav className="zp-nav" aria-label="Primary navigation">
          <a href="#top" aria-label="OIP home"><Logo /></a>
          <div id="oip-navigation" className={`zp-nav-links${open ? " is-open" : ""}`}>
            <a href="#product" onClick={() => setOpen(false)}>Product <ChevronIcon /></a>
            <a href="#how-it-works" onClick={() => setOpen(false)}>How it works</a>
            <a href="#direction" onClick={() => setOpen(false)}>Direction</a>
            <a href="#access" onClick={() => setOpen(false)}>Design partners</a>
          </div>
          <div className="zp-nav-actions"><a className="zp-sign-in" href="/?auth=login">Sign in</a><a className="zp-button zp-button-dark" href="#access">Talk to us <ArrowIcon /></a></div>
          <button type="button" className="zp-menu-toggle" aria-expanded={open} aria-controls="oip-navigation" onClick={() => setOpen((value) => !value)}><span /><span /><span /><b className="zp-sr-only">Menu</b></button>
        </nav>
      </header>
    </>
  );
}

export function ZendeskLandingPage() {
  return (
    <div className="oip-zendesk-page" id="top">
      <a className="zp-skip-link" href="#main-content">Skip to content</a>
      <LandingNav />
      <main id="main-content">
        <section className="zp-hero" id="product">
          <div className="zp-container zp-hero-grid">
            <div className="zp-hero-copy"><span className="zp-eyebrow">ORGANIZATIONAL MEMORY &amp; INTELLIGENCE PLATFORM</span><h1>Every solved problem should make the organization <em>smarter.</em></h1><p>OIP turns scattered company knowledge and real-world experience into living, evidence-backed Organizational Memory that people and AI agents can use.</p><div className="zp-hero-actions"><a className="zp-button zp-button-dark" href={WAITLIST_URL}>Join the Waitlist <ArrowIcon /></a><a className="zp-text-link" href="#how-it-works">See how OIP works <ArrowIcon /></a></div><div className="zp-hero-note"><CheckIcon /> AI may propose knowledge. Humans and policy govern it.</div></div>
            <div className="zp-hero-proof"><MemoryProof /><div className="zp-proof-caption"><span>ONE MEMORY, FULLY EXPLAINED</span><span>Source · evidence · scope · validation · version</span></div></div>
          </div>
        </section>

        <section className="zp-signal-strip" aria-label="Examples of organizational learning"><div className="zp-container zp-signal-inner"><span className="zp-signal-lead">MAKE THE LEARNING LAST</span><span>Support resolution</span><i /><span>Incident review</span><i /><span>Sales objection</span><i /><span>Onboarding gap</span><i /><span>Operational outcome</span></div></section>

        <section className="zp-section zp-loop-section" id="how-it-works"><div className="zp-container"><div className="zp-section-intro"><div><span className="zp-overline">THE PROBLEM WITH SCATTERED KNOWLEDGE</span><h2>Work happens everywhere. The learning should stay with you.</h2></div><p>Companies already have the information. What they lack is a durable, explainable way to preserve what was learned, why it is believed, and whether it still applies.</p></div><LearningLoop /><div className="zp-section-callout"><span className="zp-callout-number">01</span><p>A Source is not automatically truth. OIP gives experiences a governed path to become organizational knowledge.</p><a className="zp-text-link" href="#memory">Explore the Memory model <ArrowIcon /></a></div></div></section>

        <section className="zp-section zp-memory-section" id="memory"><div className="zp-container zp-memory-grid"><div className="zp-memory-copy"><span className="zp-overline">THE CORE OBJECT</span><h2>Organizational Memory is more than a document.</h2><p>It is a governed organizational belief backed by evidence—scoped to where it applies, validated by people, and kept alive by what happens next.</p><ul><li><CheckIcon /><span><b>Evidence, not confidence</b><small>See why the organization believes it.</small></span></li><li><CheckIcon /><span><b>Scope, not vague relevance</b><small>Know where the learning applies.</small></span></li><li><CheckIcon /><span><b>History, not a static answer</b><small>Keep challenges and versions visible.</small></span></li></ul><a className="zp-button zp-button-light" href="#direction">See the product direction <ArrowIcon /></a></div><div className="zp-memory-inspector"><div className="zp-inspector-top"><span>MEMORY INSPECTOR</span><span>Why should I trust this?</span></div><div className="zp-inspector-belief"><span className="zp-overline">CURRENT BELIEF · M-014</span><h3>Location permission must be enabled before mobile attendance can be recorded.</h3><span className="zp-status"><CheckIcon /> Accepted by Support Operations</span></div><div className="zp-inspector-sections"><div><span>Evidence</span><b>4 attached sources</b><small>1 resolved case · 2 outcomes · 1 human review</small></div><div><span>Scope</span><b>Mobile attendance</b><small>Applies to the support team · all regions</small></div><div><span>History</span><b>Version 2 of 2 <ArrowIcon /></b><small>Scope narrowed after a Challenge</small></div></div><div className="zp-inspector-footer"><span>Last reviewed 12 Jun 2026</span><span>Owner · Support operations</span></div></div></div></section>

        <section className="zp-section zp-lifecycle-section"><div className="zp-container"><div className="zp-section-intro is-centered"><span className="zp-overline">SEE THE MEMORY LIFECYCLE</span><h2>Learning gets stronger when its history stays visible.</h2><p>OIP keeps the path from experience to accepted Memory legible—especially when reality changes.</p></div><LifecycleDemo /></div></section>

        <section className="zp-section zp-foundation-section" id="direction"><div className="zp-container"><div className="zp-foundation-heading"><div><span className="zp-overline">A CLEAR STARTING POINT</span><h2>Built on a foundation that can grow with the organization.</h2></div><p>OIP is early, deliberate infrastructure. The public promise is bigger than the current surface area, so the boundary stays visible.</p></div><div className="zp-foundation-grid"><div className="zp-foundation-card is-current"><div className="zp-foundation-label-row"><span className="zp-card-label">CURRENT FOUNDATION</span><span className="zp-foundation-status is-current"><i /> AVAILABLE TODAY</span></div><h3>Remember what mattered.</h3><p>Source → Evidence → Proposed Learning → Human Validation → Organizational Memory → Retrieval → Outcomes</p><div className="zp-foundation-list"><span><CheckIcon /> Persistent Memory objects</span><span><CheckIcon /> Provenance and validation</span><span><CheckIcon /> Retrieval with context</span><span><CheckIcon /> Challenges and version history</span></div></div><div className="zp-foundation-card is-future"><div className="zp-foundation-label-row"><span className="zp-card-label">PRODUCT DIRECTION</span><span className="zp-foundation-status">NOT YET SHIPPED</span></div><h3>See what the organization is learning.</h3><p>As the foundation earns trust: broader sources, pattern discovery, contradiction detection, richer governance, and agent tooling.</p><div className="zp-direction-tags"><span>Pattern discovery</span><span>Knowledge gaps</span><span>Agent access</span><span>Governed action</span></div></div></div></div></section>

        <section className="zp-section zp-shared-section"><div className="zp-container zp-shared-grid"><div><span className="zp-overline">THE LONG-TERM ROLE</span><h2>One organizational Memory layer for people, systems, and AI.</h2><p>People validate it. Systems contribute what happened. AI retrieves it and proposes what might be learned. The organization keeps the authority.</p><a className="zp-text-link" href="#access">Talk through the model <ArrowIcon /></a></div><SharedMemoryScene /></div></section>

        <section className="zp-section zp-sources-section" id="sources"><div className="zp-container"><div className="zp-section-intro"><div><span className="zp-overline">WHERE LEARNING BEGINS</span><h2>Start with one beachhead. Build the layer around it.</h2></div><p>Customer support is a practical starting point because the work already contains Sources, evidence, outcomes, and repeated opportunities to learn. OIP itself is broader organizational infrastructure.</p></div><div className="zp-source-grid"><div className="zp-source-feature"><span className="zp-source-icon">S</span><div><span className="zp-card-label">CURRENT BEACHHEAD</span><h3>Support resolutions</h3><p>A resolved case becomes more than a closed ticket when the organization can preserve what worked and retrieve it next time.</p></div><ArrowIcon /></div><div className="zp-source-future"><span className="zp-card-label">FUTURE SOURCES · DIRECTION</span><div className="zp-source-pills"><span>Slack / Teams</span><span>Email</span><span>Jira / GitHub</span><span>Docs</span><span>CRM / ERP</span><span>Meetings</span><span>Agent activity</span><span>Operational systems</span></div><small>Potential sources, not a claim that every integration is available today.</small></div></div></div></section>

        <section className="zp-access-section" id="access"><div className="zp-container zp-access-inner"><div><span className="zp-overline">FOR DESIGN PARTNERS</span><h2>Make the next solved problem count.</h2><p>We’re working with a small number of teams to shape the organizational memory layer around real work.</p></div><div className="zp-access-actions"><a className="zp-button zp-button-accent" href={WAITLIST_URL}>Join the Waitlist <ArrowIcon /></a><a className="zp-text-link is-light" href="#top">Back to top ↑</a></div></div></section>

        <section className="zp-section zp-faq-section"><div className="zp-container zp-faq-grid"><div><span className="zp-overline">NEED TO KNOW MORE?</span><h2>Clear answers for a new category.</h2></div><FAQ /></div></section>
      </main>
      <footer className="zp-footer"><div className="zp-container"><div className="zp-footer-top"><div><Logo inverse /><p>Organizational Memory and Intelligence for the work your company is already doing.</p></div><div className="zp-footer-links"><div><span>Product</span><a href="#product">What OIP is</a><a href="#memory">Organizational Memory</a><a href="#how-it-works">How it works</a></div><div><span>Company</span><a href="#direction">Product direction</a><a href="#access">Design partners</a><a href="/?auth=login">Sign in</a></div><div><span>Resources</span><a href="#sources">Sources</a><a href="#memory">Trust and governance</a><a href="#top">Back to top</a></div></div></div><div className="zp-footer-bottom"><span>© 2026 OIP. Organizational Intelligence Platform.</span><span>Built around organizational learning.</span></div></div></footer>
    </div>
  );
}
