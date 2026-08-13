import {
  AIContextScene,
  AutomationScene,
  HeroVillainScene,
  IntegrationsScene,
  LearningLoopScene,
  OIPRevealScene,
  RecurrenceScene,
  VisionScene
} from "./scenes";

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
          <a href="#automation">Automation</a>
          <a href="#security">Security</a>
          <a href="#vision">Vision</a>
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
        <AIContextScene />
        <OIPRevealScene />
        <RecurrenceScene />
        <AutomationScene />
        <IntegrationsScene />
        <LearningLoopScene />
        <VisionScene />
      </main>
    </div>
  );
}
