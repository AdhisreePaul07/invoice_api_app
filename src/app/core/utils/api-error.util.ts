function isHtmlLike(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<html') ||
    normalized.includes('<head>') ||
    normalized.includes('<body')
  );
}

function sanitizeMessage(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (isHtmlLike(text)) return null;
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

function firstMessage(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstMessage(item);
      if (message) return message;
    }
    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    for (const key of ['message', 'detail', 'error', 'non_field_errors']) {
      const message = firstMessage(record[key]);
      if (message) return message;
    }

    for (const nested of Object.values(record)) {
      const message = firstMessage(nested);
      if (message) return message;
    }

    return null;
  }

  return sanitizeMessage(String(value));
}

export function extractApiError(error: unknown, fallback = 'Something went wrong.'): string {
  const response = (error as { error?: unknown; message?: unknown } | null | undefined) || undefined;
  const body = response?.error;

  return firstMessage(body) || firstMessage(response?.message) || fallback;
}
