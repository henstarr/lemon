function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

export function pickSupportedWebMMimeType(preferred = []) {
  const candidates = [
    ...preferred,
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  if (typeof MediaRecorder === 'undefined') return null;

  for (const type of candidates) {
    if (!type) continue;
    if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
}

function mergeAudioTrackIntoStream(videoStream, options) {
  const { audioTrack, audioStream } = options;
  let hasAudio = false;

  if (audioTrack && typeof videoStream.addTrack === 'function') {
    videoStream.addTrack(audioTrack);
    hasAudio = true;
  }

  if (audioStream?.getAudioTracks) {
    for (const track of audioStream.getAudioTracks()) {
      videoStream.addTrack(track);
      hasAudio = true;
    }
  }

  return hasAudio;
}

export async function renderCanvasAnimationToWebM(options = {}) {
  const {
    canvas,
    ctx: providedCtx,
    duration,
    fps = 30,
    drawFrame,
    mimeType,
    mimeTypeCandidates,
    videoBitsPerSecond = 8_000_000,
    onProgress,
    signal,
    metadata = {},
  } = options;

  if (!canvas && !providedCtx?.canvas) throw new Error('renderCanvasAnimationToWebM requires a canvas or 2D context');
  if (typeof drawFrame !== 'function') throw new TypeError('renderCanvasAnimationToWebM requires drawFrame(t, ...) function');
  if (!(duration > 0)) throw new TypeError('renderCanvasAnimationToWebM requires duration > 0');
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is unavailable in this environment');

  const renderCanvas = canvas || providedCtx.canvas;
  const ctx = providedCtx || renderCanvas.getContext('2d');
  if (!ctx) throw new Error('Unable to get 2D context for export canvas');
  if (typeof renderCanvas.captureStream !== 'function') throw new Error('Canvas captureStream() is unavailable');

  const chosenMimeType = mimeType || pickSupportedWebMMimeType(mimeTypeCandidates);
  if (!chosenMimeType) throw new Error('No supported WebM MediaRecorder MIME type found');

  const stream = renderCanvas.captureStream(fps);
  const hasAudio = mergeAudioTrackIntoStream(stream, options);
  const recorder = new MediaRecorder(stream, {
    mimeType: chosenMimeType,
    videoBitsPerSecond,
  });

  const chunks = [];
  let recorderError = null;

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = (event) => {
    recorderError = event.error || new Error('MediaRecorder error');
  };

  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      if (recorderError) reject(recorderError);
      else resolve();
    };
  });

  const frameCount = Math.max(1, Math.ceil(duration * fps));
  const frameMs = 1000 / fps;
  const videoTrack = stream.getVideoTracks?.()[0];

  recorder.start(Math.max(100, Math.round(frameMs * 4)));
  await nextFrame();

  const wallClockStart = performance.now();

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    if (signal?.aborted) {
      recorder.stop();
      throw signal.reason || new DOMException('Export aborted', 'AbortError');
    }

    const t = Math.min(duration, frameIndex / fps);
    drawFrame(ctx, t, {
      frameIndex,
      frameCount,
      fps,
      duration,
      exportMode: true,
    });

    if (typeof videoTrack?.requestFrame === 'function') {
      videoTrack.requestFrame();
    }

    onProgress?.({
      frameIndex,
      frameCount,
      progress: (frameIndex + 1) / frameCount,
      time: t,
    });

    const target = wallClockStart + ((frameIndex + 1) * frameMs);
    const wait = target - performance.now();
    if (wait > 4) await sleep(wait - 2);
    await nextFrame();
  }

  drawFrame(ctx, duration, {
    frameIndex: frameCount,
    frameCount,
    fps,
    duration,
    exportMode: true,
    finalFrame: true,
  });
  if (typeof videoTrack?.requestFrame === 'function') videoTrack.requestFrame();

  await sleep(120);
  recorder.stop();
  await stopped;

  const blob = new Blob(chunks, { type: recorder.mimeType || chosenMimeType });
  const url = URL.createObjectURL(blob);

  return {
    blob,
    url,
    mimeType: blob.type || chosenMimeType,
    duration,
    fps,
    frameCount,
    hasAudio,
    metadata: {
      ...metadata,
      requestedAudioMux: Boolean(options.audioTrack || options.audioStream),
      muxStatus: hasAudio ? 'attached-to-mediarecorder-stream' : 'video-only',
    },
  };
}

