import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { SERVICES } from '../config/services';

export default function ServiceSelector() {
  const navigate = useNavigate();
  const { localAudioFile, clearAuthError } = useApp();
  const fileService = SERVICES.find((svc) => svc.id === 'file') ?? SERVICES[0];

  if (!fileService) return null;

  const hasSelectedFile = Boolean(localAudioFile?.name);

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
            <p className="source-detail-text">Local file upload</p>
          </div>
          <div className="source-detail-chip">
            <p className="mono-meta">SUPPORTED</p>
            <p className="source-detail-text">{fileService.note}</p>
          </div>
        </div>

        <div className="source-detail-flow">
          <p className="mono-meta">NEXT STEP</p>
          <p className="source-detail-text">
            Open the file picker, choose an MP3 or WAV track, then Lemon will route directly into generation preferences.
          </p>
          {hasSelectedFile && (
            <p className="source-detail-subtext mono-meta">LAST FILE: {localAudioFile.name}</p>
          )}
        </div>

        <div className="source-detail-actions">
          <button
            type="button"
            className="cy-btn cy-btn-primary"
            onClick={() => {
              clearAuthError();
              navigate('/file');
            }}
          >
            {hasSelectedFile ? 'CHANGE AUDIO FILE' : 'CHOOSE AUDIO FILE'}
          </button>
        </div>
      </div>
    </div>
  );
}
