import cors from 'cors';
import express from 'express';
import fs from 'node:fs/promises';
import loadConfig from './config.js';
import { AIVideoJobService, validateCreateJobPayload } from './jobService.js';

async function probeUrl(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err?.message || 'fetch failed' };
  } finally {
    clearTimeout(timer);
  }
}

function createCorsOptions(config) {
  const allowAll = config.corsOrigins.includes('*');
  const allowLocalDevHost = (origin) => {
    if (!origin) return true;
    const value = String(origin).toLowerCase();
    return value.includes('://localhost:') || value.includes('://127.0.0.1:');
  };
  return {
    origin(origin, callback) {
      if (allowAll || !origin || config.corsOrigins.includes(origin) || allowLocalDevHost(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  };
}

export async function createAIVideoApp(customConfig) {
  const config = customConfig || loadConfig();
  await fs.mkdir(config.artifactRoot, { recursive: true });

  const app = express();
  const jobs = new AIVideoJobService(config);
  const corsMiddleware = cors(createCorsOptions(config));

  app.use(config.staticArtifactsRoute, corsMiddleware, express.static(config.artifactRoot));
  app.use('/api/ai-video', corsMiddleware);
  app.options(/^\/api\/ai-video\/.*$/, corsMiddleware);
  app.use(express.json({ limit: config.jsonBodyLimit }));

  app.get('/api/ai-video/health', async (_req, res) => {
    const comfyuiConfigured = Boolean(config.comfyui.baseUrl && (config.comfyui.workflowFile || config.comfyui.workflowJson));
    let comfyuiProbe = null;
    if (config.comfyui.baseUrl) {
      comfyuiProbe = await probeUrl(`${config.comfyui.baseUrl}${config.comfyui.historyEndpointPrefix}`);
    }

    res.json({
      ok: true,
      mode: config.mode,
      resolvedMode: jobs.resolveBackendMode(),
      comfyuiConfigured,
      comfyuiBaseUrl: config.comfyui.baseUrl || null,
      comfyuiPromptUrl: config.comfyui.baseUrl ? `${config.comfyui.baseUrl}${config.comfyui.promptEndpoint}` : null,
      comfyuiHistoryUrl: config.comfyui.baseUrl ? `${config.comfyui.baseUrl}${config.comfyui.historyEndpointPrefix}` : null,
      comfyuiProbe,
    });
  });

  app.post('/api/ai-video/jobs', (req, res) => {
    const validationError = validateCreateJobPayload(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const created = jobs.createJob(req.body);
    res.status(202).json({
      jobId: created.jobId,
      status: created.status,
      phase: created.phase,
      message: created.message,
    });
  });

  app.get('/api/ai-video/jobs/:jobId', (req, res) => {
    const job = jobs.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json(job);
  });

  app.post('/api/ai-video/jobs/:jobId/cancel', (req, res) => {
    const cancelled = jobs.cancelJob(req.params.jobId);
    if (!cancelled) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ jobId: cancelled.jobId, status: cancelled.status });
  });

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON request body' });
      return;
    }
    if (err?.message?.startsWith('Origin not allowed by CORS:')) {
      res.status(403).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[ai-video-api] unhandled error', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, config, jobs };
}

export default createAIVideoApp;
