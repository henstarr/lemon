import { decodeAudioSource } from './audioDecode.js';
import { extractAudioFeatures } from './audioFeatures.js';

export async function analyzeAudioFile(input, options = {}) {
  const decoded = await decodeAudioSource(input, options.decode);
  const analysis = extractAudioFeatures(decoded.audioBuffer, options.features);

  return {
    ...analysis,
    source: decoded.source,
    decode: {
      sampleRate: decoded.sampleRate,
      duration: decoded.duration,
      numberOfChannels: decoded.numberOfChannels,
    },
    audioBuffer: options.includeAudioBuffer ? decoded.audioBuffer : undefined,
  };
}

