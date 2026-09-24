import { describe, expect, it } from 'vitest';
import { CloudflareApiError } from './cloudflare';
import {
  verifyCloudflareResource,
  type InventoryReader,
} from './resource-verification';

function reader(
  answers: (refresh: boolean) => { resourceId: string; resourceName: string }[],
): InventoryReader {
  return async (_type, refresh) => answers(refresh);
}

describe('verifyCloudflareResource', () => {
  it('finds a resource by its stable id and reports Cloudflare’s label', async () => {
    const outcome = await verifyCloudflareResource(
      'd1',
      'uuid-1',
      reader(() => [{ resourceId: 'uuid-1', resourceName: 'ally-db' }]),
    );
    expect(outcome).toEqual({
      status: 'found',
      resourceId: 'uuid-1',
      resourceName: 'ally-db',
    });
  });

  it('re-reads fresh before calling something missing', async () => {
    const outcome = await verifyCloudflareResource(
      'worker',
      'new-worker',
      reader((refresh) =>
        refresh
          ? [{ resourceId: 'new-worker', resourceName: 'new-worker' }]
          : [],
      ),
    );
    expect(outcome.status).toBe('found');
  });

  it('says not-found only when the listing succeeded without it', async () => {
    expect(
      await verifyCloudflareResource(
        'r2',
        'gone',
        reader(() => []),
      ),
    ).toEqual({ status: 'not-found' });
  });

  it('says unverifiable, with the upstream status, when the listing is refused', async () => {
    const outcome = await verifyCloudflareResource('r2', 'assets', async () => {
      throw new CloudflareApiError('Insufficient permissions', 403);
    });
    expect(outcome).toEqual({
      status: 'unverifiable',
      reason: 'Insufficient permissions',
      httpStatus: 403,
    });
  });

  it('never mistakes an unexpected failure for success', async () => {
    const outcome = await verifyCloudflareResource('kv', 'id', async () => {
      throw new TypeError('boom');
    });
    expect(outcome.status).toBe('unverifiable');
  });
});
