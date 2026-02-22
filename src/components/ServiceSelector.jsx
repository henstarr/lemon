import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/useApp';

const SERVICES = [
  {
    id: 'spotify',
    name: 'Spotify',
    icon: '🎵',
    color: '#1DB954',
    gradient: 'from-green-900/40 to-green-600/20',
    border: 'border-green-500/30 hover:border-green-400/60',
    description: 'Connect your Spotify account',
    note: 'Premium required for playback',
    authUrl: `https://accounts.spotify.com/authorize?client_id=YOUR_SPOTIFY_CLIENT_ID&response_type=token&redirect_uri=${encodeURIComponent(window.location.origin + '/callback/spotify')}&scope=streaming+user-read-email+user-read-private`,
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: '☁',
    color: '#FF5500',
    gradient: 'from-orange-900/40 to-orange-600/20',
    border: 'border-orange-500/30 hover:border-orange-400/60',
    description: 'Stream from SoundCloud',
    note: 'Requires SoundCloud account',
    authUrl: `https://soundcloud.com/connect?client_id=YOUR_SOUNDCLOUD_CLIENT_ID&redirect_uri=${encodeURIComponent(window.location.origin + '/callback/soundcloud')}&response_type=token`,
  },
  {
    id: 'itunes',
    name: 'Apple Music',
    icon: '🎼',
    color: '#FC3C44',
    gradient: 'from-red-900/40 to-pink-600/20',
    border: 'border-red-500/30 hover:border-red-400/60',
    description: 'Connect Apple Music',
    note: 'Subscription required',
    authUrl: null,
  },
  {
    id: 'mic',
    name: 'Microphone',
    icon: '🎤',
    color: '#a855f7',
    gradient: 'from-purple-900/40 to-purple-600/20',
    border: 'border-purple-500/30 hover:border-purple-400/60',
    description: 'Use your microphone',
    note: 'Real-time audio input',
    authUrl: null,
  },
  {
    id: 'demo',
    name: 'Demo Mode',
    icon: '⚡',
    color: '#f59e0b',
    gradient: 'from-yellow-900/40 to-amber-600/20',
    border: 'border-yellow-500/30 hover:border-yellow-400/60',
    description: 'Try the visualizer',
    note: 'No account needed',
    authUrl: null,
  },
];

export default function ServiceSelector() {
  const { connect } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);

  const handleConnect = async (svc) => {
    setLoading(svc.id);

    if (svc.id === 'spotify' || svc.id === 'soundcloud') {
      // For OAuth-based services, open auth window
      // In a real app you'd set up OAuth properly with a backend
      connect(svc.id);
      setTimeout(() => {
        setLoading(null);
        navigate('/visualizer');
      }, 600);
      return;
    }

    if (svc.id === 'itunes') {
      // Apple MusicKit JS initialization would go here
      connect(svc.id);
      setTimeout(() => {
        setLoading(null);
        navigate('/visualizer');
      }, 600);
      return;
    }

    connect(svc.id);
    setTimeout(() => {
      setLoading(null);
      navigate('/visualizer');
    }, 400);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl mx-auto">
      {SERVICES.map(svc => (
        <button
          key={svc.id}
          onClick={() => handleConnect(svc)}
          disabled={loading !== null}
          className={`
            relative rounded-2xl p-5 text-left transition-all duration-300
            bg-gradient-to-br ${svc.gradient}
            border ${svc.border}
            group overflow-hidden
            disabled:opacity-50 disabled:cursor-not-allowed
            hover:scale-[1.03] hover:shadow-2xl active:scale-[0.98]
          `}
          style={{ '--svc-color': svc.color }}
        >
          {/* Glow effect on hover */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
            style={{ background: `radial-gradient(circle at 50% 50%, ${svc.color}20, transparent 70%)` }}
          />

          {loading === svc.id && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          <div className="relative">
            <div className="text-3xl mb-3" style={{ filter: `drop-shadow(0 0 8px ${svc.color})` }}>
              {svc.icon}
            </div>
            <div className="font-semibold text-white text-base mb-1">{svc.name}</div>
            <div className="text-white/60 text-xs mb-2">{svc.description}</div>
            <div
              className="text-[10px] px-2 py-0.5 rounded-full inline-block"
              style={{ background: `${svc.color}25`, color: svc.color, border: `1px solid ${svc.color}40` }}
            >
              {svc.note}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
