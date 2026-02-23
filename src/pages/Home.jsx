import ServiceSelector from '../components/ServiceSelector';

export default function Home() {
  return (
    <div className="cp-app">
      <main className="cp-shell home-focus-shell">
        <section className="glass-card home-focus-hero" aria-labelledby="home-title">
          <div className="home-focus-glow" aria-hidden="true" />

          <div className="home-focus-copy reveal reveal-visible">
            <div className="home-focus-brand">
              <div className="nav-brand">
                <span className="brand-icon" aria-hidden="true">🍋</span>
                <span className="brand-text">LEMON</span>
              </div>
              <span className="mono-meta home-focus-status">
                <span className="status-dot" aria-hidden="true" />
                FILE FLOW READY
              </span>
            </div>

            <p className="mono-meta hero-kicker">LEMON AUDIO VISUALIZER</p>
            <h1 id="home-title" className="hero-title">LEMON</h1>
            <p className="hero-copy">
              Choose your local audio file directly here and jump straight into generation preferences in a clean control-room workspace.
            </p>

            <div className="home-focus-notes">
              <p className="mono-meta">01 SELECT SOURCE</p>
              <p className="mono-meta">02 CHOOSE FILE</p>
              <p className="mono-meta">03 GENERATE VISUALS</p>
            </div>
          </div>

          <section className="home-login-panel" aria-labelledby="connect-title">
            <div className="section-header-row home-login-panel-header">
              <div>
                <h2 id="connect-title" className="section-title">AUDIO SOURCE</h2>
                <p className="home-login-panel-copy">
                  Choose a local file directly from this panel. Lemon routes immediately into the generation workspace.
                </p>
              </div>
              <span className="mono-meta cyan">LOCAL FILE</span>
            </div>

            <ServiceSelector />
          </section>
        </section>
      </main>
    </div>
  );
}
