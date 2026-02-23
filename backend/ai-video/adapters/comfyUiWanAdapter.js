import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ensureDir, inferMimeType, interpolateTemplate, safeBaseName, sleep, writeJson } from '../utils/common.js';

let workflowCache = new Map();
let objectInfoCache = new Map();

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);

  function forwardAbort() {
    controller.abort(new Error('Aborted'));
  }

  if (signal) {
    if (signal.aborted) forwardAbort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', forwardAbort);
    },
  };
}

async function fetchJson(url, { method = 'GET', body, signal, timeoutMs = 15000 } = {}) {
  const { signal: requestSignal, cleanup } = withTimeout(signal, timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: requestSignal,
      });
    } catch (err) {
      throw new Error(
        `Network request to ComfyUI failed (${method} ${url}): ${err?.message || 'fetch failed'}. Check AI_VIDEO_COMFYUI_BASE_URL and ensure ComfyUI is running.`,
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        const summary = parsed?.error?.message || parsed?.error?.type || '';
        const nodeLines = [];
        for (const [nodeId, nodeInfo] of Object.entries(parsed?.node_errors || {})) {
          for (const err of nodeInfo?.errors || []) {
            if (err?.details) {
              nodeLines.push(`node ${nodeId} (${nodeInfo.class_type}): ${err.details}`);
            }
          }
        }
        detail = [summary, ...nodeLines].filter(Boolean).join('; ');
      } catch {
        // leave raw text
      }
      throw new Error(`ComfyUI request failed (${res.status}) ${detail}`.trim());
    }
    return res.json();
  } finally {
    cleanup();
  }
}

async function fetchBuffer(url, { signal, timeoutMs = 15000 } = {}) {
  const { signal: requestSignal, cleanup } = withTimeout(signal, timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, { signal: requestSignal });
    } catch (err) {
      throw new Error(
        `Network download from ComfyUI failed (GET ${url}): ${err?.message || 'fetch failed'}. Check ComfyUI availability and output settings.`,
      );
    }
    if (!res.ok) {
      throw new Error(`ComfyUI artifact download failed (${res.status})`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } finally {
    cleanup();
  }
}

function buildTokens(job) {
  const fileMeta = job.request?.fileMeta || {};
  const jobPlan = job.request?.jobPlan || {};
  return {
    LEMON_JOB_ID: job.id,
    LEMON_STYLE_PRESET_ID: job.request?.stylePresetId || '',
    LEMON_ASPECT: job.request?.aspect || '',
    LEMON_FILE_NAME: fileMeta.name || '',
    LEMON_FILE_TYPE: fileMeta.type || '',
    LEMON_FILE_SIZE: fileMeta.size || '',
    LEMON_DURATION_SECONDS: jobPlan.duration || '',
    LEMON_ESTIMATED_BPM: jobPlan.estimatedBpm || '',
    LEMON_SHOT_COUNT: Array.isArray(jobPlan.shotPlan) ? jobPlan.shotPlan.length : '',
    LEMON_PROVIDER: job.runtime.provider,
  };
}

function resolveWorkflowSource({ comfyuiConfig, job }) {
  const jobOverride = job?.request?.comfyui?.workflowJson ?? job?.request?.workflowJson ?? null;
  if (jobOverride) {
    if (typeof jobOverride === 'string') return { workflowJson: jobOverride, workflowFile: '' };
    return { workflowJson: JSON.stringify(jobOverride), workflowFile: '' };
  }
  return {
    workflowJson: comfyuiConfig.workflowJson,
    workflowFile: comfyuiConfig.workflowFile,
  };
}

async function loadWorkflowTemplate(comfyuiConfig, job) {
  const source = resolveWorkflowSource({ comfyuiConfig, job });
  const cacheKey = `${source.workflowFile}::${source.workflowJson?.slice?.(0, 128) || source.workflowJson}`;
  if (workflowCache.has(cacheKey)) return workflowCache.get(cacheKey);

  let raw;
  if (source.workflowJson) {
    raw = source.workflowJson;
  } else if (source.workflowFile) {
    raw = await fs.readFile(source.workflowFile, 'utf8');
  } else {
    throw new Error('ComfyUI adapter requires AI_VIDEO_COMFYUI_WORKFLOW_FILE or AI_VIDEO_COMFYUI_WORKFLOW_JSON');
  }

  const parsed = JSON.parse(raw);
  workflowCache.set(cacheKey, parsed);
  return parsed;
}

