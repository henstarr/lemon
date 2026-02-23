import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, safeBaseName, sleep, writeJson } from '../utils/common.js';

function buildMockSteps(job) {
  const shotCount = job.request?.jobPlan?.shotPlan?.length || 0;
  return [
    ['queued', 'Queueing AI generation job'],
    ['planning', 'Building prompts and continuity plan'],
    ['synthesizing_sections', `Generating ${shotCount} section clips (mock pipeline)`],
    ['compositing', 'Compositing section clips with reactive overlays (mock)'],
    ['muxing_audio', 'Muxing original uploaded audio (mock)'],
  ];
}

export async function runMockPipeline({ job, config, signal, onProgress }) {
  const steps = buildMockSteps(job);
  const totalSteps = steps.length;

  for (let index = 0; index < steps.length; index += 1) {
    const [phase, message] = steps[index];
    onProgress({
      status: 'running',
      phase,
      message,
      step: index + 1,
      totalSteps,
      percent: Math.max(1, Math.round(((index + 1) / (totalSteps + 1)) * 100)),
    });
    await sleep(config.mock.stepDelayMs + index * 120, signal);
  }

  const fileBase = safeBaseName(job.request?.fileMeta?.name || job.request?.jobPlan?.trackSummary?.fileName || 'lemon-ai-video');
  const fileName = `${fileBase}-ai.${config.mock.outputExt}`;
  const artifactDir = path.join(config.artifactRoot, job.id);
  const artifactPath = path.join(artifactDir, fileName);
  const manifestPath = path.join(artifactDir, 'manifest.json');

  await ensureDir(artifactDir);
  await fs.writeFile(
    artifactPath,
    Buffer.from(
      [
        'LEMON_MOCK_VIDEO_ARTIFACT',
        `jobId=${job.id}`,
        `provider=${job.runtime.provider}`,
        `createdAt=${new Date().toISOString()}`,
      ].join('\n'),
      'utf8',
    ),
  );

  const manifest = {
    provider: job.runtime.provider,
    timelineSource: 'lemon-job-plan-v1',
    compositor: 'mock-local-pipeline',
    mode: 'mock',
    requestEcho: {
      stylePresetId: job.request?.stylePresetId || null,
      aspect: job.request?.aspect || null,
      fileMeta: job.request?.fileMeta || null,
      shotCount: job.request?.jobPlan?.shotPlan?.length || 0,
      duration: job.request?.jobPlan?.duration || null,
    },
    output: {
      duration: job.request?.jobPlan?.duration || null,
      fps: 30,
      width: job.request?.aspect === '9:16' ? 720 : 1280,
      height: job.request?.aspect === '9:16' ? 1280 : 720,
      mockPlaceholder: true,
    },
  };

  await writeJson(manifestPath, manifest);

  onProgress({
    status: 'running',
    phase: 'uploading_artifact',
    message: 'Publishing local mock artifact URL',
    step: totalSteps,
    totalSteps,
    percent: 96,
  });

  return {
    provider: job.runtime.provider,
    fileName,
    mimeType: 'text/plain',
    artifactPath,
    artifactRelativePath: path.relative(config.artifactRoot, artifactPath),
    manifest,
  };
}

export default runMockPipeline;
