export const SERVICES = [
  {
    id: 'file',
    name: 'Audio File',
    icon: '📁',
    color: '#f4d83d',
    description: 'Use a local MP3 or WAV file',
    note: 'MP3 and WAV only',
    authType: 'file',
  },
];

export const SERVICE_MAP = Object.fromEntries(SERVICES.map((svc) => [svc.id, svc]));

export const OAUTH_SERVICES = new Set();
export const AUTH_REQUIRED_SERVICES = new Set();

export function isOAuthService(serviceId) {
  return OAUTH_SERVICES.has(serviceId);
}

export function serviceRequiresAuth(serviceId) {
  return AUTH_REQUIRED_SERVICES.has(serviceId);
}

export function isAppleMusicService(serviceId) {
  return false;
}

export function isLocalFileService(serviceId) {
  return serviceId === 'file';
}

export function getServiceClientId(serviceId) {
  return '';
}

export function hasOAuthClientConfigured(serviceId) {
  const clientId = getServiceClientId(serviceId);
  return Boolean(clientId) && !clientId.startsWith('YOUR_');
}

export function getAppleMusicDeveloperToken() {
  return '';
}

export function hasAppleMusicConfigured() {
  return false;
}

export function getAppleMusicAppConfig() {
  return {
    name: 'Lemon',
    build: '1.0.0',
  };
}

export function buildAuthUrl(serviceId) {
  return null;
}
