import { renderPredictiveVideo } from '../predictiveVideoPipeline';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMockWanJob({
  analysisPackage,
  jobPlan,
  signal,
  onProgress,
}) {
  const steps = [
    ['queued', 'Queueing AI generation job'],
    ['planning', 'Building section prompts and continuity plan'],
    ['synthesizing_sections', `Generating ${jobPlan.shotPlan.length} section clips (mock)`],
    ['compositing', 'Compositing section clips with reactive overlays'],
    ['muxing_audio', 'Muxing original uploaded audio'],
  ];

  for (let i = 0; i < steps.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');
    const [phase, message] = steps[i];
    onProgress?.({
      phase,
      message,
      step: i + 1,
      totalSteps: steps.length,
      percent: Math.round(((i + 1) / (steps.length + 1)) * 100),
    });
    await sleep(450 + i * 120);
  }

  if (signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');

  onProgress?.({
    phase: 'compositing',
    message: 'Rendering local placeholder video using predictive engine',
    percent: 84,
  });

  const canvas = document.createElement('canvas');
  const renderResult = await renderPredictiveVideo({
    timeline: analysisPackage.timeline,
    audioBuffer: analysisPackage.audioBuffer || null,
    width: 1280,
    height: 720,
    fps: 30,
    canvas,
    signal,
    onProgress: (frameProgress) => {
      const ratio = frameProgress.totalFrames
        ? frameProgress.frame / frameProgress.totalFrames
        : 0;
      onProgress?.({
        phase: 'rendering_preview_output',
        message: `Rendering placeholder output frame ${frameProgress.frame}/${frameProgress.totalFrames}`,
        frame: frameProgress.frame,
        totalFrames: frameProgress.totalFrames,
        percent: 84 + Math.round(ratio * 14),
      });
    },
  });

  onProgress?.({
    phase: 'complete',
    message: 'AI job scaffold complete (mock Wan2.1 provider)',
    percent: 100,
  });

  return {
    provider: 'mock-wan2.1',
    jobId: `mock-wan-${Date.now()}`,
    status: 'completed',
    artifact: renderResult,
    manifest: {
      model: 'wan2.1',
      mode: 'mock',
      jobPlan,
      sectionsGenerated: jobPlan.shotPlan.length,
      output: {
        width: renderResult.width,
        height: renderResult.height,
        fps: renderResult.fps,
        duration: renderResult.duration,
        silent: renderResult.silent,
      },
    },
  };
}

