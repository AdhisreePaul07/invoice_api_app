import { extractApiError } from './api-error.util';

describe('extractApiError', () => {
  it('returns the fallback for HTML error payloads', () => {
    const error = {
      error: '<!DOCTYPE html><html><head><title>Server Error</title></head><body>traceback</body></html>',
    };

    expect(extractApiError(error, 'Fallback message')).toBe('Fallback message');
  });

  it('returns nested API messages for JSON responses', () => {
    const error = {
      error: {
        detail: ['Readable message'],
      },
    };

    expect(extractApiError(error, 'Fallback message')).toBe('Readable message');
  });
});
