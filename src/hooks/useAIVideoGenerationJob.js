import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildAIVideoJobPlan } from '../lib/aiVideo/promptPlanner';
import { createAIVideoClient } from '../lib/aiVideo/client';
import { analyzeAudioFile } from '../lib/predictiveVideoPipeline';
import defaultComfyWorkflow from '../lib/aiVideo/defaultComfyWorkflow.json';

const DEFAULT_COMFY_WORKFLOW_JSON = JSON.stringify(defaultComfyWorkflow, null, 2);

function jsonBlobUrl(data) {
  return URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

async function localAudioToFile(localAudioFile) {
  if (localAudioFile?.file instanceof File) return localAudioFile.file;
  if (!localAudioFile?.url) throw new Error('No local audio file available.');
  const res = await fetch(localAudioFile.url);
  if (!res.ok) throw new Error('Failed to load local audio file blob.');
  const blob = await res.blob();
  return new File([blob], localAudioFile.name || 'audio-file', { type: localAudioFile.type || blob.type || 'audio/*' });
}

export function useAIVideoGenerationJob({ localAudioFile, analysisPackage, ensureAnalysis }) {
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [providerMode, setProviderMode] = useState('remote');
  const [presetId, setPresetId] = useState('pulse-tunnel');
  const [aspect, setAspect] = useState('16:9');
  const [workflowJsonText, setWorkflowJsonText] = useState(() => {
    try {
      return window.localStorage.getItem('lemon-comfyui-workflow-json') || DEFAULT_COMFY_WORKFLOW_JSON;
    } catch {
      return DEFAULT_COMFY_WORKFLOW_JSON;
    }
  });
  const [jobPlan, setJobPlan] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [videoResult, setVideoResult] = useState(null);
  const [remoteJobId, setRemoteJobId] = useState(null);
  const abortRef = useRef(null);
  const clientRef = useRef(createAIVideoClient());

  const cleanupArtifacts = useCallback(() => {
    setVideoResult((prev) => {
      if (prev?.url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(prev.url); } catch { /* noop */ }
      }
      return null;
    });
  }, []);

  const cancel = useCallback(async () => {
    abortRef.current?.abort?.();
    const client = clientRef.current;
    if (remoteJobId && client.configured) {
      try { await client.cancelJob(remoteJobId); } catch { /* noop */ }
    }
  }, [remoteJobId]);

  useEffect(() => () => {
    abortRef.current?.abort?.();
  }, []);

  useEffect(() => {
    try {
      if (workflowJsonText) window.localStorage.setItem('lemon-comfyui-workflow-json', workflowJsonText);
      else window.localStorage.removeItem('lemon-comfyui-workflow-json');
    } catch {
      // noop
    }
  }, [workflowJsonText]);

  const start = useCallback(async () => {
    setError(null);
    cleanupArtifacts();
    setManifest(null);
    setRemoteJobId(null);
    setPhase('preparing');
    setProgress({ phase: 'preparing', message: 'Ensuring track analysis is available' });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const analysis = analysisPackage
        || (await ensureAnalysis?.())
        || (await analyzeAudioFile(await localAudioToFile(localAudioFile), { analysisFps: 30, renderFps: 30 }));
      if (!analysis) throw new Error('Analysis is required before AI generation.');
      if (!localAudioFile?.url) throw new Error('Choose a local audio file first.');

      const plan = buildAIVideoJobPlan({ analysisPackage: analysis, stylePresetId: presetId, aspect });
      setJobPlan(plan);
      setProgress({
        phase: 'planning',
        message: `Planned ${plan.shotPlan.length} AI shots for ${Math.round(plan.duration)}s track`,
      });

      const client = clientRef.current;
      if (!client.configured) {
        throw new Error('Remote Wan2.1 backend is not configured. Set VITE_AI_VIDEO_API_URL and retry.');
      }

      if (providerMode === 'remote' && client.configured) {
        try {
          setPhase('submitting');
          const created = await client.submitJob({
            provider: 'wan2.1',
            stylePresetId: presetId,
            aspect,
            jobPlan: plan,
            fileMeta: analysis.fileMeta,
            ...(workflowJsonText.trim() ? { workflowJson: workflowJsonText } : {}),
          });
          const jobId = created?.jobId || created?.id;
          if (!jobId) throw new Error('Remote AI API did not return a job ID.');
          setRemoteJobId(jobId);

          let done = false;
          while (!done) {
            if (controller.signal.aborted) throw new DOMException('Generation aborted', 'AbortError');
            const status = await client.getJob(jobId);
            setProgress({
              phase: status.phase || status.status || 'remote',
              message: status.message || 'Remote Wan2.1 job in progress',
              percent: status.percent,
              step: status.step,
              totalSteps: status.totalSteps,
            });
            if (status.status === 'completed') {
              setManifest(status.manifest || { remote: true, jobId, status });
              if (status.artifactUrl) {
                setVideoResult({
                  url: status.artifactUrl,
                  fileName: status.fileName || 'lemon-ai-video.webm',
                  mimeType: status.mimeType || 'video/webm',
                  remote: true,
                });
              }
              done = true;
              setPhase('done');
              break;
            }
            if (status.status === 'failed') {
              throw new Error(status.error || 'Remote Wan2.1 job failed.');
            }
            await new Promise((r) => setTimeout(r, 1200));
          }
          return;
        } catch (remoteErr) {
          throw remoteErr;
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setPhase('idle');
        setProgress({ phase: 'cancelled', message: 'AI generation cancelled' });
        return;
      }
      setPhase('error');
      setError(err?.message || 'AI generation failed.');
    } finally {
      abortRef.current = null;
    }
  }, [analysisPackage, aspect, cleanupArtifacts, ensureAnalysis, localAudioFile, presetId, providerMode, workflowJsonText]);

  const manifestUrl = useMemo(() => (manifest ? jsonBlobUrl(manifest) : null), [manifest]);
  const jobPlanUrl = useMemo(() => (jobPlan ? jsonBlobUrl(jobPlan) : null), [jobPlan]);

  useEffect(() => {
    return () => {
      if (manifestUrl?.startsWith('blob:')) {
        try { URL.revokeObjectURL(manifestUrl); } catch { /* noop */ }
      }
      if (jobPlanUrl?.startsWith('blob:')) {
        try { URL.revokeObjectURL(jobPlanUrl); } catch { /* noop */ }
      }
    };
  }, [manifestUrl, jobPlanUrl]);

  return {
    phase,
    progress,
    error,
    providerMode,
    setProviderMode,
    presetId,
    setPresetId,
    aspect,
    setAspect,
    workflowJsonText,
    setWorkflowJsonText,
    jobPlan,
    manifest,
    videoResult,
    manifestUrl,
    jobPlanUrl,
    remoteConfigured: clientRef.current.configured,
    remoteBaseUrl: clientRef.current.baseUrl,
    hasWorkflowOverride: Boolean(workflowJsonText.trim()),
    start,
    cancel,
  };
}

export default useAIVideoGenerationJob;
