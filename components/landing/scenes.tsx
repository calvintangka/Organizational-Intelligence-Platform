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

export function HeroVillainScene() {
  return (
    <section className="lp-scene lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-glow" aria-hidden="true" />
      <div className="lp-container lp-hero-copy">
        <SceneIndex>01 / ORGANIZATIONAL FORGETTING</SceneIndex>
        <h1 id="hero-title">Your company keeps solving the same problems.<br /><em>And forgetting the answers.</em></h1>
        <p>A small support team faces a constant stream of questions. Problems get solved, tickets get closed—and the knowledge disappears into history.</p>
        <a className="lp-text-link" href="#how-it-works">See what happens next <span aria-hidden="true">↓</span></a>
      </div>
      <div className="lp-wide lp-support-stage" role="img" aria-label="A support workspace showing high ticket volume and the same mobile attendance problem repeatedly returning after earlier resolutions disappear into an archive">
        <div className="lp-workspace-topbar">
          <div className="lp-workspace-brand"><span className="lp-avatar">NS</span><span><b>Northstar Support</b><small>Customer operations</small></span></div>
          <div className="lp-workspace-search">Search conversations… <kbd>⌘ K</kbd></div>
          <div className="lp-live-status"><span /> 284 waiting</div>
        </div>
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
            <p>The answer exists. Somewhere.</p>
            <div className="lp-buried-stack">
              <div><span>Ticket #3912</span><b>Resolved 47 days ago</b></div>
              <div><span>Slack · #support</span><b>Buried in 183 messages</b></div>
              <div><span>Ticket #2840</span><b>Archived 6 months ago</b></div>
            </div>
            <div className="lp-zero-state"><span>STARTING AGAIN</span><b>0%</b></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AIContextScene() {
  return (
    <section className="lp-scene lp-context-scene" aria-labelledby="context-title">
      <div className="lp-container lp-split-heading">
        <div>
          <SceneIndex light>02 / CONTEXT ≠ MEMORY</SceneIndex>
          <h2 id="context-title">AI has context.<br />Your organization needs memory.</h2>
        </div>
        <p>AI can summarize, reason, draft, and retrieve. But a context window does not remember whether an answer worked—or whether your organization trusts it.</p>
      </div>
      <div className="lp-container lp-context-stage" role="img" aria-label="An AI draft is created from a customer problem and temporary context, but source, validation, outcome, and organizational trust are missing">
        <div className="lp-context-flow">
          <div className="lp-flow-object lp-flow-problem"><small>Customer problem</small><b>Mobile attendance fails</b><span>“Submit does nothing on my phone.”</span></div>
          <Arrow />
          <div className="lp-ai-window"><div><span className="lp-ai-spark">✦</span><small>AI context</small></div><p>Recent ticket · Help article · Account details</p><div className="lp-context-bar"><i /><i /><i /></div></div>
          <Arrow />
          <div className="lp-flow-object lp-flow-answer"><small>Generated answer</small><b>Enable location access</b><span>Draft ready to review</span></div>
        </div>
        <div className="lp-missing-grid">
          <div><span>01</span><b>SOURCE?</b><small>Where did this answer come from?</small></div>
          <div><span>02</span><b>VALIDATED?</b><small>Did the organization approve it?</small></div>
          <div><span>03</span><b>OUTCOME?</b><small>Did it actually solve the problem?</small></div>
          <div><span>04</span><b>TRUST?</b><small>How much should we rely on it?</small></div>
        </div>
        <p className="lp-context-conclusion"><span>Temporary context</span><i /> <strong>Durable learning requires a memory of what happened.</strong></p>
      </div>
    </section>
  );
}

function LearningPath() {
  const steps = ["Customer problem", "Investigation", "Resolution", "Evidence", "Validated lesson", "Organizational Memory"];
  return <div className="lp-learning-path">{steps.map((step, index) => <span key={step} className={index === steps.length - 1 ? "is-memory" : ""}><b>{String(index + 1).padStart(2, "0")}</b>{step}{index < steps.length - 1 && <Arrow />}</span>)}</div>;
}

export function OIPRevealScene() {
  return (
    <section className="lp-scene lp-reveal-scene" id="how-it-works" aria-labelledby="reveal-title">
      <div className="lp-container lp-reveal-heading">
        <div className="lp-reveal-brand"><span className="lp-brand-mark lp-brand-mark-indigo" aria-hidden="true"><i /><i /><i /></span><span><b>OIP</b><small>Organizational Intelligence Platform</small></span></div>
        <SceneIndex light>03 / MEET OIP</SceneIndex>
        <h2 id="reveal-title">Every solved problem becomes <em>organizational memory.</em></h2>
        <p>OIP captures what happened, what worked, the evidence behind it, and the lesson your organization chose to keep.</p>
      </div>
      <div className="lp-wide lp-product-stage" role="img" aria-label="OIP turns a resolved ticket, evidence, reflection, and validation into a versioned Organizational Memory item with provenance and trust">
        <div className="lp-product-chrome"><div><span /><span /><span /></div><b>OIP · Support workspace</b><span>Northstar</span></div>
        <LearningPath />
        <div className="lp-product-grid">
          <div className="lp-case-pane">
            <div className="lp-pane-label"><span>Temporary work</span><b>CASE #3912</b></div>
            <div className="lp-case-title"><span className="lp-avatar lp-avatar-indigo">MH</span><div><b>Mobile attendance won’t submit</b><small>Marina H. · Acme Field Ops</small></div></div>
            <div className="lp-thread"><p><span>Customer</span>I tap submit, but nothing happens on my phone.</p><p className="agent"><span>Support</span>Please enable location permission for the OIP mobile app, then reopen attendance.</p><p><span>Customer</span>That fixed it—attendance submitted successfully.</p></div>
            <div className="lp-evidence-strip"><span>✓</span><div><b>Outcome evidence attached</b><small>Customer confirmed resolution · message 8</small></div></div>
          </div>
          <div className="lp-reflection-rail"><div className="lp-active-line" /><div><span>01</span><b>Resolved</b></div><div><span>02</span><b>Evidence</b></div><div><span>03</span><b>Reflection</b></div><div className="active"><span>04</span><b>Validated</b></div></div>
          <div className="lp-memory-pane">
            <div className="lp-memory-top"><span className="lp-memory-glyph" aria-hidden="true"><i /><i /><i /></span><div><small>ORGANIZATIONAL MEMORY</small><b>Mobile Attendance — Location Permission Disabled</b></div><span className="lp-version">v4</span></div>
            <p className="lp-memory-summary">When mobile attendance submission is unresponsive, verify operating-system location permission before troubleshooting connectivity.</p>
            <div className="lp-memory-columns"><div><small>Validated resolution</small><p>Enable location access, reopen the app, and retry attendance submission.</p></div><div><small>Supporting evidence</small><p><span className="lp-trusted-dot" /> 3 confirmed outcomes<br /><span className="lp-trusted-dot" /> 2 human reviews</p></div></div>
            <div className="lp-memory-meta"><div><small>PROVENANCE</small><b>3 cases · 4 evidence items</b></div><div><small>LAST REVIEWED</small><b>12 Jun · Maya Chen</b></div><div><small>TRUST</small><b className="lp-trust-number">72</b></div></div>
          </div>
        </div>
      </div>
      <p className="lp-editorial-line">Work passes. <em>Knowledge remains.</em></p>
    </section>
  );
}

export function RecurrenceScene() {
  return (
    <section className="lp-scene lp-recurrence-scene" aria-labelledby="recurrence-title">
      <div className="lp-container lp-split-heading lp-split-heading-dark">
        <div><SceneIndex>04 / REUSE</SceneIndex><h2 id="recurrence-title">The same problem comes back.<br /><em>This time, you don’t start from zero.</em></h2></div>
        <p>OIP recognizes the canonical problem, retrieves validated knowledge, and prepares a grounded response for human review.</p>
      </div>
      <div className="lp-container lp-recurrence-flow" role="img" aria-label="A returning customer issue is matched to validated Organizational Memory, used in a reviewed response, and a confirmed outcome raises organizational trust from 72 to 78">
        <div className="lp-incoming-case"><div className="lp-case-stamp"><span>NEW CASE</span><b>#4821</b></div><small>Today · 09:42</small><h3>“I can’t submit attendance from my phone.”</h3><div className="lp-match-scan"><i /><span>Canonical problem detected</span></div></div>
        <div className="lp-connection-column"><span>MATCH FOUND</span><i /><i /><i /><Arrow /></div>
        <div className="lp-match-memory"><div className="lp-match-heading"><span className="lp-memory-glyph" aria-hidden="true"><i /><i /><i /></span><div><small>VALIDATED ORGANIZATIONAL KNOWLEDGE</small><b>Mobile Attendance — Location Permission Disabled</b></div></div><ul><li><span>✓</span> Evidence verified</li><li><span>✓</span> Previous outcome confirmed</li><li><span>✓</span> Reviewed by support lead</li></ul><div className="lp-trust-base"><span>ORGANIZATIONAL TRUST</span><b>72</b></div></div>
        <div className="lp-grounded-response"><div className="lp-response-top"><span>Grounded response</span><b>Human review</b></div><p>It looks like location permission is disabled. Please enable location access for the mobile app, reopen it, then submit attendance again.</p><button type="button" tabIndex={-1}>Reviewed &amp; sent <span>✓</span></button><div className="lp-customer-confirm"><span>Customer · 10:06</span>That worked—thank you!</div></div>
      </div>
      <div className="lp-container lp-trust-change"><div><small>WHY TRUST CHANGED</small><span><b>+1</b> successful reuse</span><span><b>+1</b> confirmed outcome</span><span><b>+1</b> review recorded</span></div><div className="lp-trust-progress"><span>TRUST</span><b>72</b><i><i /></i><b className="new">78</b></div><p>Trust is organizational confidence built through evidence and outcomes—not model confidence.</p></div>
    </section>
  );
}

export function AutomationScene() {
  const maturity = [
    ["REMEMBER", "Human acts", "OIP preserves the lesson"],
    ["ASSIST", "Human reviews", "OIP prepares the response"],
    ["RECOMMEND", "Human approves", "OIP proposes the action"],
    ["AUTOMATE", "Policy permits", "OIP performs the action"]
  ];
  return (
    <section className="lp-scene lp-automation-scene" id="automation" aria-labelledby="automation-title">
      <div className="lp-container lp-automation-heading"><SceneIndex light>05 / GOVERNED AUTONOMY</SceneIndex><h2 id="automation-title">Trust unlocks automation.</h2><p>When your organization already knows what to do, why should someone have to do it manually every time?</p></div>
      <div className="lp-container lp-maturity-line">{maturity.map(([name, gate, detail], index) => <div key={name} className={index === 3 ? "active" : ""}><span>{String(index + 1).padStart(2, "0")}</span><h3>{name}</h3><b>{gate}</b><p>{detail}</p>{index < maturity.length - 1 && <Arrow muted />}</div>)}</div>
      <div className="lp-wide lp-policy-stage" id="security" role="img" aria-label="A known problem passes memory, evidence, trust, and policy checks before an authorized automated response; uncertain or conflicting cases are routed to human review">
        <div className="lp-policy-title"><div><small>OIP DECISION TRACE · CASE #5093</small><b>Known problem received</b></div><span className="lp-audit-badge">AUDIT LOG ON</span></div>
        <div className="lp-policy-flow">
          <div className="lp-policy-node complete"><span>01</span><small>Memory</small><b>Retrieved</b><i>✓</i></div><Arrow />
          <div className="lp-policy-node complete"><span>02</span><small>Evidence</small><b>Verified</b><i>✓</i></div><Arrow />
          <div className="lp-policy-node complete"><span>03</span><small>Trust</small><b>78 ≥ 75</b><i>✓</i></div><Arrow />
          <div className="lp-policy-gate"><span>04</span><small>POLICY GATE</small><b>Customer reply</b><div><i /><strong>ALLOWED</strong></div></div><Arrow />
          <div className="lp-policy-result"><span>AUTHORIZED</span><b>OIP responds</b><small>Action ID · ACT-8821</small></div>
        </div>
        <div className="lp-escalation-branch"><span>Uncertain · conflicting · unknown</span><i /><b>↳ Human review</b><small>Judgment stays with the team</small></div>
      </div>
      <p className="lp-editorial-line lp-editorial-line-dark">Autonomy is earned through <em>organizational trust.</em></p>
    </section>
  );
}

export function IntegrationsScene() {
  const channels = [["G", "Gmail"], ["O", "Outlook"], ["S", "Slack"], ["W", "WhatsApp"], ["T", "Telegram"]];
  return (
    <section className="lp-scene lp-integrations-scene" aria-labelledby="integrations-title">
      <div className="lp-container lp-split-heading"><div><SceneIndex light>06 / INTELLIGENCE LAYER</SceneIndex><h2 id="integrations-title">Keep the tools your team already uses.</h2></div><p>Don’t replace the tools where work already happens. Make them smarter. OIP sits behind your communication channels as the memory and decision layer.</p></div>
      <div className="lp-container lp-integration-stage" role="img" aria-label="Messages from Gmail, Outlook, Slack, WhatsApp, and Telegram flow into OIP, which uses Organizational Memory, trust, and policy to automate, route for review, or investigate; outcomes flow back into memory">
        <div className="lp-channel-rail"><small>MESSAGES FLOW IN</small>{channels.map(([letter, name]) => <div key={name}><span>{letter}</span><b>{name}</b><i>→</i></div>)}</div>
        <div className="lp-integration-core"><div className="lp-core-orbit" aria-hidden="true"><i /><i /><i /></div><span className="lp-brand-mark lp-brand-mark-indigo" aria-hidden="true"><i /><i /><i /></span><b>OIP</b><small>ORGANIZATIONAL MEMORY</small><div className="lp-core-eval"><span>Understand</span><span>Remember</span><span>Evaluate</span></div></div>
        <div className="lp-outcome-rail"><small>DECISIONS FLOW OUT</small><div className="auto"><span>78</span><b>Automatic response</b><i>Policy permitted</i></div><div className="review"><span>?</span><b>Human review</b><i>Needs judgment</i></div><div className="unknown"><span>…</span><b>Investigation</b><i>Unknown problem</i></div><p><span>↩</span> Outcomes return to memory</p></div>
      </div>
    </section>
  );
}

export function LearningLoopScene() {
  const loop = ["UNDERSTAND", "REMEMBER", "EVALUATE", "ACT", "OBSERVE", "LEARN"];
  return (
    <section className="lp-scene lp-loop-scene" aria-labelledby="loop-title">
      <div className="lp-container lp-loop-heading"><SceneIndex light>07 / THE LEARNING LOOP</SceneIndex><h2 id="loop-title">Every interaction can make the next one better.</h2></div>
      <div className="lp-wide lp-loop-stage" role="img" aria-label="OIP's learning loop moves through understand, remember, evaluate, act, observe, and learn around Organizational Memory, increasing knowledge, trust, safe automation, and support capacity">
        <div className="lp-loop-visual">
          <div className="lp-loop-core"><span className="lp-memory-glyph" aria-hidden="true"><i /><i /><i /></span><small>ORGANIZATIONAL</small><b>MEMORY</b><em>Validated · versioned · traceable</em></div>
          {loop.map((item, index) => <div key={item} className={`lp-loop-step step-${index + 1}`}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b></div>)}
          <div className="lp-loop-track" aria-hidden="true" />
        </div>
        <div className="lp-capacity-copy"><small>THE CAPACITY EFFECT</small><div className="lp-capacity-sequence"><span>More problems solved</span><Arrow /><span>More knowledge</span><Arrow /><span>More trust</span><Arrow /><span>More safe automation</span></div><h3>Human attention moves to the work that needs judgment.</h3><p>New problems. Exceptions. Relationships. Difficult cases. Situations the organization has not learned yet.</p></div>
      </div>
      <div className="lp-container lp-difference-line"><span>Help desks manage conversations.</span><span>Knowledge bases store documentation.</span><span>Search finds information.</span><strong>OIP learns from what actually happened.</strong></div>
    </section>
  );
}

export function VisionScene() {
  return (
    <section className="lp-scene lp-vision-scene" id="vision" aria-labelledby="vision-title">
      <div className="lp-container lp-vision-progression" aria-label="Memory to Intelligence to Autonomy">
        <div><span>01</span><b>MEMORY</b><small>Preserve what worked</small></div><Arrow /><div><span>02</span><b>INTELLIGENCE</b><small>Learn what to trust</small></div><Arrow /><div><span>03</span><b>AUTONOMY</b><small>Act when policy permits</small></div>
      </div>
      <div className="lp-container lp-final-cta">
        <SceneIndex light>08 / THE OIP VISION</SceneIndex>
        <p className="lp-vision-kicker">Memory <span>→</span> Intelligence <span>→</span> Autonomy</p>
        <h2 id="vision-title">Stop starting from zero.</h2>
        <p>Turn today’s solved problems into trusted organizational memory for tomorrow’s work.</p>
        <div className="lp-cta-actions"><a className="lp-button lp-button-primary" href="/?auth=signup">Sign Up Now <span aria-hidden="true">↗</span></a><a className="lp-signin-link" href="/?auth=login">Already have an account? <b>Sign in</b></a></div>
        <p className="lp-beachhead">Customer support is where OIP starts.</p>
      </div>
      <footer className="lp-footer"><div className="lp-container"><a className="lp-brand lp-brand-dark" href="#top"><span className="lp-brand-mark lp-brand-mark-indigo" aria-hidden="true"><i /><i /><i /></span><span>OIP</span></a><p>Every resolved issue should make the whole organization smarter.</p><span>Organizational Intelligence Platform</span></div></footer>
    </section>
  );
}
