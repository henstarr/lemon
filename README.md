# LEMON

LEMON is an experimental AI-powered visualizer that creates trippy, music-driven visuals that "breathe" with your audio. It supports live and streamed inputs (Spotify, SoundCloud, Apple Music, or your microphone) and can generate short AI-assisted video outputs via the `backend/ai-video` services.

![Lemon visualizer screenshot](docs/lemon-screenshot.png)

What it is:

- **Audio-reactive visuals:** Stylized generative visuals driven by audio features.
- **Multiple sources:** Connect Spotify, SoundCloud, Apple Music, or use the microphone or demo mode.
- **AI-assisted generation:** Backend pipelines for composing frames and exporting short webm/video outputs.

Tech stack (high level):

- Frontend: React + Vite
- Backend: Node.js services in `backend/ai-video`

Quick start:

1. Install dependencies:

```
npm install
```

2. Run the app locally:

```
npm run dev
```

Screenshot note: the repository references `docs/lemon-screenshot.png` in the README. Add the screenshot image file at that path if you want it included in the repo.

For more details about the AI video backend and API, see `docs/ai-video-api.md` and `docs/ai-video-backend-local.md`.