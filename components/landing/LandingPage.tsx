import {
  AIContextScene,
  HeroVillainScene,
  OIPRevealScene,
  RememberingAttemptScene,
  SupportPressureScene,
  VisionScene
} from "./scenes";
import { KnowledgeFlywheel } from "./flywheel";

function LandingNav() {
  return (
    <header className="lp-nav-wrap">
      <nav className="lp-nav" aria-label="Primary navigation">
        <a className="lp-brand" href="#top" aria-label="OIP home">
          <span className="lp-brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>OIP</span>
        </a>
        <div className="lp-nav-links" aria-label="Page sections">
          <a href="#how-it-works">How it works</a>
          <a href="#memory">Memory</a>
          <a href="#automation">Automation</a>
          <a href="#security">Security</a>
        </div>
        <div className="lp-nav-actions">
          <a className="lp-nav-signin" href="/?auth=login">Sign in</a>
          <a className="lp-button lp-button-small lp-button-light" href="/?auth=signup">Sign up</a>
        </div>
      </nav>
    </header>
  );
}

export function LandingPage() {
  return (
    <div className="oip-landing" id="top">
      <a className="lp-skip-link" href="#main-content">Skip to content</a>
      <LandingNav />
      <main id="main-content">
        <HeroVillainScene />
        <SupportPressureScene />
        <RememberingAttemptScene />
        <AIContextScene />
        <OIPRevealScene />
        <section className="lp-scene lp-flywheel-zone" id="memory" aria-label="The Knowledge Flywheel">
          <div className="lp-container lp-fw-zone-heading">
            <p className="lp-scene-index lp-scene-index-light">06–11 / THE KNOWLEDGE FLYWHEEL</p>
            <h2 id="flywheel-title">One problem becomes <em>organizational memory.</em></h2>
            <p>Six clear moments. Nine governed stages underneath.</p>
          </div>
          <KnowledgeFlywheel />
        </section>
        <VisionScene />
      </main>
    </div>
  );
}