async function getNodeObjectInfo(config, classType, signal) {
  const key = `${config.baseUrl}::${classType}`;
  if (objectInfoCache.has(key)) return objectInfoCache.get(key);
  const payload = await fetchJson(`${config.baseUrl}/object_info/${encodeURIComponent(classType)}`, {
    signal,
    timeoutMs: config.requestTimeoutMs,
  });
  const info = payload?.[classType] || null;
  objectInfoCache.set(key, info);
  return info;
}

function isUiWorkflowJson(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.nodes) && Array.isArray(value.links));
}

function buildLinkLookup(uiWorkflow) {
  const map = new Map();
  for (const link of uiWorkflow.links || []) {
    if (!Array.isArray(link) || link.length < 6) continue;
    const [linkId, fromNodeId, fromSlotIndex, toNodeId, toInputIndex] = link;
    map.set(linkId, {
      fromNodeId,
      fromSlotIndex,
      toNodeId,
      toInputIndex,
    });
  }
  return map;
}

function normalizeWidgetValuesForClass(classType, values) {
  if (!Array.isArray(values)) return [];
  if ((classType === 'KSampler' || classType === 'KSamplerAdvanced') && values.length >= 2) {
    const second = values[1];
    if (typeof second === 'string' && ['fixed', 'increment', 'decrement', 'randomize'].includes(second)) {
      return [values[0], ...values.slice(2)];
    }
  }
  return values;
}

function assignWidgetInputs(node, objectInfo, inputs) {
  const values = normalizeWidgetValuesForClass(
    String(node?.type || ''),
    Array.isArray(node.widgets_values) ? node.widgets_values : [],
  );
  if (!values.length || !objectInfo) return;

  const requiredOrder = Array.isArray(objectInfo?.input_order?.required) ? objectInfo.input_order.required : [];
  const optionalOrder = Array.isArray(objectInfo?.input_order?.optional) ? objectInfo.input_order.optional : [];
  const orderedInputNames = [...requiredOrder, ...optionalOrder];
  const widgetInputNames = orderedInputNames.filter((name) => !(name in inputs));

  let widgetIndex = 0;
  for (const inputName of widgetInputNames) {
    if (widgetIndex >= values.length) break;
    inputs[inputName] = values[widgetIndex];
    widgetIndex += 1;
  }
}

function maybePatchCommonLocalInputs(promptNode) {
  if (promptNode.class_type === 'LoadImage' && typeof promptNode.inputs?.image === 'string') {
    // Use ComfyUI's built-in sample image when the imported UI workflow references a local file
    // that likely does not exist on this machine.
    const fileName = promptNode.inputs.image;
    if (!fileName || /\bphoto_20\d{2}/i.test(fileName)) {
      promptNode.inputs.image = 'example.png';
    }
  }
}

async function convertUiWorkflowToPrompt(uiWorkflow, comfyuiConfig, signal) {
  const linkLookup = buildLinkLookup(uiWorkflow);
  const prompt = {};
  const nodes = Array.isArray(uiWorkflow.nodes) ? [...uiWorkflow.nodes] : [];
  nodes.sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));

  for (const node of nodes) {
    if (!node || typeof node !== 'object' || node.id == null || !node.type) continue;
    const classType = String(node.type);
    const objectInfo = await getNodeObjectInfo(comfyuiConfig, classType, signal).catch(() => null);
    const inputs = {};

    for (const inputDef of node.inputs || []) {
      if (!inputDef || inputDef.link == null) continue;
      const link = linkLookup.get(inputDef.link);
      if (!link) continue;
      inputs[inputDef.name] = [String(link.fromNodeId), Number(link.fromSlotIndex ?? 0)];
    }

    assignWidgetInputs(node, objectInfo, inputs);

    const promptNode = {
      inputs,
      class_type: classType,
    };
    if (node.title) {
      promptNode._meta = { title: String(node.title) };
    }
    maybePatchCommonLocalInputs(promptNode);
    prompt[String(node.id)] = promptNode;
  }

  return prompt;
}

