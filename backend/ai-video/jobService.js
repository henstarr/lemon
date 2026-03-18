import { runMockPipeline } from './runners/mockPipeline.js';
import { isComfyUiConfigured, isComfyUiConfiguredForJob, runComfyUiWanPipeline } from './adapters/comfyUiWanAdapter.js';

function createJobId() {
  return `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function isTerminalStatus(status) {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

function nowIso() {
  return new Date().toISOString();
}

export class AIVideoJobService {
  constructor(config) {
    this.config = config;
    this.jobs = new Map();
  }

  createJob(payload) {
    const id = createJobId();
    const job = {
      id,
      request: payload,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'queued',
      phase: 'queued',
      message: 'Job queued',
      percent: 0,
      step: 0,
      totalSteps: 0,
      error: null,
      completedAt: null,
      runtime: {
        provider: payload?.provider || 'wan2.1',
        backendMode: this.resolveBackendMode(payload),
        remotePromptId: null,
      },
      result: null,
      controller: new AbortController(),
      cancelRequested: false,
    };

    this.jobs.set(id, job);
    queueMicrotask(() => {
      this.runJob(job).catch((err) => {
        if (!isTerminalStatus(job.status)) {
          this.failJob(job, err);
        }
      });
    });

    return this.serialize(job);
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    return job ? this.serialize(job) : null;
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    if (isTerminalStatus(job.status)) {
      if (job.status !== 'cancelled') {
        return this.serialize(job);
      }
      return this.serialize(job);
    }

    job.cancelRequested = true;
    job.status = 'cancelled';
    job.phase = 'cancelled';
    job.message = 'Job cancelled';
    job.percent = job.percent || 0;
    job.updatedAt = nowIso();
    job.completedAt = nowIso();
    job.controller.abort();

    return this.serialize(job);
  }

  resolveBackendMode(payload) {
    if (this.config.mode === 'auto') {
      return isComfyUiConfiguredForJob(this.config, payload) ? 'comfyui' : 'mock';
    }
    return this.config.mode;
  }

  async runJob(job) {
    const backendMode = job.runtime.backendMode;
    this.updateJob(job, {
      status: 'running',
      phase: 'queued',
      message: backendMode === 'comfyui' ? 'Dispatching Wan2.1 job to ComfyUI' : 'Starting local mock pipeline',
      percent: 1,
    });

    const onProgress = (patch) => this.updateJob(job, patch);
    const signal = job.controller.signal;

    try {
      let result;
      if (backendMode === 'comfyui') {
        result = await runComfyUiWanPipeline({ job, config: this.config, signal, onProgress });
      } else {
        result = await runMockPipeline({ job, config: this.config, signal, onProgress });
      }

      if (job.cancelRequested) return;
      const artifactUrl = `${this.config.publicBaseUrl}${this.config.staticArtifactsRoute}/${result.artifactRelativePath.replace(/\\/g, '/')}`;
      job.result = {
        ...result,
        artifactUrl,
      };
      this.updateJob(job, {
        status: 'completed',
        phase: 'complete',
        message: 'Done',
        percent: 100,
        completedAt: nowIso(),
      });
    } catch (err) {
      if (err?.name === 'AbortError' || signal.aborted || job.cancelRequested) {
        this.updateJob(job, {
          status: 'cancelled',
          phase: 'cancelled',
          message: 'Job cancelled',
          completedAt: nowIso(),
        });
        return;
      }
      this.failJob(job, err);
    }
  }

  failJob(job, err) {
    this.updateJob(job, {
      status: 'failed',
      phase: 'failed',
      message: 'AI video job failed',
      error: err?.message || String(err),
      completedAt: nowIso(),
    });
  }

  updateJob(job, patch) {
    if (job.status === 'cancelled' && patch.status !== 'cancelled') {
      return;
    }
    Object.assign(job, patch);
    job.updatedAt = nowIso();
  }

  serialize(job) {
    const base = {
      jobId: job.id,
      id: job.id,
      status: job.status,
      phase: job.phase,
      message: job.message,
      percent: job.percent,
      step: job.step,
      totalSteps: job.totalSteps,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    if (job.error) base.error = job.error;

    if (job.status === 'completed' && job.result) {
      base.fileName = job.result.fileName;
      base.mimeType = job.result.mimeType;
      base.artifactUrl = job.result.artifactUrl;
      base.manifest = job.result.manifest;
    }

    if (job.status === 'cancelled') {
      base.status = 'cancelled';
      base.phase = 'cancelled';
    }

    return base;
  }
}

export function validateCreateJobPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Request body must be a JSON object.';
  }
  if (!payload.jobPlan || typeof payload.jobPlan !== 'object') {
    return 'Missing required field: jobPlan';
  }
  if (!Array.isArray(payload.jobPlan.shotPlan)) {
    return 'jobPlan.shotPlan must be an array';
  }
  if (payload.workflowJson != null && typeof payload.workflowJson !== 'string' && typeof payload.workflowJson !== 'object') {
    return 'workflowJson must be a JSON string or object when provided';
  }
  if (payload.comfyui?.workflowJson != null && typeof payload.comfyui.workflowJson !== 'string' && typeof payload.comfyui.workflowJson !== 'object') {
    return 'comfyui.workflowJson must be a JSON string or object when provided';
  }
  return null;
}

export default AIVideoJobService;
