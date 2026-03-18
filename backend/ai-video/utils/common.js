import fs from 'node:fs/promises';
import path from 'node:path';

export function sleep(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function onAbort() {
      cleanup();
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    }

    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    }

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function safeBaseName(input, fallback = 'artifact') {
  const raw = String(input || fallback);
  const stripped = raw.replace(/\.[^.]+$/, '');
  const cleaned = stripped.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function inferMimeType(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

export function interpolateTemplate(value, tokens) {
  if (Array.isArray(value)) return value.map((item) => interpolateTemplate(item, tokens));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, interpolateTemplate(v, tokens)]),
    );
  }
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_m, key) => {
      const replacement = tokens[key];
      return replacement == null ? '' : String(replacement);
    });
  }
  return value;
}
