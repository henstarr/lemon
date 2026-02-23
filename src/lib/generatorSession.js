import { renderCanvasAnimationToWebM } from './webmExport.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

function hashSeed(seed) {
  const str = String(seed ?? 'lemon');
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl(h, s, l, a = 1) {
  return `hsla(${((h % 1) + 1) % 1 * 360}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;
}

function findSectionIndex(sections, t) {
  if (!sections?.length) return -1;
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    if (t >= section.start && (t < section.end || i === sections.length - 1)) return i;
  }
  return sections.length - 1;
}

function interpolateEnvelopeAtTime(analysis, t) {
  const { frames, frameRate, frameCount } = analysis;
  const time = clamp(t, 0, analysis.duration);
  const framePosition = clamp(time * frameRate, 0, Math.max(0, frameCount - 1));
  const i0 = Math.floor(framePosition);
  const i1 = Math.min(frameCount - 1, i0 + 1);
  const frac = framePosition - i0;

  const pick = (arr) => lerp(arr[i0] || 0, arr[i1] || 0, frac);
  return {
    time,
    rms: pick(frames.rms),
    bass: pick(frames.bass),
    mid: pick(frames.mid),
    treble: pick(frames.treble),
    onset: pick(frames.onset),
    energy: pick(frames.energy),
    frameIndex: i0,
  };
}

function computeBeatState(timeline, t) {
  const beats = timeline?.beats || [];
  if (!beats.length) {
    return {
      beatIndex: -1,
      beatPulse: 0,
      beatProgress: 0,
      timeToNextBeat: Infinity,
    };
  }

  let beatIndex = 0;
  while (beatIndex + 1 < beats.length && beats[beatIndex + 1] <= t) beatIndex += 1;

  const prevBeat = beats[beatIndex] ?? 0;
  const nextBeat = beats[beatIndex + 1] ?? (prevBeat + (timeline.beatIntervalSec || 0.5));
  const interval = Math.max(1e-4, nextBeat - prevBeat);
  const beatProgress = clamp((t - prevBeat) / interval, 0, 1);
  const attack = Math.exp(-beatProgress * 8);
  const preBeat = Math.exp(-Math.max(0, (nextBeat - t) / interval) * 20) * 0.35;

  return {
    beatIndex,
    beatPulse: clamp(attack + preBeat, 0, 1.25),
    beatProgress,
    prevBeat,
    nextBeat,
    timeToNextBeat: Math.max(0, nextBeat - t),
  };
}

function makeSectionPalettes(timeline, seed) {
  const rand = mulberry32(hashSeed(seed));
  const sections = timeline?.sections || [];
  return sections.map((section, index) => {
    const baseHue = (rand() + (index * 0.11) + (section.intensity || 0) * 0.2) % 1;
    const accentHue = (baseHue + 0.08 + rand() * 0.2) % 1;
    const bgHue = (baseHue + 0.5 + rand() * 0.15) % 1;
    return {
      baseHue,
      accentHue,
      bgHue,
      sat: 0.75 - rand() * 0.2,
      light: 0.48 + rand() * 0.08,
    };
  });
}

function defaultPaletteForSection(index = 0) {
  return {
    baseHue: (index * 0.14) % 1,
    accentHue: (index * 0.14 + 0.12) % 1,
    bgHue: (index * 0.14 + 0.55) % 1,
    sat: 0.7,
    light: 0.5,
  };
}

function resolveCanvasContext(target) {
  if (!target) return null;
  if (typeof CanvasRenderingContext2D !== 'undefined' && target instanceof CanvasRenderingContext2D) return target;
  if (typeof target.getContext === 'function') return target.getContext('2d');
  if (target.canvas && typeof target.canvas.getContext === 'function') return target;
  return null;
}

function ensureCanvas({ canvas, width, height }) {
  if (canvas) return canvas;
  if (typeof document === 'undefined') {
    throw new Error('No canvas provided and document is unavailable');
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function drawDeterministicFrame(ctx, state, options = {}) {
  const { canvas } = ctx;
  const width = options.width || canvas.width;
  const height = options.height || canvas.height;
  const cx = width * 0.5;
  const cy = height * 0.5;

  const palette = state.palette;
  const bg = ctx.createRadialGradient(cx, cy, width * 0.05, cx, cy, width * 0.75);
  bg.addColorStop(0, hsl(palette.bgHue, 0.65, 0.1 + state.energy * 0.18, 1));
  bg.addColorStop(0.55, hsl(palette.baseHue, 0.55, 0.08 + state.mid * 0.1, 1));
  bg.addColorStop(1, hsl(palette.bgHue + 0.08, 0.45, 0.04, 1));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glowAlpha = 0.08 + state.beat.beatPulse * 0.2 + state.onset * 0.18;
  ctx.fillStyle = hsl(palette.accentHue, 0.9, 0.5, glowAlpha);
  ctx.beginPath();
  ctx.arc(cx, cy, width * (0.08 + state.bass * 0.12), 0, Math.PI * 2);
  ctx.fill();

  const ringCount = 5;
  for (let i = 0; i < ringCount; i += 1) {
    const p = i / (ringCount - 1);
    const radius = width * (0.1 + p * 0.26) * (1 + state.beat.beatPulse * (0.02 + p * 0.04));
    ctx.strokeStyle = hsl(palette.baseHue + p * 0.08 + state.time * 0.01, 0.85, 0.55, 0.14 + (1 - p) * 0.18);
    ctx.lineWidth = 1 + (1 - p) * 2 + state.treble * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  const barCount = 48;
  const inner = width * 0.12;
  const outerBase = width * 0.18;
  for (let i = 0; i < barCount; i += 1) {
    const a = (i / barCount) * Math.PI * 2 + state.motion.spin;
    const harmonic = Math.sin((state.time * state.motion.freqA) + (i * 0.35) + state.motion.phaseA);
    const harmonic2 = Math.cos((state.time * state.motion.freqB) - (i * 0.19) + state.motion.phaseB);
    const envelope = (state.bass * 0.55) + (state.mid * 0.3) + (state.treble * 0.15);
    const pulse = state.beat.beatPulse * (0.45 + 0.55 * (harmonic * 0.5 + 0.5));
    const len = outerBase * (0.45 + envelope * 0.9 + pulse * 0.7 + (harmonic2 * 0.08));
    const x0 = cx + Math.cos(a) * inner;
    const y0 = cy + Math.sin(a) * inner;
    const x1 = cx + Math.cos(a) * (inner + len);
    const y1 = cy + Math.sin(a) * (inner + len);
    ctx.strokeStyle = hsl(palette.accentHue + (i / barCount) * 0.14, 0.9, 0.62, 0.22 + envelope * 0.55);
    ctx.lineWidth = 1 + state.treble * 2 + (i % 6 === 0 ? 1 : 0);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(0, height * 0.78);
  const lineY = 0;
  const padX = width * 0.08;
  const lineW = width - (padX * 2);

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, lineY);
  ctx.lineTo(padX + lineW, lineY);
  ctx.stroke();

  if (state.timeline?.sections?.length) {
    for (const section of state.timeline.sections) {
      const x = padX + (section.start / state.duration) * lineW;
      ctx.strokeStyle = hsl(palette.baseHue + (section.index * 0.07), 0.8, 0.6, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, -8);
      ctx.lineTo(x, 8);
      ctx.stroke();
    }
  }

  ctx.fillStyle = hsl(palette.accentHue, 0.95, 0.6, 0.9);
  const px = padX + state.progress * lineW;
  ctx.beginPath();
  ctx.arc(px, lineY, 4 + state.beat.beatPulse * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createGeneratorSession(config = {}) {
  const { analysis, timeline, seed = 'lemon-mvp', width = 1280, height = 720 } = config;
  if (!analysis?.frames || !timeline?.sections) {
    throw new TypeError('createGeneratorSession requires { analysis, timeline }');
  }

  const sectionPalettes = makeSectionPalettes(timeline, seed);
  const motionSeed = hashSeed(seed);

  function sampleFrameState(t) {
    const env = interpolateEnvelopeAtTime(analysis, t);
    const beat = computeBeatState(timeline, env.time);
    const sectionIndex = findSectionIndex(timeline.sections, env.time);
    const section = sectionIndex >= 0 ? timeline.sections[sectionIndex] : null;
    const palette = sectionPalettes[sectionIndex] || defaultPaletteForSection(sectionIndex);
    const sectionProgress = section ? clamp((env.time - section.start) / Math.max(1e-6, section.duration), 0, 1) : 0;

    const intensity = clamp((env.energy * 0.6) + (beat.beatPulse * 0.25) + (env.onset * 0.15), 0, 1.25);
    const spinBase = (((motionSeed & 255) / 255) * 0.15) + 0.08;
    const motion = {
      spin: (env.time * (spinBase + env.mid * 0.25)) + (sectionIndex * 0.4),
      freqA: 1.4 + (((motionSeed >>> 8) & 255) / 255) * 2.3,
      freqB: 0.8 + (((motionSeed >>> 16) & 255) / 255) * 1.7,
      phaseA: (((motionSeed >>> 2) & 1023) / 1023) * Math.PI * 2 + sectionProgress * 0.5,
      phaseB: (((motionSeed >>> 12) & 1023) / 1023) * Math.PI * 2 - sectionProgress * 0.35,
    };

    return {
      time: env.time,
      duration: analysis.duration,
      progress: analysis.duration > 0 ? env.time / analysis.duration : 0,
      frameIndex: env.frameIndex,
      rms: env.rms,
      bass: env.bass,
      mid: env.mid,
      treble: env.treble,
      onset: env.onset,
      energy: env.energy,
      intensity,
      beat,
      section,
      sectionIndex,
      sectionProgress,
      palette,
      motion,
      timeline,
    };
  }

  function renderFrame(target, t, renderOptions = {}) {
    const ctx = resolveCanvasContext(target);
    if (!ctx) throw new TypeError('renderFrame expects a <canvas> or CanvasRenderingContext2D');
    const state = sampleFrameState(t);
    drawDeterministicFrame(ctx, state, renderOptions);
    return state;
  }

  async function exportWebM(exportOptions = {}) {
    const canvas = ensureCanvas({
      canvas: exportOptions.canvas,
      width: exportOptions.width || width,
      height: exportOptions.height || height,
    });

    if (canvas.width !== (exportOptions.width || width)) canvas.width = exportOptions.width || width;
    if (canvas.height !== (exportOptions.height || height)) canvas.height = exportOptions.height || height;

    return renderCanvasAnimationToWebM({
      ...exportOptions,
      canvas,
      duration: exportOptions.duration || analysis.duration,
      metadata: {
        ...(exportOptions.metadata || {}),
        analysisDuration: analysis.duration,
        estimatedBpm: timeline.bpm,
        timelineSections: timeline.sections.length,
      },
      drawFrame: (ctx, t, info) => renderFrame(ctx, t, {
        width: canvas.width,
        height: canvas.height,
        ...info,
      }),
    });
  }

  return {
    type: 'generator-session',
    version: 1,
    seed,
    width,
    height,
    analysis,
    timeline,
    sampleFrameState,
    renderFrame,
    exportWebM,
    getMetadata() {
      return {
        duration: analysis.duration,
        bpm: timeline.bpm,
        sections: timeline.sections.length,
        seed,
      };
    },
    dispose() {
      // Reserved for future offscreen resources/caches.
    },
  };
}

