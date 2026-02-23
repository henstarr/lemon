import { useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { SERVICES } from '../config/services';

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

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ServiceSelector() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const {
    localAudioFile,
    authError,
    clearAuthError,
    failConnect,
    setLocalAudioFile,
    connect,
  } = useApp();
  const fileService = SERVICES.find((svc) => svc.id === 'file') ?? SERVICES[0];
  const queryError = useMemo(
    () => new URLSearchParams(location.search).get('error'),
    [location.search]
  );

  if (!fileService) return null;

  const hasSelectedFile = Boolean(localAudioFile?.name);
  const errorText = queryError || authError;

  const handleChooseFile = () => {
    clearAuthError();
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
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
    <div className="source-tabs-shell" aria-label="Audio input sources">
      <div
        id={`source-panel-${fileService.id}`}
        role="region"
        aria-labelledby={`source-title-${fileService.id}`}
        className="source-detail-panel glass-card"
        style={{ '--source-accent': fileService.color }}
      >
        <div className="source-detail-head">
          <div className="source-card-icon" aria-hidden="true">{fileService.icon}</div>
          <div className="source-detail-copy">
            <div id={`source-title-${fileService.id}`} className="source-card-title">{fileService.name}</div>
            <div className="source-card-description">{fileService.description}</div>
          </div>
          <div className="source-detail-status-wrap">
            <span className={`source-pill ${hasSelectedFile ? 'is-connected' : ''}`}>
              {hasSelectedFile ? 'File Selected' : 'Ready'}
            </span>
          </div>
        </div>

        <div className="source-detail-grid">
          <div className="source-detail-chip">
            <p className="mono-meta">FLOW</p>
            <p className="source-detail-text">Inline local file upload</p>
          </div>
          <div className="source-detail-chip">
            <p className="mono-meta">SUPPORTED</p>
            <p className="source-detail-text">{fileService.note}</p>
          </div>
        </div>

        <div className="source-detail-flow">
          <p className="mono-meta">NEXT STEP</p>
          <p className="source-detail-text">
            Choose an MP3 or WAV track on this home screen card, then Lemon routes directly into generation preferences.
          </p>
          {hasSelectedFile && (
            <p className="source-detail-subtext mono-meta">LAST FILE: {localAudioFile.name}</p>
          )}
        </div>

        <div className="source-inline-picker glass-card">
          <div className="source-inline-picker-head">
            <p className="mono-meta">LOCAL FILE PICKER</p>
            <span className="source-pill is-pending">HOME SCREEN</span>
          </div>

          <div className="source-inline-picker-body">
            <p className="source-detail-text">
              Selection launches the visualizer immediately and keeps the AI/procedural generation panel available for the chosen file.
            </p>

            {hasSelectedFile && (
              <div className="source-file-summary">
                <div className="source-file-summary-row">
                  <span className="mono-meta">SELECTED FILE</span>
                  <span className="mono-meta cyan">{formatFileSize(localAudioFile.size)}</span>
                </div>
                <p className="source-file-name">{localAudioFile.name}</p>
                <p className="source-file-meta mono-meta">
                  {String(localAudioFile.type || 'audio/file').replace('audio/', '').toUpperCase()}
                </p>
              </div>
            )}

            {errorText && (
              <div className="source-inline-error" role="alert">
                <p className="mono-meta">FILE ERROR</p>
                <p>{errorText}</p>
              </div>
            )}
          </div>

          <div className="source-detail-actions source-inline-actions">
            <button
              type="button"
              className="cy-btn"
              disabled={!hasSelectedFile}
              onClick={() => {
                if (!hasSelectedFile) return;
                clearAuthError();
                connect('file');
                navigate('/visualizer');
              }}
            >
              OPEN VISUALIZER
            </button>
            <button
              type="button"
              className="cy-btn cy-btn-primary"
              onClick={handleChooseFile}
            >
              {hasSelectedFile ? 'CHANGE AUDIO FILE' : 'CHOOSE AUDIO FILE'}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
}
