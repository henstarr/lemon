function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothArray(values, radius = 2) {
  if (!values.length || radius <= 0) return values.slice();
  const out = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j += 1) {
      sum += values[j];
      count += 1;
    }
    out[i] = count ? sum / count : values[i];
  }
  return out;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(clamp(p, 0, 1) * (sorted.length - 1));
  return sorted[idx];
}

function normalizeSeries(values) {
  const p10 = percentile(values, 0.1);
  const p95 = percentile(values, 0.95);
  const span = Math.max(1e-6, p95 - p10);
  return values.map((v) => clamp((v - p10) / span, 0, 1));
}

function mixToMono(buffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) mono[i] += data[i] / channels;
  }
  return mono;
}

function onePoleLowpass(input, sampleRate, cutoffHz) {
  const out = new Float32Array(input.length);
  const x = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let y = 0;
  for (let i = 0; i < input.length; i += 1) {
    y = (1 - x) * input[i] + x * y;
    out[i] = y;
  }
  return out;
}

function onePoleHighpass(input, sampleRate, cutoffHz) {
  const low = onePoleLowpass(input, sampleRate, cutoffHz);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input[i] - low[i];
  return out;
}

function bandApprox(input, sampleRate, lowHz, highHz) {
  const hp = lowHz > 0 ? onePoleHighpass(input, sampleRate, lowHz) : input;
  return onePoleLowpass(hp, sampleRate, highHz);
}

function windowStats(signal, start, end) {
  let rms = 0;
  let absSum = 0;
  let zcr = 0;
  let prev = signal[start] || 0;
  for (let i = start; i < end; i += 1) {
    const v = signal[i] || 0;
    rms += v * v;
    absSum += Math.abs(v);
    if ((v >= 0 && prev < 0) || (v < 0 && prev >= 0)) zcr += 1;
    prev = v;
  }
  const n = Math.max(1, end - start);
  return {
    rms: Math.sqrt(rms / n),
    meanAbs: absSum / n,
    zcr: zcr / n,
  };
}

export async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio API is unavailable in this browser.');
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return { audioBuffer, arrayBuffer };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function analyzeAudioBuffer(audioBuffer, options = {}) {
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const fps = options.analysisFps ?? 30;
  const mono = mixToMono(audioBuffer);
  const bassSig = bandApprox(mono, sampleRate, 20, 220);
  const midSig = bandApprox(mono, sampleRate, 220, 2400);
  const treSig = bandApprox(mono, sampleRate, 2400, 12000);

  const frameCount = Math.max(1, Math.ceil(duration * fps));
  const samplesPerFrame = Math.max(64, Math.floor(sampleRate / fps));

  const rms = new Array(frameCount);
  const bass = new Array(frameCount);
  const mid = new Array(frameCount);
  const treble = new Array(frameCount);
  const zcr = new Array(frameCount);

  for (let i = 0; i < frameCount; i += 1) {
    const start = i * samplesPerFrame;
    const end = Math.min(mono.length, start + samplesPerFrame);
    const all = windowStats(mono, start, end);
    const b = windowStats(bassSig, start, end);
    const m = windowStats(midSig, start, end);
    const t = windowStats(treSig, start, end);
    rms[i] = all.rms;
    bass[i] = b.rms;
    mid[i] = m.rms;
    treble[i] = t.rms;
    zcr[i] = all.zcr;
  }

  const rmsSmooth = smoothArray(rms, 2);
  const bassSmooth = smoothArray(bass, 2);
  const midSmooth = smoothArray(mid, 2);
  const trebleSmooth = smoothArray(treble, 2);
  const zcrSmooth = smoothArray(zcr, 2);

  const rmsNorm = normalizeSeries(rmsSmooth);
  const bassNorm = normalizeSeries(bassSmooth);
  const midNorm = normalizeSeries(midSmooth);
  const trebleNorm = normalizeSeries(trebleSmooth);
  const zcrNorm = normalizeSeries(zcrSmooth);

  const flux = rmsNorm.map((v, i) => clamp(v - (rmsNorm[i - 1] ?? v), 0, 1));
  const fluxNorm = normalizeSeries(smoothArray(flux, 1));

  const beats = [];
  const minBeatFrames = Math.max(4, Math.floor((fps * 60) / 180));
  const threshold = Math.max(0.2, percentile(fluxNorm, 0.8));
  let lastBeat = -999;
  for (let i = 1; i < fluxNorm.length - 1; i += 1) {
    const v = fluxNorm[i];
    if (v > threshold && v >= fluxNorm[i - 1] && v >= fluxNorm[i + 1] && i - lastBeat >= minBeatFrames) {
      beats.push({ time: i / fps, frame: i, strength: v });
      lastBeat = i;
    }
  }

  const bpms = [];
  for (let i = 1; i < beats.length; i += 1) {
    const dt = beats[i].time - beats[i - 1].time;
    if (dt > 0.18 && dt < 1.5) bpms.push(60 / dt);
  }
  const estimatedBpm = bpms.length ? percentile(bpms, 0.5) : 120;

  return {
    sampleRate,
    duration,
    channels: audioBuffer.numberOfChannels,
    analysisFps: fps,
    frameCount,
    features: {
      rms: rmsNorm,
      bass: bassNorm,
      mid: midNorm,
      treble: trebleNorm,
      flux: fluxNorm,
      zcr: zcrNorm,
    },
    beats,
    estimatedBpm,
  };
}

