import { getStylePresetById } from './stylePresets';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function sectionEnergyLabel(section) {
  const energy = section?.energy ?? 0;
  if (energy > 0.8) return 'peak drop';
  if (energy > 0.62) return 'high-energy drive';
  if (energy > 0.42) return 'mid-energy build';
  return 'ambient intro';
}

function sceneVisualLanguage(scene) {
  switch (scene) {
    case 'bars':
      return 'radial bar arrays, circular spectrum spokes, kick-reactive spikes';
    case 'wave':
      return 'flowing wave ribbons, oscillating light bands, tunnel waveform motion';
    case 'galaxy':
      return 'dense particles, vortex rings, burst pulses, fast camera drift';
    case 'nebula':
    default:
      return 'nebula particles, bloom fog, slow geometric halos';
  }
}

export function buildAIVideoJobPlan({ analysisPackage, stylePresetId = 'pulse-tunnel', aspect = '16:9' }) {
  if (!analysisPackage?.timeline || !analysisPackage?.analysis) {
    throw new Error('Missing analysis/timeline for AI job planning.');
  }

  const preset = getStylePresetById(stylePresetId);
  const { timeline, analysis } = analysisPackage;
  const sections = timeline.sections || [];
  const beats = timeline.beats || [];

  const shotPlan = sections.map((section, idx) => {
    const beatCount = beats.filter((b) => b.time >= section.startTime && b.time < section.endTime).length;
    const intensity = clamp((section.energy ?? 0.5) * 0.7 + (section.flux ?? 0.3) * 0.5, 0, 1);
    const cameraMotion =
      preset.cameraProfile === 'aggressive'
        ? intensity > 0.65 ? 'push-in + orbit burst' : 'slow orbit with anticipation ramp'
        : intensity > 0.65 ? 'controlled dolly pulse' : 'slow drift';

    const prompt = [
      preset.basePrompt,
      sceneVisualLanguage(section.scene),
      `${sectionEnergyLabel(section)}, intensity ${intensity.toFixed(2)}`,
      `camera motion: ${cameraMotion}`,
      `palette emphasis: ${preset.palette.join(', ')}`,
      `music-reactive motion synced to beats, no lyrics, no captions`,
      `section ${idx + 1} of ${sections.length}, seamless continuity with previous and next shot`,
    ].join(', ');

    return {
      id: `shot-${String(idx + 1).padStart(2, '0')}`,
      startTime: section.startTime,
      endTime: section.endTime,
      duration: Math.max(0, section.endTime - section.startTime),
      sceneHint: section.scene,
      beatCount,
      intensity,
      prompt,
      negativePrompt: preset.negativePrompt,
      continuity: {
        previousShotId: idx > 0 ? `shot-${String(idx).padStart(2, '0')}` : null,
        nextShotId: idx < sections.length - 1 ? `shot-${String(idx + 2).padStart(2, '0')}` : null,
      },
      renderHints: {
        cameraMotion,
        motionProfile: preset.motionProfile,
        transitionIn: idx === 0 ? 'fade-from-black + scanline' : 'beat-synced morph',
        transitionOut: idx === sections.length - 1 ? 'hold + fade' : 'pre-drop pulse bridge',
      },
    };
  });

  return {
    version: 1,
    modelPreference: 'wan2.1',
    aspect,
    duration: analysis.duration,
    estimatedBpm: analysis.estimatedBpm,
    stylePreset: {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      palette: preset.palette,
    },
    trackSummary: {
      fileName: analysisPackage.fileMeta?.name || 'audio-file',
      duration: analysis.duration,
      bpm: analysis.estimatedBpm,
      beats: analysis.beats.length,
      sections: sections.length,
    },
    shotPlan,
    compositionPlan: {
      frameRate: 30,
      transitions: 'beat-aligned',
      overlays: ['reactive rings', 'glow pulses', 'scanline', 'grid'],
      audioMux: 'original uploaded track',
    },
  };
}

