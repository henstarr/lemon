import { useEffect, useRef, useState } from 'react';
import { useAIVideoGenerationJob } from '../hooks/useAIVideoGenerationJob';

export default function GenerationPanel({ localAudioFile }) {
  const workflowInputRef = useRef(null);
  const [workflowUiError, setWorkflowUiError] = useState('');
  const [healthState, setHealthState] = useState({
    status: 'idle',
    message: 'Not checked yet',
    backend: null,
  });
  const {
    phase,
    progress,
    error,
    aspect,
    setAspect,
    workflowJsonText,
    setWorkflowJsonText,
    videoResult,
    manifestUrl,
    jobPlanUrl,
    remoteConfigured,
    remoteBaseUrl,
    hasWorkflowOverride,
    start,
    cancel,
  } = useAIVideoGenerationJob({
    localAudioFile,
    analysisPackage: null,
    ensureAnalysis: undefined,
  });

  const isBusy = ['preparing', 'submitting'].includes(phase) || /rendering|waiting/i.test(progress?.phase || '');
  const downloadableVideo = videoResult?.url ? (
    <a className="cy-btn cy-btn-primary w-full" href={videoResult.url} download={videoResult.fileName}>
      DOWNLOAD OUTPUT
    </a>
  ) : null;

  const handleWorkflowFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      setWorkflowJsonText(text);
      setWorkflowUiError('');
    } catch {
      setWorkflowUiError('Invalid workflow JSON file.');
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!remoteConfigured || !remoteBaseUrl) {
      setHealthState({
        status: 'missing_env',
        message: 'Frontend env missing: set VITE_AI_VIDEO_API_URL and restart Vite.',
        backend: null,
      });
      return () => {
        cancelled = true;
      };
    }

    setHealthState({ status: 'checking', message: 'Checking Lemon AI backend health...' });
    fetch(`${remoteBaseUrl}/api/ai-video/health`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = await res.json();
        if (cancelled) return;
        setHealthState({
          status: 'ok',
          message: `Reachable • mode=${body?.resolvedMode || body?.mode || 'unknown'}`,
          backend: body || null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setHealthState({
          status: 'error',
          message: `Unreachable • ${err?.message || 'request failed'}`,
          backend: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [remoteConfigured, remoteBaseUrl]);

  return (
    <div className="generation-panel glass-strong rounded-2xl p-4 w-full max-w-full space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="mono-meta">WAN 2.1 GENERATION</p>
          <h2 className="panel-title mt-1">AI Video Render</h2>
        </div>
        <span className="mono-meta cyan">REMOTE ONLY</span>
      </div>

      <div className="source-detail-grid">
        <div className="source-detail-chip">
          <p className="mono-meta">INPUT FILE</p>
          <p className="source-detail-text">{localAudioFile?.name || 'No file selected'}</p>
        </div>
        <div className="source-detail-chip">
          <p className="mono-meta">BACKEND</p>
          <p className="source-detail-text">{remoteConfigured ? 'Connected' : 'Not configured'}</p>
        </div>
      </div>

      <div className="source-detail-grid">
        <div className="source-detail-chip">
          <p className="mono-meta">FRONTEND ENV</p>
          <p className="source-detail-text">
            {remoteConfigured ? 'VITE_AI_VIDEO_API_URL detected' : 'Missing VITE_AI_VIDEO_API_URL'}
          </p>
        </div>
        <div className="source-detail-chip">
          <p className="mono-meta">BACKEND HEALTH</p>
          <p
            className={`source-detail-text ${
              healthState.status === 'ok'
                ? 'text-cyan-300'
                : healthState.status === 'error' || healthState.status === 'missing_env'
                  ? 'text-red-300'
                  : ''
            }`}
          >
            {healthState.message}
          </p>
        </div>
      </div>

      {healthState.backend && (
        <div className="source-detail-grid">
          <div className="source-detail-chip">
            <p className="mono-meta">COMFYUI TARGET</p>
            <p className="source-detail-text break-all">
              {healthState.backend.comfyuiPromptUrl || healthState.backend.comfyuiBaseUrl || 'Not configured'}
            </p>
          </div>
          <div className="source-detail-chip">
            <p className="mono-meta">COMFYUI PROBE</p>
            <p className={`source-detail-text ${healthState.backend.comfyuiProbe?.ok ? 'text-cyan-300' : 'text-red-300'}`}>
              {healthState.backend.comfyuiProbe
                ? (healthState.backend.comfyuiProbe.ok
                  ? `Reachable • HTTP ${healthState.backend.comfyuiProbe.status}`
                  : `Unreachable • ${healthState.backend.comfyuiProbe.error || 'fetch failed'}`)
                : 'Not checked'}
            </p>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-3 space-y-3">
        <div>
          <p className="mono-meta mb-1">ComfyUI API</p>
          <p className="generation-muted-text generation-small-text break-all">
            {remoteConfigured ? remoteBaseUrl : 'Set VITE_AI_VIDEO_API_URL to your Lemon AI backend'}
          </p>
        </div>

        <div>
          <p className="mono-meta mb-1">Aspect Ratio</p>
          <select
            className="w-full generation-input rounded-lg px-2 py-2 text-xs"
            value={aspect}
            onChange={(e) => setAspect(e.target.value)}
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="mono-meta">ComfyUI Workflow JSON</p>
            <span className={`text-[10px] generation-status-pill ${hasWorkflowOverride ? 'is-ready' : 'is-required'}`}>
              {hasWorkflowOverride ? 'DEFAULT READY' : 'REQUIRED'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button type="button" className="cy-btn" onClick={() => workflowInputRef.current?.click()}>
              UPLOAD JSON
            </button>
            <button
              type="button"
              className="cy-btn"
              onClick={() => {
                setWorkflowJsonText('');
                setWorkflowUiError('');
              }}
              disabled={!hasWorkflowOverride}
            >
              CLEAR JSON
            </button>
          </div>
          <input
            ref={workflowInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleWorkflowFile}
          />
          <textarea
            className="w-full min-h-28 generation-input generation-textarea rounded-lg px-2 py-2 text-[11px] font-mono resize-y"
            placeholder="Paste or upload your ComfyUI Wan2.1 workflow JSON"
            value={workflowJsonText}
            onChange={(e) => {
              setWorkflowJsonText(e.target.value);
              setWorkflowUiError('');
            }}
          />
          {workflowUiError && <p className="ui-error-text text-[10px] mt-1">{workflowUiError}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="cy-btn cy-btn-primary"
            type="button"
            disabled={!localAudioFile?.url || !remoteConfigured || !workflowJsonText.trim() || isBusy}
            onClick={() => start()}
          >
            {isBusy ? 'RUNNING...' : 'RUN WAN2.1 JOB'}
          </button>
          <button className="cy-btn" type="button" disabled={!isBusy} onClick={cancel}>
            CANCEL
          </button>
        </div>
      </div>

      {(progress || error) && (
        <div className="glass rounded-xl p-3 space-y-2">
          {progress?.phase && <p className="mono-meta">{String(progress.phase).replaceAll('_', ' ').toUpperCase()}</p>}
          {typeof progress?.percent === 'number' && (
            <>
              <div className="generation-progress-track">
                <div className="generation-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
              </div>
              <p className="generation-muted-text text-xs">{progress.percent}%</p>
            </>
          )}
          {progress?.message && <p className="generation-muted-text text-xs">{progress.message}</p>}
          {error && <p className="ui-error-text text-xs">{error}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {jobPlanUrl && <a className="cy-btn" href={jobPlanUrl} download="lemon-ai-job-plan.json">DOWNLOAD JOB PLAN</a>}
        {manifestUrl && <a className="cy-btn" href={manifestUrl} download="lemon-ai-manifest.json">DOWNLOAD MANIFEST</a>}
        {downloadableVideo}
      </div>
    </div>
  );
}
