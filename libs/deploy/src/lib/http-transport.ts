/**
 * The deploy transport, over DevFlare's own API.
 *
 * Every call is same-origin: the browser never talks to api.cloudflare.com and
 * never holds a credential of any kind. It lives here rather than in `@org/core`
 * because Nx's boundary rules stop a `scope:shared` library from importing a
 * `scope:frontend` one, and `DeployTransport` is defined here.
 */

import type {
  DeploymentResult,
  DeployTransport,
  PublishRequest,
  UploadAsset,
} from './deploy-client';

const BASE = '/api/v1/cloud/pages';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // Cloudflare's own wording names the missing token scope, so it is shown
    // rather than replaced with something generic — the same choice
    // cloudflare-account.service.ts makes.
    throw new Error(
      payload?.data?.error ??
        payload?.statusMessage ??
        payload?.error ??
        `Request failed with ${response.status}`,
    );
  }

  return payload as T;
}

export function createHttpTransport(): DeployTransport {
  const url = (project: string, step: string) =>
    `${BASE}/${encodeURIComponent(project)}/upload/${step}`;

  return {
    async checkMissing(project: string, hashes: string[]) {
      const result = await post<{ missing: string[] }>(url(project, 'check'), {
        hashes,
      });
      return result.missing;
    },

    async uploadBucket(project: string, assets: UploadAsset[]) {
      await post(url(project, 'assets'), { assets });
    },

    async publish(project: string, body: PublishRequest) {
      const result = await post<{
        deployment: DeploymentResult;
        recorded: boolean;
      }>(url(project, 'publish'), body);

      return { ...result.deployment, recorded: result.recorded };
    },
  };
}
