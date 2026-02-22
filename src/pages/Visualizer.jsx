import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';
import VisualizerCanvas from '../components/VisualizerCanvas';
import Controls from '../components/Controls';

const SERVICE_LABELS = {
  spotify: { name: 'Spotify', icon: '🎵', color: '#1DB954' },
  soundcloud: { name: 'SoundCloud', icon: '☁', color: '#FF5500' },
  itunes: { name: 'Apple Music', icon: '🎼', color: '#FC3C44' },
  mic: { name: 'Microphone', icon: '🎤', color: '#a855f7' },
  demo: { name: 'Demo Mode', icon: '⚡', color: '#f59e0b' },
};

export default function Visualizer() {
  const navigate = useNavigate();
  const { service, disconnect, visualizerMode, colorTheme, sensitivity, bloom, speed } = useApp();
  const { audioData, isActive, startMicrophoneInput, startDemoMode, stop } = useAudioAnalyzer();
  const [showControls, setShowControls] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!service) {
      navigate('/');
      return;
    }

    const init = async () => {
      if (service === 'mic') {
        const ok = await startMicrophoneInput();
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
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

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

  const svc = SERVICE_LABELS[service] || SERVICE_LABELS.demo;

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

          <button
            onClick={() => setShowControls(v => !v)}
            className="glass rounded-xl px-4 py-2 text-white/70 hover:text-white text-sm flex items-center gap-2 transition-all hover:bg-white/10"
          >
            <span>⚙</span> Controls
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="glass rounded-xl px-4 py-2 text-yellow-400 text-xs flex items-center gap-2">
              ⚠ {error}
              <button onClick={() => setError(null)} className="text-white/40 hover:text-white ml-2">✕</button>
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
    </div>
  );
}
