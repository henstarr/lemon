import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';
import GenerationPanel from '../components/GenerationPanel';
import { SERVICE_MAP, serviceRequiresAuth } from '../config/services';

export default function Visualizer() {
  const navigate = useNavigate();
  const { service, disconnect, isServiceReady, localAudioFile } = useApp();
  const { isActive, startAudioFileInput, stop } = useAudioAnalyzer();
  const [error, setError] = useState(null);
  const [retryingFilePlayback, setRetryingFilePlayback] = useState(false);
  const initRunRef = useRef(0);

  useEffect(() => {
    if (!service) {
      navigate('/');
      return;
    }
    if (serviceRequiresAuth(service) && !isServiceReady(service)) {
      navigate('/');
      return;
    }
    if (service === 'file' && !localAudioFile?.url) {
      navigate(`/?error=${encodeURIComponent('Please choose an audio file before starting generation.')}`);
      return;
    }

    let cancelled = false;
    const runId = ++initRunRef.current;
    const init = async () => {
      if (service !== 'file') return;
      const ok = await startAudioFileInput(localAudioFile?.url);
      if (cancelled || runId !== initRunRef.current) return;
      if (!ok) setError('Audio file playback failed. Retry playback before starting a generation job.');
      else setError(null);
    };
    init();
    return () => {
      cancelled = true;
      stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, isServiceReady, localAudioFile, navigate, startAudioFileInput]);

  const handleBack = useCallback(() => {
    stop();
    disconnect();
    navigate('/');
  }, [disconnect, navigate, stop]);

  const handleRetryPlayback = useCallback(async () => {
    if (!localAudioFile?.url) return;
    setRetryingFilePlayback(true);
    setError(null);
    stop();
    const ok = await startAudioFileInput(localAudioFile.url);
    if (!ok) setError('Audio playback failed again. Choose another file from Home.');
    setRetryingFilePlayback(false);
  }, [localAudioFile, startAudioFileInput, stop]);

  const svc = SERVICE_MAP[service] || SERVICE_MAP.file;

  return (
    <div className="cp-app">
      <main className="cp-shell visualizer-generator-shell">
        <section className="glass-card visualizer-generator-frame" aria-labelledby="wan-generation-title">
          <div className="home-focus-glow visualizer-dashboard-glow" aria-hidden="true" />

          <header className="visualizer-generator-header">
            <div className="visualizer-generator-header-main">
              <div className="nav-brand">
                <span className="brand-icon" aria-hidden="true">🍋</span>
                <span className="brand-text">LEMON</span>
              </div>
              <div>
                <p className="mono-meta hero-kicker">WAN 2.1 GENERATION WORKSPACE</p>
                <h1 id="wan-generation-title" className="hero-title visualizer-generator-title">AI VIDEO GENERATOR</h1>
                <p className="hero-copy visualizer-generator-copy">
                  Minimal generation-only workspace. Upload your audio on the home screen, then configure and run the Wan2.1 job here.
                </p>
              </div>
            </div>

            <div className="visualizer-generator-actions">
              <button type="button" className="cy-btn" onClick={handleBack}>BACK HOME</button>
              <button type="button" className="cy-btn" onClick={() => navigate('/')}>CHANGE FILE</button>
              <button
                type="button"
                className="cy-btn cy-btn-primary"
                onClick={handleRetryPlayback}
                disabled={!localAudioFile?.url || retryingFilePlayback}
              >
                {retryingFilePlayback ? 'STARTING...' : 'START PLAYBACK'}
              </button>
            </div>
          </header>

          <div className="source-detail-grid visualizer-generator-meta-grid">
            <div className="source-detail-chip">
              <p className="mono-meta">SOURCE</p>
              <p className="source-detail-text">{svc.name}</p>
            </div>
            <div className="source-detail-chip">
              <p className="mono-meta">PLAYBACK</p>
              <p className="source-detail-text">{isActive ? 'Active' : 'Idle'}</p>
            </div>
          </div>

          <div className="source-detail-flow visualizer-generator-file-flow glass-card">
            <p className="mono-meta">SELECTED FILE</p>
            <p className="source-detail-text">{localAudioFile?.name || 'No file selected'}</p>
          </div>

          {error && (
            <div className="visualizer-inline-error glass-card" role="alert">
              <div>
                <p className="mono-meta">PLAYBACK ERROR</p>
                <p>{error}</p>
              </div>
              <button type="button" className="cy-btn" onClick={() => setError(null)}>DISMISS</button>
            </div>
          )}

          <section className="visualizer-generator-panel-shell">
            <GenerationPanel localAudioFile={localAudioFile} />
          </section>
        </section>
      </main>
    </div>
  );
}

