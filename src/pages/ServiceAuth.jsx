import { useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { SERVICE_MAP, isLocalFileService } from '../config/services';

function isSupportedLocalAudioFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return name.endsWith('.mp3')
    || name.endsWith('.wav')
    || type === 'audio/mpeg'
    || type === 'audio/mp3'
    || type === 'audio/wav'
    || type === 'audio/x-wav'
    || type === 'audio/wave';
}

export default function ServiceAuth() {
  const { service: routeService } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const {
    connect,
    failConnect,
    clearAuthError,
    authError,
    setLocalAudioFile,
    localAudioFile,
  } = useApp();

  const requestedServiceId = routeService || 'file';
  const svc = SERVICE_MAP.file;
  const queryError = useMemo(
    () => new URLSearchParams(location.search).get('error'),
    [location.search]
  );
  const errorText = queryError || authError;

  if (routeService && !isLocalFileService(routeService)) {
    return (
      <div className="service-auth-page min-h-screen cp-app flex items-center justify-center px-4 sm:px-6 py-10 sm:py-14">
        <div className="service-auth-shell glass-card cy-card rounded-2xl p-5 sm:p-6 w-full max-w-lg">
          <h1 className="section-title mb-3">UNSUPPORTED SOURCE</h1>
          <p className="hero-copy text-left service-auth-copy">
            <span className="font-mono text-white/90">{requestedServiceId}</span> is not available in this file-only build.
          </p>
          <div className="mt-4">
            <Link to="/" className="cy-btn cy-btn-primary">BACK HOME</Link>
          </div>
        </div>
      </div>
    );
  }

  const handleFileSelect = (event) => {
    clearAuthError();
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isSupportedLocalAudioFile(file)) {
      failConnect('file', 'Only MP3 and WAV files are supported.');
      event.target.value = '';
      return;
    }

    const url = URL.createObjectURL(file);
    setLocalAudioFile({
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      url,
    });
    connect('file');
    navigate('/visualizer');
  };

  return (
    <div className="file-source-page min-h-screen cp-app flex items-center justify-center px-4 sm:px-6 py-10 sm:py-14">
      <div className="file-source-shell glass-card w-full max-w-2xl rounded-3xl p-5 sm:p-7">
        <div className="file-source-header">
          <div className="nav-brand">
            <span className="brand-icon" aria-hidden="true">🍋</span>
            <span className="brand-text">LEMON</span>
          </div>
          <span className="mono-meta cyan">LOCAL FILE</span>
        </div>

        <div className="file-source-center" aria-labelledby="file-source-title">
          <div className="source-card-icon file-source-icon" style={{ '--source-accent': svc.color }} aria-hidden="true">
            {svc.icon}
          </div>
          <p className="mono-meta">STEP 2 / CHOOSE FILE</p>
          <h1 id="file-source-title" className="section-title file-source-title">Choose an audio file</h1>
          <p className="hero-copy file-source-copy">
            Select an MP3 or WAV track. Lemon will immediately open generation preferences with the visualizer running.
          </p>

          <button
            type="button"
            className="cy-btn cy-btn-primary file-source-picker-btn"
            onClick={() => {
              clearAuthError();
              fileInputRef.current?.click();
            }}
          >
            {localAudioFile?.name ? 'CHOOSE DIFFERENT FILE' : 'CHOOSE FILE'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          {localAudioFile?.name && (
            <p className="file-source-meta mono-meta">LAST SELECTED: {localAudioFile.name}</p>
          )}

          {errorText && (
            <div className="file-source-error glass-card" role="alert">
              <p className="mono-meta text-red-300">FILE ERROR</p>
              <p className="file-source-error-copy">{errorText}</p>
            </div>
          )}

          <Link to="/" className="cy-btn file-source-back-btn">BACK</Link>
        </div>
      </div>
    </div>
  );
}
