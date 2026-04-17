const LIVE_API_BASE_URL = 'https://then-twila-abhinava-innovations-a1707100.koyeb.app';

const resolveLocalApiBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'http://localhost:8000';
  }

  const hostname = window.location.hostname || 'localhost';
  const normalizedHostname =
    hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;

  return `http://${normalizedHostname}:8000`;
};

const readApiBaseUrlOverride = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem('invoice_api_base_url')?.trim() || null;
  } catch {
    return null;
  }
};

const resolveDevApiBaseUrl = (): string => {
  const override = readApiBaseUrlOverride();

  if (override === 'local') {
    return resolveLocalApiBaseUrl();
  }

  if (override && /^https?:\/\//i.test(override)) {
    return override.replace(/\/+$/, '');
  }

  return LIVE_API_BASE_URL;
};

export const environment = {
  production: false,
  apiBaseUrl: resolveDevApiBaseUrl(),
  apiKey: 'VVeiOx6rQ1Ri48Zc63xJ6m226GjavH6uX1Ni2m36',
};
