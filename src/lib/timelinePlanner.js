function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function localMaxima(values, minValue = 0, minGapFrames = 1) {
  const peaks = [];
  let lastAccepted = -Infinity;
  for (let i = 1; i < values.length - 1; i += 1) {
    if (values[i] < minValue) continue;
    if (values[i] < values[i - 1] || values[i] < values[i + 1]) continue;
    if (i - lastAccepted < minGapFrames) {
      if (peaks.length && values[i] > values[peaks[peaks.length - 1]]) {
        peaks[peaks.length - 1] = i;
        lastAccepted = i;
      }
      continue;
    }
    peaks.push(i);
    lastAccepted = i;
  }
  return peaks;
}

function estimateTempo(frames, options = {}) {
  const onset = frames.onset;
  const frameRate = options.frameRate;
  const minBpm = options.minBpm || 70;
  const maxBpm = options.maxBpm || 180;

  const minLag = Math.max(1, Math.round((60 / maxBpm) * frameRate));
  const maxLag = Math.max(minLag + 1, Math.round((60 / minBpm) * frameRate));

  let bestLag = Math.round((60 / 120) * frameRate);
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    let samples = 0;
    for (let i = lag; i < onset.length; i += 1) {
      score += onset[i] * onset[i - lag];
      samples += 1;
    }

    const halfLag = Math.round(lag * 0.5);
    const doubleLag = Math.min(onset.length - 1, lag * 2);
    let harmonicPenalty = 0;
    for (let i = lag; i < onset.length; i += 1) {
      if (halfLag > 0 && i - halfLag >= 0) harmonicPenalty += onset[i] * onset[i - halfLag] * 0.35;
      if (doubleLag > 0 && i - doubleLag >= 0) harmonicPenalty += onset[i] * onset[i - doubleLag] * 0.2;
    }

    const normalized = (score / (samples || 1)) - (harmonicPenalty / (samples || 1));
    if (normalized > bestScore) {
      bestScore = normalized;
      bestLag = lag;
    }
  }

  const bpm = 60 / (bestLag / frameRate);
  return {
    bpm,
    beatIntervalSec: 60 / bpm,
    beatLagFrames: bestLag,
    confidence: clamp01((bestScore || 0) * 4),
  };
}