function extractOutputCandidate(historyEntry) {
  const outputs = historyEntry?.outputs || {};
  const files = [];
  for (const nodeOutput of Object.values(outputs)) {
    const groups = ['videos', 'images', 'gifs'];
    for (const group of groups) {
      const list = nodeOutput?.[group];
      if (!Array.isArray(list)) continue;
      for (const item of list) files.push(item);
    }
  }
  return files[0] || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashStringSeed(input) {
  const str = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0) + 1;
}

function promptNodeEntries(prompt) {
  return Object.entries(prompt || {}).filter(([, node]) => node && typeof node === 'object');
}

function findPromptNodesByClass(prompt, classNames) {
  const wanted = new Set(Array.isArray(classNames) ? classNames : [classNames]);
  return promptNodeEntries(prompt).filter(([, node]) => wanted.has(node.class_type));
}

function patchSaveNodeFilename(prompt, filePrefix) {
  const saveNodes = findPromptNodesByClass(prompt, ['SaveAnimatedWEBP', 'SaveImage', 'VHS_VideoCombine']);
  for (const [, node] of saveNodes) {
    if (!node.inputs) node.inputs = {};
    if ('filename_prefix' in node.inputs || node.class_type === 'SaveAnimatedWEBP' || node.class_type === 'SaveImage') {
      node.inputs.filename_prefix = filePrefix;
    }
  }
}

function patchTextPromptsIfPresent(prompt, shot) {
  const textNodes = findPromptNodesByClass(prompt, ['CLIPTextEncode']);
  if (!textNodes.length) return;
  let assignedPositive = false;
  let assignedNegative = false;
  for (const [, node] of textNodes) {
    if (!node.inputs) node.inputs = {};
    const current = String(node.inputs.text ?? '').toLowerCase();
    const looksNegative = current.includes('negative') || current.includes('bad') || current.includes('worst');
    if (looksNegative && !assignedNegative && shot.negativePrompt) {
      node.inputs.text = shot.negativePrompt;
      assignedNegative = true;
      continue;
    }
    if (!assignedPositive && shot.prompt) {
      node.inputs.text = shot.prompt;
      assignedPositive = true;
      continue;
    }
    if (!assignedNegative && shot.negativePrompt) {
      node.inputs.text = shot.negativePrompt;
      assignedNegative = true;
    }
  }
}

function patchSvdShotControls(prompt, shot, shotIndex, totalShots, job) {
  const intensity = clamp(Number(shot?.intensity ?? 0.5), 0, 1);
  const durationSec = clamp(Number(shot?.duration ?? 2.5), 0.5, 8);
  const beatCount = Math.max(0, Number(shot?.beatCount ?? 0));
  const baseSeed = hashStringSeed(`${job.id}:${shot.id || shotIndex}:${job.request?.fileMeta?.name || ''}`);

  const svdNodes = findPromptNodesByClass(prompt, ['SVD_img2vid_Conditioning']);
  for (const [, node] of svdNodes) {
    if (!node.inputs) node.inputs = {};
    const fps = clamp(Math.round(6 + intensity * 10), 6, 16);
    const framesFromDuration = Math.round(durationSec * fps);
    node.inputs.fps = fps;
    node.inputs.video_frames = clamp(framesFromDuration, 8, 48);
    node.inputs.motion_bucket_id = clamp(Math.round(90 + intensity * 130 + Math.min(beatCount, 24)), 32, 255);
    node.inputs.augmentation_level = Number((0.02 + intensity * 0.12).toFixed(2));
  }

  const samplerNodes = findPromptNodesByClass(prompt, ['KSampler', 'KSamplerAdvanced']);
  for (const [, node] of samplerNodes) {
    if (!node.inputs) node.inputs = {};
    node.inputs.noise_seed = baseSeed + shotIndex * 97;
    if ('seed' in node.inputs || node.class_type === 'KSampler') {
      node.inputs.seed = baseSeed + shotIndex * 97;
    }
    if ('steps' in node.inputs) {
      node.inputs.steps = clamp(Math.round(14 + intensity * 16), 12, 32);
    }
    if ('cfg' in node.inputs) {
      node.inputs.cfg = Number((2.0 + intensity * 2.2).toFixed(2));
    }
    if ('sampler_name' in node.inputs) {
      node.inputs.sampler_name = 'euler';
    }
    if ('scheduler' in node.inputs) {
      node.inputs.scheduler = 'karras';
    }
    if ('denoise' in node.inputs) {
      node.inputs.denoise = Number((0.75 + intensity * 0.2).toFixed(2));
    }
  }

  patchTextPromptsIfPresent(prompt, shot);
  patchSaveNodeFilename(
    prompt,
    `${safeBaseName(job.request?.fileMeta?.name || 'lemon-ai')}_${String(shotIndex + 1).padStart(2, '0')}-of-${totalShots}`,
  );
}