export function planVisualTimeline(analysis, options = {}) {
  const { duration, analysisFps, frameCount, beats, features } = analysis;
  const fps = options.renderFps ?? 30;
  const scenes = ['nebula', 'bars', 'wave', 'galaxy'];
  const sectionWindowSec = options.sectionWindowSec ?? 6;
  const sectionFrames = Math.max(1, Math.floor(sectionWindowSec * analysisFps));
  const sections = [];

  for (let start = 0; start < frameCount; start += sectionFrames) {
    const end = Math.min(frameCount, start + sectionFrames);
    let energy = 0;
    let flux = 0;
    let bass = 0;
    for (let i = start; i < end; i += 1) {
      energy += features.rms[i] || 0;
      flux += features.flux[i] || 0;
      bass += features.bass[i] || 0;
    }
    const n = Math.max(1, end - start);
    const avgEnergy = energy / n;
    const avgFlux = flux / n;
    const avgBass = bass / n;
    let scene = 'nebula';
    if (avgEnergy > 0.75 || avgFlux > 0.7) scene = 'galaxy';
    else if (avgBass > 0.65) scene = 'bars';
    else if ((features.treble[start] || 0) > 0.6) scene = 'wave';
    sections.push({
      startTime: start / analysisFps,
      endTime: end / analysisFps,
      scene,
      energy: avgEnergy,
      flux: avgFlux,
      bass: avgBass,
    });
  }

  const renderFrameCount = Math.max(1, Math.ceil(duration * fps));
  const curves = {
    intensity: new Array(renderFrameCount),
    pulse: new Array(renderFrameCount),
    colorShift: new Array(renderFrameCount),
    cameraDrift: new Array(renderFrameCount),
    sceneIndex: new Array(renderFrameCount),
  };

  for (let i = 0; i < renderFrameCount; i += 1) {
    const t = i / fps;
    const ai = clamp(Math.floor(t * analysisFps), 0, frameCount - 1);
    const energy = features.rms[ai] || 0;
    const bass = features.bass[ai] || 0;
    const flux = features.flux[ai] || 0;
    const tre = features.treble[ai] || 0;
    let nearestBeat = 999;
    for (let b = 0; b < beats.length; b += 1) {
      const dt = Math.abs(beats[b].time - t);
      if (dt < nearestBeat) nearestBeat = dt;
      if (beats[b].time > t && dt > nearestBeat) break;
    }
    const beatPulse = Math.exp(-Math.pow(nearestBeat / 0.08, 2));
    curves.intensity[i] = clamp(0.2 + energy * 0.8, 0, 1);
    curves.pulse[i] = clamp(bass * 0.7 + beatPulse * 0.9 + flux * 0.4, 0, 1.5);
    curves.colorShift[i] = clamp(tre * 0.7 + flux * 0.6, 0, 1);
    curves.cameraDrift[i] = clamp(energy * 0.5 + tre * 0.3, 0, 1);
    const section = sections.find((s) => t >= s.startTime && t < s.endTime) || sections[sections.length - 1];
    curves.sceneIndex[i] = scenes.indexOf(section?.scene || 'nebula');
  }

  return {
    version: 1,
    duration,
    estimatedBpm: analysis.estimatedBpm,
    analysisFps,
    renderFps: fps,
    scenes,
    beats,
    sections,
    curves,
    featuresSummary: {
      peakEnergy: percentile(features.rms, 0.98),
      peakBass: percentile(features.bass, 0.98),
      peakFlux: percentile(features.flux, 0.98),
    },
  };
}

