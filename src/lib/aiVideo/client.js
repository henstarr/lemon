export function createAIVideoClient({ baseUrl } = {}) {
  const apiBase =
    baseUrl ||
    import.meta.env.VITE_AI_VIDEO_API_URL ||
    '';

  async function request(path, init = {}) {
    if (!apiBase) {
      throw new Error('AI video API is not configured. Set VITE_AI_VIDEO_API_URL to enable remote Wan2.1 jobs.');
    }
    const res = await fetch(`${apiBase}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      ...init,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error || body?.message || '';
      } catch {
        // ignore parse failure
      }
      throw new Error(detail || `AI video API request failed (${res.status}).`);
    }
    return res.json();
  }

  return {
    configured: Boolean(apiBase),
    baseUrl: apiBase,
    submitJob(payload) {
      return request('/api/ai-video/jobs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    getJob(jobId) {
      return request(`/api/ai-video/jobs/${encodeURIComponent(jobId)}`, {
        method: 'GET',
      });
    },
    cancelJob(jobId) {
      return request(`/api/ai-video/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
      });
    },
  };
}

