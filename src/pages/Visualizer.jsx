import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';
import VisualizerCanvas from '../components/VisualizerCanvas';
import Controls from '../components/Controls';
import GenerationPanel from '../components/GenerationPanel';
import { SERVICE_MAP, serviceRequiresAuth } from '../config/services';

export default function Visualizer() {
  const navigate = useNavigate();
  const {
    service,
    disconnect,
    isServiceReady,
    localAudioFile,
    visualizerMode,
    colorTheme,
    sensitivity,
    bloom,
    speed,
  } = useApp();
  const { audioData, isActive, startMicrophoneInput, startDemoMode, startAudioFileInput, stop } = useAudioAnalyzer();
  const [showControls, setShowControls] = useState(false);
  const [showGenerator, setShowGenerator] = useState(service === 'file');
  const [showUI, setShowUI] = useState(true);
  const [error, setError] = useState(null);
  const [retryingFilePlayback, setRetryingFilePlayback] = useState(false);
  const initRunRef = useRef(0);

  useEffect(() => {
    if (service === 'file') {
      setShowGenerator(true);
    }
  }, [service]);

  useEffect(() => {
    if (!service) {
      navigate('/');
      return;
    }

    if (serviceRequiresAuth(service) && !isServiceReady(service)) {
      navigate(`/auth/${service}?error=${encodeURIComponent('Please sign in before starting the visualizer.')}`);
      return;
    }

    if (service === 'file' && !localAudioFile?.url) {
      navigate(`/file?error=${encodeURIComponent('Please choose an audio file before starting the visualizer.')}`);
      return;
    }

    let cancelled = false;
    const runId = ++initRunRef.current;

    const init = async () => {
      if (service === 'file') {
        const ok = await startAudioFileInput(localAudioFile?.url);
        if (cancelled || runId !== initRunRef.current) return;
        if (!ok) {
          setError('Audio file playback failed. Click Start File Playback to retry with a user gesture.');
        } else {
          setError(null);
        }
      } else if (service === 'mic') {
        const ok = await startMicrophoneInput();
        if (cancelled || runId !== initRunRef.current) return;
        if (!ok) {
          setError('Microphone access was denied. Falling back to demo mode.');
          startDemoMode();
        }
      } else {
        // For Spotify/SoundCloud/iTunes we'd hook in the SDK playback here.
        // For now, run the demo oscillator so the visualizer is always alive.
        startDemoMode();
      }
    };

    init();
    return () => {
      cancelled = true;
      stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, isServiceReady, navigate, localAudioFile, startAudioFileInput]);

  // Hide UI after 3s of inactivity
  useEffect(() => {
    let timer;
    const show = () => {
      setShowUI(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShowUI(false), 4000);
    };
    show();
    window.addEventListener('mousemove', show);
    window.addEventListener('touchstart', show);
    return () => {
      window.removeEventListener('mousemove', show);
      window.removeEventListener('touchstart', show);
      clearTimeout(timer);
    };
  }, []);

  const handleBack = useCallback(() => {
    stop();
    disconnect();
    navigate('/');
  }, [stop, disconnect, navigate]);

  const handleRetryFilePlayback = useCallback(async () => {
    if (service !== 'file' || !localAudioFile?.url) return;
    setRetryingFilePlayback(true);
    setError(null);
    stop();
    const ok = await startAudioFileInput(localAudioFile.url);
    if (!ok) {
      setError('Audio file playback failed again. Try another file or use Demo Mode.');
    }
    setRetryingFilePlayback(false);
  }, [localAudioFile, service, startAudioFileInput, stop]);

  const svc = SERVICE_MAP[service] || SERVICE_MAP.file;

  return (
    <div className="w-screen h-screen overflow-hidden relative bg-black">
      {/* 3D Visualizer */}
      <VisualizerCanvas
        audioData={audioData}
        mode={visualizerMode}
        colorTheme={colorTheme}
        sensitivity={sensitivity}
        bloom={bloom}
        speed={speed}
      />

      {/* Overlay UI */}
      <div
        className="ui-overlay absolute inset-0 pointer-events-none transition-opacity duration-700"
        style={{ opacity: showUI ? 1 : 0 }}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between pointer-events-auto">
          <button
            onClick={handleBack}
            className="glass rounded-xl px-4 py-2 text-white/70 hover:text-white text-sm flex items-center gap-2 transition-all hover:bg-white/10"
          >
            ← Back
          </button>

          <div className="glass rounded-xl px-4 py-2 flex items-center gap-2">
            <span style={{ color: svc.color, filter: `drop-shadow(0 0 6px ${svc.color})` }}>
              {svc.icon}
            </span>
            <span className="text-white/80 text-sm font-medium">{svc.name}</span>
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: isActive ? '#22c55e' : '#ef4444' }}
            />
          </div>

          <div className="flex items-center gap-2">
            {service === 'file' && (
              <button
                onClick={() => setShowGenerator((v) => !v)}
                className="glass rounded-xl px-4 py-2 text-white/70 hover:text-white text-sm flex items-center gap-2 transition-all hover:bg-white/10"
              >
                <span>⏺</span> Generation
              </button>
            )}
            <button
              onClick={() => setShowControls(v => !v)}
              className="glass rounded-xl px-4 py-2 text-white/70 hover:text-white text-sm flex items-center gap-2 transition-all hover:bg-white/10"
            >
              <span>⚙</span> Controls
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="glass rounded-xl px-4 py-2 text-yellow-400 text-xs flex items-center gap-2 max-w-[90vw]">
              <span>⚠</span>
              <span>{error}</span>
              {service === 'file' && localAudioFile?.url && (
                <button
                  onClick={handleRetryFilePlayback}
                  className="ml-1 px-2 py-1 rounded-lg text-[10px] tracking-widest border border-white/15 text-white/80 hover:text-white hover:border-white/30"
                  disabled={retryingFilePlayback}
                >
                  {retryingFilePlayback ? 'STARTING...' : 'START FILE PLAYBACK'}
                </button>
              )}
              <button onClick={() => setError(null)} className="text-white/40 hover:text-white ml-1">✕</button>
            </div>
          </div>
        )}

        {/* Audio meters */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-3">
          {[
            { label: 'Bass', value: audioData.bass, color: '#a855f7' },
            { label: 'Mid', value: audioData.mid, color: '#ec4899' },
            { label: 'Treble', value: audioData.treble, color: '#f97316' },
          ].map(m => (
            <div key={m.label} className="flex flex-col items-center gap-1">
              <div className="w-1.5 rounded-full transition-all duration-75" style={{
                height: `${Math.max(4, m.value * 60)}px`,
                background: m.color,
                boxShadow: `0 0 8px ${m.color}`,
              }} />
              <span className="text-white/30 text-[9px] tracking-widest uppercase">{m.label}</span>
            </div>
          ))}
        </div>

        {/* Bottom hint */}
        <div className="absolute bottom-6 right-6 text-white/20 text-xs pointer-events-none">
          Move mouse to show controls
        </div>
      </div>

      {/* Controls panel */}
      {showControls && (
        <div className="ui-overlay absolute top-16 right-4 pointer-events-auto">
          <Controls onClose={() => setShowControls(false)} />
        </div>
      )}

      {showGenerator && (
        <div className="ui-overlay absolute top-16 left-4 pointer-events-auto z-20">
          <GenerationPanel localAudioFile={localAudioFile} />
        </div>
      )}
    </div>
  );
}
