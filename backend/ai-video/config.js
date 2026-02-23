import os from 'node:os';
import path from 'node:path';

function parseIntEnv(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(value) {
  if (!value) return null;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const port = parseIntEnv(env.AI_VIDEO_PORT, 8787);
  const mode = (env.AI_VIDEO_BACKEND_MODE || 'mock').toLowerCase();
  const artifactRoot = env.AI_VIDEO_ARTIFACT_DIR || path.join(os.tmpdir(), 'lemon-ai-video-artifacts');
  const publicBaseUrl = (env.AI_VIDEO_PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const staticArtifactsRoute = '/api/ai-video/artifacts';
  const corsOrigins =
    parseCsv(env.AI_VIDEO_CORS_ORIGINS) || [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];

  return {
    port,
    mode,
    publicBaseUrl,
    artifactRoot,
    staticArtifactsRoute,
    corsOrigins,
    jsonBodyLimit: env.AI_VIDEO_JSON_BODY_LIMIT || '2mb',
    mock: {
      stepDelayMs: parseIntEnv(env.AI_VIDEO_MOCK_STEP_DELAY_MS, 700),
      outputExt: (env.AI_VIDEO_MOCK_OUTPUT_EXT || 'webm').replace(/^\./, ''),
    },
    comfyui: {
      baseUrl: env.AI_VIDEO_COMFYUI_BASE_URL?.replace(/\/$/, '') || '',
      workflowFile: env.AI_VIDEO_COMFYUI_WORKFLOW_FILE || '',
      workflowJson: env.AI_VIDEO_COMFYUI_WORKFLOW_JSON || '',
      clientId: env.AI_VIDEO_COMFYUI_CLIENT_ID || `lemon-${process.pid}`,
      pollIntervalMs: parseIntEnv(env.AI_VIDEO_COMFYUI_POLL_INTERVAL_MS, 1500),
      requestTimeoutMs: parseIntEnv(env.AI_VIDEO_COMFYUI_REQUEST_TIMEOUT_MS, 15000),
      promptEndpoint: env.AI_VIDEO_COMFYUI_PROMPT_ENDPOINT || '/prompt',
      historyEndpointPrefix: env.AI_VIDEO_COMFYUI_HISTORY_PREFIX || '/history',
      viewEndpoint: env.AI_VIDEO_COMFYUI_VIEW_ENDPOINT || '/view',
      interruptEndpoint: env.AI_VIDEO_COMFYUI_INTERRUPT_ENDPOINT || '/interrupt',
    },
  };
}

export default loadConfig;
