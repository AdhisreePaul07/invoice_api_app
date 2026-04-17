export function isBrowserStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function readJsonStorage<T>(key: string, fallback: T): T {
  if (!isBrowserStorageAvailable()) return fallback;

  const raw = localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonStorage(key: string, value: unknown): void {
  if (!isBrowserStorageAvailable()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function readStorageValue(key: string, fallback = ''): string {
  if (!isBrowserStorageAvailable()) return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function writeStorageValue(key: string, value: string): void {
  if (!isBrowserStorageAvailable()) return;
  localStorage.setItem(key, value);
}
