import { describe, expect, it } from 'vitest';
import app from './index';

describe('cloudflare-connect health endpoint', () => {
  it('reports ok with no bindings configured', async () => {
    const res = await app.request('/health', {}, { ENVIRONMENT: 'test' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'ok',
      service: 'cloudflare-connect',
      environment: 'test',
    });
  });

  it('404s on an unknown route rather than exposing anything', async () => {
    const res = await app.request('/oauth/authorize');

    expect(res.status).toBe(404);
  });
});