function estimateBeatPhase({ onset, energy, frameRate, beatLagFrames }) {
  const lag = Math.max(1, Math.round(beatLagFrames));
  let bestOffset = 0;
  let bestScore = -Infinity;

  for (let offset = 0; offset < lag; offset += 1) {
    let score = 0;
    let hits = 0;
    for (let i = offset; i < onset.length; i += lag) {
      score += (onset[i] * 1.3) + (energy[i] * 0.4);
      hits += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  return {
    beatOffsetFrames: bestOffset,
    beatOffsetSec: bestOffset / frameRate,
  };
}

function buildBeatGrid({ duration, frameRate, beatLagFrames, beatOffsetFrames }) {
  const beatIntervalSec = beatLagFrames / frameRate;
  const beatOffsetSec = beatOffsetFrames / frameRate;
  const beats = [];
  for (let t = beatOffsetSec; t <= duration + 1e-6; t += beatIntervalSec) {
    beats.push(Number(t.toFixed(6)));
  }
  if (!beats.length || beats[0] > 0.2) beats.unshift(0);
  const downbeats = beats.filter((_, index) => index % 4 === 0);
  return { beats, downbeats, beatIntervalSec };
}

function buildNoveltyCurve(frames) {
  const novelty = new Float32Array(frames.rms.length);
  novelty[0] = frames.onset[0] || 0;
  for (let i = 1; i < novelty.length; i += 1) {
    const energyJump = Math.abs(frames.energy[i] - frames.energy[i - 1]);
    const spectralChange = (Math.abs(frames.bass[i] - frames.bass[i - 1])
      + Math.abs(frames.mid[i] - frames.mid[i - 1])
      + Math.abs(frames.treble[i] - frames.treble[i - 1])) / 3;
    novelty[i] = Math.min(1, (frames.onset[i] * 0.55) + (energyJump * 0.25) + (spectralChange * 0.2));
  }
  return novelty;
}

function pickSectionBoundaries({ analysis, beatGrid, options }) {
  const { frames, frameRate, duration } = analysis;
  const novelty = buildNoveltyCurve(frames);
  const minSectionSeconds = options.minSectionSeconds || 8;
  const minGapFrames = Math.max(1, Math.round(minSectionSeconds * frameRate));
  const threshold = options.sectionPeakThreshold || 0.35;
  const peakFrames = localMaxima(novelty, threshold, minGapFrames);
  const boundaries = [0];

  for (const frameIndex of peakFrames) {
    const t = frames.times[frameIndex] || (frameIndex / frameRate);
    if (t < minSectionSeconds) continue;
    if (duration - t < 4) continue;
    if (t - boundaries[boundaries.length - 1] < minSectionSeconds) continue;
    boundaries.push(Number(t.toFixed(6)));
  }

  const phraseLengthBeats = options.phraseLengthBeats || 16;
  const phraseSeconds = beatGrid.beatIntervalSec * phraseLengthBeats;
  if (boundaries.length < 2 && Number.isFinite(phraseSeconds) && phraseSeconds > 0) {
    for (let t = phraseSeconds; t < duration - 4; t += phraseSeconds) {
      if (t - boundaries[boundaries.length - 1] >= minSectionSeconds) {
        boundaries.push(Number(t.toFixed(6)));
      }
    }
  }

  if (boundaries[boundaries.length - 1] !== duration) boundaries.push(Number(duration.toFixed(6)));
  return { boundaries, novelty };
}

function classifySection(index, total, avgEnergy, avgOnset) {
  if (index === 0) return 'intro';
  if (index === total - 1) return 'outro';
  if (avgOnset > 0.55 && avgEnergy > 0.55) return 'drop';
  if (avgOnset > 0.45) return 'build';
  if (avgEnergy < 0.3) return 'break';
  return index % 2 === 0 ? 'groove' : 'lift';
}

export function planTimeline(analysis, options = {}) {
  if (!analysis?.frames?.times || !analysis?.frameRate) {
    throw new TypeError('planTimeline expects an analysis object from analyzeAudioFile/extractAudioFeatures');
  }

  const tempo = estimateTempo(analysis.frames, {
    frameRate: analysis.frameRate,
    minBpm: options.minBpm,
    maxBpm: options.maxBpm,
  });

  const phase = estimateBeatPhase({
    onset: analysis.frames.onset,
    energy: analysis.frames.energy,
    frameRate: analysis.frameRate,
    beatLagFrames: tempo.beatLagFrames,
  });

  const beatGrid = buildBeatGrid({
    duration: analysis.duration,
    frameRate: analysis.frameRate,
    beatLagFrames: tempo.beatLagFrames,
    beatOffsetFrames: phase.beatOffsetFrames,
  });

  const { boundaries, novelty } = pickSectionBoundaries({
    analysis,
    beatGrid,
    options,
  });

  const sections = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const startFrame = Math.max(0, Math.floor(start * analysis.frameRate));
    const endFrame = Math.min(analysis.frameCount - 1, Math.ceil(end * analysis.frameRate));
    let energySum = 0;
    let onsetSum = 0;
    let count = 0;
    for (let f = startFrame; f <= endFrame; f += 1) {
      energySum += analysis.frames.energy[f] || 0;
      onsetSum += analysis.frames.onset[f] || 0;
      count += 1;
    }
    const avgEnergy = energySum / (count || 1);
    const avgOnset = onsetSum / (count || 1);
    sections.push({
      id: `section-${i}`,
      index: i,
      start,
      end,
      duration: Number((end - start).toFixed(6)),
      label: classifySection(i, boundaries.length - 1, avgEnergy, avgOnset),
      intensity: clamp01((avgEnergy * 0.65) + (avgOnset * 0.35)),
      avgEnergy,
      avgOnset,
    });
  }

  return {
    type: 'timeline-plan',
    version: 1,
    duration: analysis.duration,
    bpm: Number(tempo.bpm.toFixed(2)),
    tempoConfidence: tempo.confidence,
    beatIntervalSec: Number(beatGrid.beatIntervalSec.toFixed(6)),
    beatOffsetSec: Number(phase.beatOffsetSec.toFixed(6)),
    beats: beatGrid.beats,
    downbeats: beatGrid.downbeats,
    sections,
    curves: {
      novelty,
    },
    markers: sections.map((section) => ({
      type: 'section',
      time: section.start,
      label: section.label,
      intensity: section.intensity,
    })),
  };
}

