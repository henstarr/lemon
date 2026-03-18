import { audioBufferToMono } from './audioDecode.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function normalizeEnvelope(arrayLike) {
  const arr = Array.from(arrayLike);
  const floor = percentile(arr, 0.05);
  const ceil = Math.max(percentile(arr, 0.98), floor + 1e-6);
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 1) {
    out[i] = clamp01((arr[i] - floor) / (ceil - floor));
  }
  return out;
}

function smoothEnvelope(input, factor = 0.2) {
  const out = new Float32Array(input.length);
  let state = 0;
  for (let i = 0; i < input.length; i += 1) {
    state += (input[i] - state) * factor;
    out[i] = state;
  }
  return out;
}

function onePoleAlpha(cutoffHz, sampleRate) {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  return dt / (rc + dt);
}

export function extractAudioFeatures(audioBuffer, options = {}) {
  const mono = options.monoData || audioBufferToMono(audioBuffer);
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const frameRate = Math.max(1, options.frameRate || 60);
  const frameSize = Math.max(64, Math.round(sampleRate / frameRate));
  const frameCount = Math.max(1, Math.ceil(mono.length / frameSize));
  const framesPerSecond = sampleRate / frameSize;

  const times = new Float32Array(frameCount);
  const rmsRaw = new Float32Array(frameCount);
  const bassRaw = new Float32Array(frameCount);
  const midRaw = new Float32Array(frameCount);
  const trebleRaw = new Float32Array(frameCount);
  const onsetRaw = new Float32Array(frameCount);

  const bassAlpha = onePoleAlpha(options.bassCutoffHz || 250, sampleRate);
  const midTopAlpha = onePoleAlpha(options.midTopCutoffHz || 4000, sampleRate);

  let bassLp = 0;
  let midTopLp = 0;
  let prevBassEnergy = 0;
  let prevMidEnergy = 0;
  let prevTrebleEnergy = 0;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = frameIndex * frameSize;
    const end = Math.min(mono.length, start + frameSize);
    const count = Math.max(1, end - start);

    let sumSq = 0;
    let bassEnergy = 0;
    let midEnergy = 0;
    let trebleEnergy = 0;

    for (let i = start; i < end; i += 1) {
      const sample = mono[i];
      sumSq += sample * sample;

      bassLp += bassAlpha * (sample - bassLp);
      midTopLp += midTopAlpha * (sample - midTopLp);

      const bass = bassLp;
      const mid = midTopLp - bassLp;
      const treble = sample - midTopLp;

      bassEnergy += bass * bass;
      midEnergy += mid * mid;
      trebleEnergy += treble * treble;
    }

    const rms = Math.sqrt(sumSq / count);
    const bassEnv = Math.sqrt(bassEnergy / count);
    const midEnv = Math.sqrt(midEnergy / count);
    const trebleEnv = Math.sqrt(trebleEnergy / count);

    const bassDelta = Math.max(0, bassEnv - prevBassEnergy);
    const midDelta = Math.max(0, midEnv - prevMidEnergy);
    const trebleDelta = Math.max(0, trebleEnv - prevTrebleEnergy);
    const onset = (bassDelta * 1.3) + (midDelta * 1.0) + (trebleDelta * 0.8);

    prevBassEnergy = bassEnv;
    prevMidEnergy = midEnv;
    prevTrebleEnergy = trebleEnv;

    times[frameIndex] = (start + count * 0.5) / sampleRate;
    rmsRaw[frameIndex] = rms;
    bassRaw[frameIndex] = bassEnv;
    midRaw[frameIndex] = midEnv;
    trebleRaw[frameIndex] = trebleEnv;
    onsetRaw[frameIndex] = onset;
  }

  const rms = smoothEnvelope(normalizeEnvelope(rmsRaw), 0.28);
  const bass = smoothEnvelope(normalizeEnvelope(bassRaw), 0.2);
  const mid = smoothEnvelope(normalizeEnvelope(midRaw), 0.22);
  const treble = smoothEnvelope(normalizeEnvelope(trebleRaw), 0.25);
  const onset = normalizeEnvelope(onsetRaw);
  const energy = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    energy[i] = clamp01((rms[i] * 0.4) + (bass[i] * 0.25) + (mid[i] * 0.2) + (treble[i] * 0.15));
  }

  let peakRms = 0;
  let averageRms = 0;
  let peakOnset = 0;
  for (let i = 0; i < frameCount; i += 1) {
    peakRms = Math.max(peakRms, rms[i]);
    peakOnset = Math.max(peakOnset, onset[i]);
    averageRms += rms[i];
  }
  averageRms /= frameCount || 1;

  return {
    type: 'audio-analysis',
    version: 1,
    duration,
    sampleRate,
    channels: audioBuffer.numberOfChannels,
    totalSamples: mono.length,
    frameRate: framesPerSecond,
    frameSize,
    frameCount,
    frames: {
      times,
      rms,
      bass,
      mid,
      treble,
      onset,
      energy,
    },
    rawFrames: {
      rms: rmsRaw,
      bass: bassRaw,
      mid: midRaw,
      treble: trebleRaw,
      onset: onsetRaw,
    },
    summary: {
      peakRms,
      averageRms,
      peakOnset,
      duration,
    },
  };
}