async function waitForComfyOutput({ promptId, config, signal, onProgress, progressBase = 25, progressMax = 88, progressLabel = 'Polling ComfyUI history' }) {
  let pollCount = 0;
  while (true) {
    if (signal?.aborted) {
      try {
        await fetchJson(`${config.comfyui.baseUrl}${config.comfyui.interruptEndpoint}`, {
          method: 'POST',
          body: {},
          timeoutMs: 3000,
        });
      } catch {
        // best effort
      }
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    pollCount += 1;
    onProgress?.({
      status: 'running',
      phase: 'waiting_for_comfyui',
      message: `${progressLabel} (${pollCount})`,
      step: 3,
      totalSteps: 5,
      percent: Math.min(progressMax, progressBase + pollCount * 5),
    });

    const historyRes = await fetchJson(
      `${config.comfyui.baseUrl}${config.comfyui.historyEndpointPrefix}/${encodeURIComponent(promptId)}`,
      { signal, timeoutMs: config.comfyui.requestTimeoutMs },
    );
    const historyEntry = historyRes?.[promptId] || historyRes?.[String(promptId)] || historyRes;
    if (historyEntry?.status?.status_str === 'error') {
      const errMsg = historyEntry?.status?.messages?.map?.((m) => m?.[1]?.message).filter(Boolean).join('; ');
      throw new Error(errMsg || 'ComfyUI execution failed');
    }
    const candidate = extractOutputCandidate(historyEntry);
    if (candidate?.filename) {
      return { historyEntry, candidate };
    }
    await sleep(config.comfyui.pollIntervalMs, signal);
  }
}

async function submitPromptToComfy({ prompt, config, signal, job, extraData }) {
  const promptRes = await fetchJson(`${config.comfyui.baseUrl}${config.comfyui.promptEndpoint}`, {
    method: 'POST',
    body: {
      prompt,
      client_id: config.comfyui.clientId,
      extra_data: {
        lemon_job_id: job.id,
        ...(extraData || {}),
      },
    },
    signal,
    timeoutMs: config.comfyui.requestTimeoutMs,
  });
  const promptId = promptRes?.prompt_id || promptRes?.promptId;
  if (!promptId) throw new Error('ComfyUI did not return prompt_id');
  return String(promptId);
}

async function downloadComfyCandidate({ candidate, config, signal }) {
  const params = new URLSearchParams({ filename: String(candidate.filename) });
  if (candidate.subfolder) params.set('subfolder', String(candidate.subfolder));
  if (candidate.type) params.set('type', String(candidate.type));
  const downloadUrl = `${config.comfyui.baseUrl}${config.comfyui.viewEndpoint}?${params.toString()}`;
  const buffer = await fetchBuffer(downloadUrl, { signal, timeoutMs: config.comfyui.requestTimeoutMs });
  return { buffer, downloadUrl };
}

function hasFfmpeg() {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function runChild(cmd, args, { cwd, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const abort = () => {
      try { child.kill('SIGTERM'); } catch { /* noop */ }
    };
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    child.on('error', (err) => reject(err));
    child.on('exit', (code) => {
      signal?.removeEventListener?.('abort', abort);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

async function concatAnimatedClipsWithFfmpeg({ clipPaths, outputPath, signal }) {
  const tempDir = path.join(path.dirname(outputPath), '.ffmpeg-stage');
  await ensureDir(tempDir);
  const staged = [];
  for (let i = 0; i < clipPaths.length; i += 1) {
    const input = clipPaths[i];
    const stagedPath = path.join(tempDir, `clip-${String(i + 1).padStart(3, '0')}.webm`);
    await runChild('ffmpeg', ['-y', '-i', input, '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', stagedPath], { signal });
    staged.push(stagedPath);
  }
  const listPath = path.join(tempDir, 'concat.txt');
  const listBody = staged.map((p) => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n') + '\n';
  await fs.writeFile(listPath, listBody, 'utf8');
  await runChild('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath], { signal });
}

export function isComfyUiConfigured(config) {
  return Boolean(config.comfyui.baseUrl && (config.comfyui.workflowFile || config.comfyui.workflowJson));
}

export function isComfyUiConfiguredForJob(config, jobOrPayload) {
  const jobRequest = jobOrPayload?.request || jobOrPayload || {};
  const hasWorkflowOverride = Boolean(jobRequest?.comfyui?.workflowJson || jobRequest?.workflowJson);
  return Boolean(config.comfyui.baseUrl && (hasWorkflowOverride || config.comfyui.workflowFile || config.comfyui.workflowJson));
}

export async function runComfyUiWanPipeline({ job, config, signal, onProgress }) {
  if (!isComfyUiConfiguredForJob(config, job)) {
    throw new Error('ComfyUI adapter is not configured. Set AI_VIDEO_COMFYUI_BASE_URL and workflow env vars.');
  }

  onProgress({
    status: 'running',
    phase: 'preparing_comfyui_workflow',
    message: 'Loading ComfyUI workflow template',
    step: 1,
    totalSteps: 5,
    percent: 8,
  });

  const workflowTemplate = await loadWorkflowTemplate(config.comfyui, job);
  const normalizedWorkflow = isUiWorkflowJson(workflowTemplate)
    ? await convertUiWorkflowToPrompt(workflowTemplate, config.comfyui, signal)
    : workflowTemplate;
  const artifactDir = path.join(config.artifactRoot, job.id);
  await ensureDir(artifactDir);
  const fileBase = safeBaseName(job.request?.fileMeta?.name || 'lemon-ai-video');
  const requestedShots = Array.isArray(job.request?.jobPlan?.shotPlan) ? job.request.jobPlan.shotPlan : [];
  const shotPlan = requestedShots.length ? requestedShots : [{ id: 'shot-01', duration: 4, intensity: 0.5, beatCount: 0 }];
  const maxShots = clamp(Number(process.env.AI_VIDEO_COMFYUI_MAX_SHOTS || 6), 1, 64);
  const selectedShots = shotPlan.slice(0, maxShots);
  const shotArtifacts = [];

  for (let shotIndex = 0; shotIndex < selectedShots.length; shotIndex += 1) {
    const shot = selectedShots[shotIndex];
    const shotPrompt = interpolateTemplate(structuredClone(normalizedWorkflow), buildTokens(job));
    patchSvdShotControls(shotPrompt, shot, shotIndex, selectedShots.length, job);

    onProgress({
      status: 'running',
      phase: 'submitting_to_comfyui',
      message: `Submitting shot ${shotIndex + 1}/${selectedShots.length} to ComfyUI`,
      step: 2,
      totalSteps: 5,
      percent: Math.round(8 + ((shotIndex + 0.05) / selectedShots.length) * 70),
    });

    const promptId = await submitPromptToComfy({
      prompt: shotPrompt,
      config,
      signal,
      job,
      extraData: { lemon_shot_id: shot.id || `shot-${shotIndex + 1}` },
    });
    job.runtime.remotePromptId = promptId;

    const { candidate } = await waitForComfyOutput({
      promptId,
      config,
      signal,
      onProgress: (patch) => {
        const base = 15 + Math.round((shotIndex / selectedShots.length) * 68);
        const span = Math.max(6, Math.round(68 / selectedShots.length));
        const scaledPercent = clamp(base + Math.round(((patch.percent ?? 50) / 100) * span), 15, 92);
        onProgress({
          ...patch,
          message: `Shot ${shotIndex + 1}/${selectedShots.length} • ${patch.message}`,
          percent: scaledPercent,
        });
      },
      progressLabel: `Polling ComfyUI history for shot ${shotIndex + 1}/${selectedShots.length}`,
    });

    onProgress({
      status: 'running',
      phase: 'downloading_artifact',
      message: `Downloading clip ${shotIndex + 1}/${selectedShots.length}`,
      step: 4,
      totalSteps: 5,
      percent: clamp(80 + Math.round(((shotIndex + 1) / selectedShots.length) * 14), 82, 96),
    });

    const { buffer } = await downloadComfyCandidate({ candidate, config, signal });
    const sourceName = String(candidate.filename);
    const ext = path.extname(sourceName) || '.webp';
    const clipFileName = `${fileBase}-shot-${String(shotIndex + 1).padStart(2, '0')}${ext}`;
    const clipPath = path.join(artifactDir, clipFileName);
    await fs.writeFile(clipPath, buffer);
    shotArtifacts.push({
      shotId: shot.id || `shot-${shotIndex + 1}`,
      shotIndex,
      promptId,
      sourceFilename: sourceName,
      fileName: clipFileName,
      artifactPath: clipPath,
      artifactRelativePath: path.relative(config.artifactRoot, clipPath),
      mimeType: inferMimeType(clipFileName),
      duration: shot.duration ?? null,
      intensity: shot.intensity ?? null,
      beatCount: shot.beatCount ?? null,
      sceneHint: shot.sceneHint ?? null,
    });
  }

  let finalArtifact = shotArtifacts[0];
  let concatInfo = null;
  if (shotArtifacts.length > 1) {
    const ffmpegAvailable = await hasFfmpeg();
    if (ffmpegAvailable) {
      onProgress({
        status: 'running',
        phase: 'finalizing',
        message: `Concatenating ${shotArtifacts.length} clips into one video`,
        step: 5,
        totalSteps: 5,
        percent: 96,
      });
      const outputFileName = `${fileBase}-ai.webm`;
      const outputPath = path.join(artifactDir, outputFileName);
      await concatAnimatedClipsWithFfmpeg({
        clipPaths: shotArtifacts.map((c) => c.artifactPath),
        outputPath,
        signal,
      });
      finalArtifact = {
        fileName: outputFileName,
        artifactPath: outputPath,
        artifactRelativePath: path.relative(config.artifactRoot, outputPath),
        mimeType: inferMimeType(outputFileName),
      };
      concatInfo = { ffmpeg: true, combinedClips: shotArtifacts.length };
    } else {
      concatInfo = { ffmpeg: false, reason: 'ffmpeg not installed', combinedClips: 0 };
    }
  }

  const manifest = {
    provider: job.runtime.provider,
    mode: 'comfyui',
    timelineSource: 'lemon-job-plan-v1',
    audioDriven: true,
    comfyui: {
      baseUrl: config.comfyui.baseUrl,
      promptIds: shotArtifacts.map((s) => s.promptId),
      outputCount: shotArtifacts.length,
    },
    renderStrategy: {
      selectedShots: selectedShots.length,
      totalShotPlan: shotPlan.length,
      maxShots,
      concat: concatInfo,
    },
    shotArtifacts: shotArtifacts.map((s) => ({
      shotId: s.shotId,
      shotIndex: s.shotIndex,
      fileName: s.fileName,
      mimeType: s.mimeType,
      duration: s.duration,
      intensity: s.intensity,
      beatCount: s.beatCount,
      sceneHint: s.sceneHint,
    })),
    requestEcho: {
      stylePresetId: job.request?.stylePresetId || null,
      aspect: job.request?.aspect || null,
      fileMeta: job.request?.fileMeta || null,
    },
  };
  await writeJson(path.join(artifactDir, 'manifest.json'), manifest);

  onProgress({
    status: 'running',
    phase: 'finalizing',
    message: shotArtifacts.length > 1
      ? `Finalized ${shotArtifacts.length} audio-driven AI clips${concatInfo?.ffmpeg ? ' and combined output' : ''}`
      : 'Finalizing job metadata',
    step: 5,
    totalSteps: 5,
    percent: 98,
  });

  return {
    provider: job.runtime.provider,
    fileName: finalArtifact.fileName,
    mimeType: finalArtifact.mimeType,
    artifactPath: finalArtifact.artifactPath,
    artifactRelativePath: finalArtifact.artifactRelativePath,
    manifest,
  };
}

export default runComfyUiWanPipeline;
