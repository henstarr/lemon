import { createAIVideoApp } from './app.js';

const { app, config } = await createAIVideoApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[ai-video-api] listening on ${config.publicBaseUrl} (mode=${config.mode})`);
});