function sampleCurve(curve, fps, t) {
  if (!curve?.length) return 0;
  const pos = clamp(t * fps, 0, curve.length - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(curve.length - 1, i0 + 1);
  const frac = pos - i0;
  return lerp(curve[i0], curve[i1], frac);
}

export function sampleVisualState(timeline, t) {
  const { renderFps, curves, sections } = timeline;
  const intensity = sampleCurve(curves.intensity, renderFps, t);
  const pulse = sampleCurve(curves.pulse, renderFps, t);
  const colorShift = sampleCurve(curves.colorShift, renderFps, t);
  const cameraDrift = sampleCurve(curves.cameraDrift, renderFps, t);
  const sceneIdx = Math.round(sampleCurve(curves.sceneIndex, renderFps, t));
  const section = sections.find((s) => t >= s.startTime && t < s.endTime) || sections[sections.length - 1];
  return {
    t,
    intensity,
    pulse,
    colorShift,
    cameraDrift,
    scene: section?.scene || ['nebula', 'bars', 'wave', 'galaxy'][sceneIdx] || 'nebula',
    section,
  };
}

function drawGrid(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();
}

function drawScene(ctx, w, h, state, theme = {}) {
  const cyan = theme.cyan || '#00f2ff';
  const magenta = theme.magenta || '#ff00e5';
  const lime = theme.lime || '#adff00';
  const t = state.t;
  const intensity = state.intensity;
  const pulse = state.pulse;
  const shift = state.colorShift;

  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createRadialGradient(w * 0.25, h * 0.2, 0, w * 0.5, h * 0.5, Math.max(w, h));
  bg.addColorStop(0, `rgba(0,242,255,${0.08 + intensity * 0.18})`);
  bg.addColorStop(0.5, `rgba(255,0,229,${0.05 + shift * 0.14})`);
  bg.addColorStop(1, '#050505');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  if (state.scene === 'bars' || state.scene === 'galaxy') {
    const count = 64;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + t * 0.2;
      const len = 40 + pulse * 90 + (Math.sin(t * 6 + i * 0.3) + 1) * 18;
      ctx.strokeStyle = i % 2 ? cyan : magenta;
      ctx.globalAlpha = 0.35 + intensity * 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 80, Math.sin(a) * 80);
      ctx.lineTo(Math.cos(a) * (80 + len), Math.sin(a) * (80 + len));
      ctx.stroke();
    }
  }

  if (state.scene === 'wave' || state.scene === 'galaxy') {
    ctx.strokeStyle = lime;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = -w * 0.35; x <= w * 0.35; x += 6) {
      const y = Math.sin(x * 0.02 + t * 3) * (18 + pulse * 24) + Math.sin(x * 0.006 - t * 1.7) * 8;
      if (x === -w * 0.35) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (state.scene === 'nebula' || state.scene === 'galaxy') {
    for (let i = 0; i < 180; i += 1) {
      const a = (i / 180) * Math.PI * 2 + t * 0.05;
      const r = 35 + ((i * 29) % 140) + pulse * 16;
      const x = Math.cos(a * (1 + shift * 0.4)) * r;
      const y = Math.sin(a * (1 + intensity * 0.3)) * r;
      ctx.fillStyle = i % 3 === 0 ? cyan : i % 3 === 1 ? magenta : lime;
      ctx.globalAlpha = 0.18 + ((i % 7) / 7) * 0.24;
      ctx.beginPath();
      ctx.arc(x, y, 1 + ((i * 17) % 5) + intensity * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  const ringR = 70 + pulse * 28;
  const grad = ctx.createLinearGradient(-ringR, -ringR, ringR, ringR);
  grad.addColorStop(0, cyan);
  grad.addColorStop(0.5, lime);
  grad.addColorStop(1, magenta);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2 + intensity * 3;
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // HUD overlay
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '700 11px Space Grotesk, monospace';
  ctx.fillText('LEMON // PREDICTIVE GENERATION', 24, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`SCENE ${String(state.scene).toUpperCase()}  //  T ${state.t.toFixed(2)}s`, 24, 48);
  ctx.restore();
}

export async function analyzeAudioFile(file, options = {}) {
  const { audioBuffer } = await decodeAudioFile(file);
  const analysis = analyzeAudioBuffer(audioBuffer, options);
  const timeline = planVisualTimeline(analysis, options);
  return {
    fileMeta: {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    },
    analysis,
    timeline,
    audioBuffer,
  };
}

export async function renderPredictiveVideo({
  timeline,
  audioBuffer = null,
  width = 1280,
  height = 720,
  fps = 30,
  mimeType = 'video/webm;codecs=vp9',
  canvas,
  signal,
  onProgress,
}) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser.');
  }

  const targetCanvas = canvas || document.createElement('canvas');
  targetCanvas.width = width;
  targetCanvas.height = height;
  const ctx = targetCanvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas context unavailable.');

  const stream = targetCanvas.captureStream(fps);
  let audioCtx = null;
  let audioDest = null;
  let audioSource = null;
  let combinedStream = stream;
  let hasAudioTrack = false;

  if (audioBuffer) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      try {
        audioCtx = new AudioCtx();
        audioDest = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioDest);
        combinedStream = new MediaStream([
          ...stream.getVideoTracks(),
          ...audioDest.stream.getAudioTracks(),
        ]);
        hasAudioTrack = audioDest.stream.getAudioTracks().length > 0;
      } catch (err) {
        console.warn('Predictive export audio mux setup failed, continuing with silent video:', err);
        combinedStream = stream;
        hasAudioTrack = false;
      }
    }
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm',
    videoBitsPerSecond: 6_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (evt) => {
    if (evt.data && evt.data.size > 0) chunks.push(evt.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onerror = () => reject(recorder.error || new Error('MediaRecorder failed.'));
    recorder.onstop = () => resolve();
  });

  let recorderStopped = false;
  try {
    recorder.start(250);
    if (audioSource && audioCtx) {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      try {
        audioSource.start();
      } catch (err) {
        console.warn('Predictive export audio start failed, continuing without muxed audio:', err);
        hasAudioTrack = false;
      }
    }

    const duration = timeline.duration;
    const totalFrames = Math.max(1, Math.ceil(duration * fps));
    const start = performance.now();

    for (let i = 0; i < totalFrames; i += 1) {
      if (signal?.aborted) {
        try { audioSource?.stop(); } catch { /* noop */ }
        if (recorder.state !== 'inactive') {
          recorder.stop();
          recorderStopped = true;
          await done.catch(() => {});
        }
        throw new DOMException('Generation aborted', 'AbortError');
      }

      const t = i / fps;
      const state = sampleVisualState({ ...timeline, renderFps: fps }, t);
      drawScene(ctx, width, height, state);
      onProgress?.({ frame: i + 1, totalFrames, time: t, duration, phase: 'rendering' });

      // Real-time cadence for MediaRecorder captureStream reliability.
      const targetMs = (i + 1) * (1000 / fps);
      const elapsed = performance.now() - start;
      const waitMs = Math.max(0, targetMs - elapsed);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      else await new Promise((r) => requestAnimationFrame(() => r()));
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
      recorderStopped = true;
    }
    await done;

    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    return {
      blob,
      mimeType: recorder.mimeType || 'video/webm',
      duration,
      width,
      height,
      fps,
      totalFrames,
      silent: !hasAudioTrack,
    };
  } finally {
    if (!recorderStopped && recorder.state !== 'inactive') {
      try {
        recorder.stop();
        await done.catch(() => {});
      } catch { /* noop */ }
    }
    try { audioSource?.disconnect(); } catch { /* noop */ }
    try { audioDest?.disconnect?.(); } catch { /* noop */ }
    if (audioCtx) {
      await audioCtx.close().catch(() => {});
    }
  }
}

export function createTimelineJsonBlob(timeline) {
  return new Blob([JSON.stringify(timeline, null, 2)], { type: 'application/json' });
}

export function drawPredictivePreviewFrame(ctx, width, height, timeline, time) {
  const state = sampleVisualState(timeline, clamp(time, 0, timeline.duration));
  drawScene(ctx, width, height, state);
}
