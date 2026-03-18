function isAudioBufferLike(value) {
  return value
    && typeof value === 'object'
    && typeof value.getChannelData === 'function'
    && typeof value.duration === 'number'
    && typeof value.sampleRate === 'number';
}

function cloneArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input.slice(0);
  if (ArrayBuffer.isView(input)) {
    const view = input;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  }
  throw new TypeError('Expected ArrayBuffer or TypedArray');
}

async function decodeAudioDataPortable(audioContext, arrayBuffer) {
  const bufferCopy = cloneArrayBuffer(arrayBuffer);

  try {
    const result = audioContext.decodeAudioData(bufferCopy);
    if (result && typeof result.then === 'function') return await result;
  } catch (error) {
    // Safari can throw synchronously when it expects callback-style decode.
    if (!audioContext || typeof audioContext.decodeAudioData !== 'function') throw error;
  }

  return await new Promise((resolve, reject) => {
    audioContext.decodeAudioData(bufferCopy, resolve, reject);
  });
}

export async function resolveAudioArrayBuffer(input, options = {}) {
  if (input == null) throw new TypeError('Missing audio input');

  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    return {
      arrayBuffer: cloneArrayBuffer(input),
      sourceType: 'arrayBuffer',
      sourceName: options.sourceName || 'memory',
    };
  }

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const sourceName = typeof input.name === 'string' ? input.name : (options.sourceName || 'blob');
    return {
      arrayBuffer: await input.arrayBuffer(),
      sourceType: 'blob',
      sourceName,
      mimeType: input.type || undefined,
    };
  }

  if (typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL)) {
    const url = String(input);
    const response = await fetch(url, options.fetchInit);
    if (!response.ok) throw new Error(`Failed to fetch audio URL (${response.status}): ${url}`);
    return {
      arrayBuffer: await response.arrayBuffer(),
      sourceType: 'url',
      sourceName: url,
      mimeType: response.headers.get('content-type') || undefined,
    };
  }

  throw new TypeError('Unsupported audio input type. Expected File/Blob, URL string, ArrayBuffer, or TypedArray');
}

export async function decodeAudioSource(input, options = {}) {
  if (isAudioBufferLike(input)) {
    return {
      audioBuffer: input,
      arrayBuffer: null,
      duration: input.duration,
      sampleRate: input.sampleRate,
      numberOfChannels: input.numberOfChannels,
      source: {
        type: 'audioBuffer',
        name: options.sourceName || 'AudioBuffer',
      },
    };
  }

  const AudioContextCtor = options.AudioContext
    || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext))
    || globalThis.AudioContext
    || globalThis.webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error('Web Audio API is unavailable in this environment');
  }

  const resolved = await resolveAudioArrayBuffer(input, options);
  const ownContext = !options.audioContext;
  const audioContext = options.audioContext || new AudioContextCtor({
    sampleRate: options.decodeSampleRate,
  });

  try {
    const audioBuffer = await decodeAudioDataPortable(audioContext, resolved.arrayBuffer);
    return {
      audioBuffer,
      arrayBuffer: resolved.arrayBuffer,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      source: {
        type: resolved.sourceType,
        name: resolved.sourceName,
        mimeType: resolved.mimeType,
      },
    };
  } finally {
    if (ownContext && typeof audioContext.close === 'function') {
      try {
        await audioContext.close();
      } catch {
        // Closing a temporary decode context can fail in some browsers; analysis result is still valid.
      }
    }
  }
}

export function audioBufferToMono(audioBuffer) {
  if (!isAudioBufferLike(audioBuffer)) {
    throw new TypeError('audioBufferToMono expects an AudioBuffer');
  }

  const { length, numberOfChannels } = audioBuffer;
  const mono = new Float32Array(length);

  if (numberOfChannels <= 0) return mono;
  if (numberOfChannels === 1) {
    mono.set(audioBuffer.getChannelData(0));
    return mono;
  }

  const scale = 1 / numberOfChannels;
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) mono[i] += data[i] * scale;
  }

  return mono;
}

