export const AI_VISUAL_STYLE_PRESETS = [
  {
    id: 'pulse-tunnel',
    name: 'Pulse Tunnel',
    description: 'Neon tunnel + radial pulses + drop bursts (reference-inspired).',
    basePrompt:
      'abstract cyberpunk music visualizer, neon tunnel geometry, radial rings, chromatic glow, high contrast black background, no text, no logos, cinematic camera motion',
    negativePrompt:
      'people, faces, realistic objects, UI text, logos, watermark, low contrast, washed out colors, blurry details',
    palette: ['#00f2ff', '#ff00e5', '#adff00'],
    cameraProfile: 'aggressive',
    motionProfile: 'beat-reactive',
  },
  {
    id: 'neon-lattice',
    name: 'Neon Lattice',
    description: 'Grid tunnels and lattice bloom with cleaner geometry.',
    basePrompt:
      'futuristic lattice structures, glowing cyan magenta lime accents, black void, volumetric fog, geometric energy waves, abstract audiovisual art',
    negativePrompt:
      'characters, typography, product mockups, logos, photoreal scenery',
    palette: ['#00f2ff', '#ff00e5', '#adff00'],
    cameraProfile: 'smooth',
    motionProfile: 'flow-reactive',
  },
];

export function getStylePresetById(id) {
  return AI_VISUAL_STYLE_PRESETS.find((p) => p.id === id) || AI_VISUAL_STYLE_PRESETS[0];
}

