# AI Video API Contract (Wan2.1-Ready)

Frontend env:

```env
VITE_AI_VIDEO_API_URL=http://localhost:8787
```

Base path used by Lemon:

- `POST /api/ai-video/jobs`
- `GET /api/ai-video/jobs/:jobId`
- `POST /api/ai-video/jobs/:jobId/cancel`

## `POST /api/ai-video/jobs`

Request body (shape):

```json
{
  "provider": "wan2.1",
  "stylePresetId": "pulse-tunnel",
  "aspect": "16:9",
  "jobPlan": {
    "version": 1,
    "modelPreference": "wan2.1",
    "duration": 182.33,
    "estimatedBpm": 128.2,
    "stylePreset": { "id": "pulse-tunnel", "name": "Pulse Tunnel" },
    "trackSummary": { "fileName": "track.wav", "duration": 182.33, "bpm": 128.2, "beats": 386, "sections": 32 },
    "shotPlan": []
  },
  "fileMeta": {
    "name": "track.wav",
    "type": "audio/wav",
    "size": 12345678
  }
}
```

Response:

```json
{
  "jobId": "job_abc123",
  "status": "queued",
  "phase": "queued",
  "message": "Job queued"
}
```

## `GET /api/ai-video/jobs/:jobId`

In-progress response:

```json
{
  "jobId": "job_abc123",
  "status": "running",
  "phase": "synthesizing_sections",
  "percent": 44,
  "step": 3,
  "totalSteps": 6,
  "message": "Generating section 8/24"
}
```

Completed response:

```json
{
  "jobId": "job_abc123",
  "status": "completed",
  "phase": "complete",
  "percent": 100,
  "message": "Done",
  "fileName": "track-ai.webm",
  "mimeType": "video/webm",
  "artifactUrl": "https://cdn.example.com/jobs/job_abc123/output.webm",
  "manifest": {
    "provider": "wan2.1",
    "timelineSource": "lemon-job-plan-v1",
    "compositor": "ffmpeg+overlay-reactive",
    "output": { "duration": 182.33, "fps": 30, "width": 1920, "height": 1080 }
  }
}
```

Failed response:

```json
{
  "jobId": "job_abc123",
  "status": "failed",
  "phase": "failed",
  "error": "Wan2.1 worker timeout"
}
```

## `POST /api/ai-video/jobs/:jobId/cancel`

Response:

```json
{
  "jobId": "job_abc123",
  "status": "cancelled"
}
```

## Implementation Notes

- Lemon currently sends `jobPlan` + metadata only (not raw audio bytes) in this scaffolding.
- Production backend should accept audio upload (or signed upload URL) and map it to the `jobId`.
- Recommended backend pipeline:
  1. ingest/upload audio
  2. validate/optionally re-run analysis
  3. section clip generation (Wan2.1 / ComfyUI worker)
  4. deterministic composition + overlays
  5. ffmpeg audio mux
  6. artifact upload + status completion

