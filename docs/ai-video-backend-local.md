# AI Video Backend (Local Run)

This repo now includes a local backend service that implements Lemon's AI video job API:

- `POST /api/ai-video/jobs`
- `GET /api/ai-video/jobs/:id`
- `POST /api/ai-video/jobs/:id/cancel`

It supports:

- `mock` mode (default): in-memory progress + local placeholder artifact files
- `comfyui` mode: Wan2.1/ComfyUI adapter path enabled by env vars
- `auto` mode: uses ComfyUI if configured, otherwise falls back to mock

## 1. Frontend env (Lemon)

Point the frontend to the local backend:

```env
VITE_AI_VIDEO_API_URL=http://localhost:8787
```

## 2. Start the backend

```bash
npm install
npm run dev:ai-video
```

Default port: `8787`

Health check:

```bash
curl http://localhost:8787/api/ai-video/health
```

## 3. Local mock mode (default)

No extra env is required.

Behavior:

- accepts Lemon's current frontend payload (`provider`, `stylePresetId`, `aspect`, `jobPlan`, `fileMeta`)
- tracks job status/progress in memory
- writes placeholder artifacts under your OS temp dir (`.../lemon-ai-video-artifacts/<jobId>/`)
- serves artifact URLs from `http://localhost:8787/api/ai-video/artifacts/...`

Useful env vars:

```env
AI_VIDEO_PORT=8787
AI_VIDEO_BACKEND_MODE=mock
AI_VIDEO_PUBLIC_BASE_URL=http://localhost:8787
AI_VIDEO_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AI_VIDEO_MOCK_STEP_DELAY_MS=700
```

## 4. ComfyUI (Wan2.1 adapter path)

Set the backend to `comfyui` or `auto` and provide a ComfyUI base URL plus a workflow template.

```env
AI_VIDEO_BACKEND_MODE=auto
AI_VIDEO_COMFYUI_BASE_URL=http://127.0.0.1:8188
AI_VIDEO_COMFYUI_WORKFLOW_FILE=/absolute/path/to/comfyui-wan-workflow.json
# or:
# AI_VIDEO_COMFYUI_WORKFLOW_JSON={...}
```

### Workflow template token interpolation

The adapter loads the workflow JSON and replaces string tokens like:

- `{{LEMON_JOB_ID}}`
- `{{LEMON_STYLE_PRESET_ID}}`
- `{{LEMON_ASPECT}}`
- `{{LEMON_FILE_NAME}}`
- `{{LEMON_DURATION_SECONDS}}`
- `{{LEMON_SHOT_COUNT}}`

This lets you keep one ComfyUI workflow template and inject Lemon metadata at runtime.

### Additional ComfyUI env vars (optional)

```env
AI_VIDEO_COMFYUI_POLL_INTERVAL_MS=1500
AI_VIDEO_COMFYUI_REQUEST_TIMEOUT_MS=15000
AI_VIDEO_COMFYUI_CLIENT_ID=lemon-dev
```

Notes:

- The backend submits to ComfyUI `/prompt`, polls `/history/:prompt_id`, and downloads the first output via `/view`.
- Cancellation sends a best-effort `/interrupt` request.
- Your ComfyUI workflow must already be valid for your Wan2.1 setup (model nodes/checkpoints/etc.).

## 5. API smoke test (curl)

```bash
curl -X POST http://localhost:8787/api/ai-video/jobs \
  -H 'Content-Type: application/json' \
  --data '{
    "provider":"wan2.1",
    "stylePresetId":"pulse-tunnel",
    "aspect":"16:9",
    "jobPlan":{"version":1,"duration":12.3,"estimatedBpm":128,"shotPlan":[]},
    "fileMeta":{"name":"track.wav","type":"audio/wav","size":1234}
  }'
```

Poll status:

```bash
curl http://localhost:8787/api/ai-video/jobs/<jobId>
```

Cancel:

```bash
curl -X POST http://localhost:8787/api/ai-video/jobs/<jobId>/cancel
```
