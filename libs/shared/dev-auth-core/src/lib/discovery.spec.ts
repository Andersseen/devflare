import { describe, it, expect, vi, afterEach } from 'vitest';
import { clearDiscoveryCache, discoverMetadata } from './discovery';
import { DiscoveryError } from './errors';

const ISSUER = 'https://auth.example.com';

afterEach(() => {
  clearDiscoveryCache();
});

function metadataResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/api/auth/oauth2/authorize`,
      token_endpoint: `${ISSUER}/api/auth/oauth2/token`,
      userinfo_endpoint: `${ISSUER}/api/auth/oauth2/userinfo`,
      end_session_endpoint: `${ISSUER}/api/auth/oauth2/end-session`,
      ...overrides,
    }),
  );
}

describe('discoverMetadata', () => {
  it('fetches and returns valid metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(metadataResponse());

    const metadata = await discoverMetadata(ISSUER, { fetch: fetchMock });

    expect(fetchMock).toHaveBeenCalledWith(
      `${ISSUER}/.well-known/openid-configuration`,
    );
    expect(metadata.authorization_endpoint).toBe(
      `${ISSUER}/api/auth/oauth2/authorize`,
    );
  });

  it('rejects a discovery document for a different issuer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        metadataResponse({ issuer: 'https://evil.example.com' }),
      );

    await expect(
      discoverMetadata(ISSUER, { fetch: fetchMock }),
    ).rejects.toBeInstanceOf(DiscoveryError);
  });

  it('falls back to the conventional layout when discovery is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));

    const metadata = await discoverMetadata(ISSUER, { fetch: fetchMock });

    expect(metadata.authorization_endpoint).toBe(
      `${ISSUER}/api/auth/oauth2/authorize`,
    );
    expect(metadata.token_endpoint).toBe(`${ISSUER}/api/auth/oauth2/token`);
  });

  it('falls back to the conventional layout on a non-ok response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('not found', { status: 404 }));

    const metadata = await discoverMetadata(ISSUER, { fetch: fetchMock });

    expect(metadata.userinfo_endpoint).toBe(
      `${ISSUER}/api/auth/oauth2/userinfo`,
    );
  });

  it('caches a successful result — a second call does not refetch within the TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(metadataResponse());

    await discoverMetadata(ISSUER, { fetch: fetchMock, ttlMs: 60_000 });
    await discoverMetadata(ISSUER, { fetch: fetchMock, ttlMs: 60_000 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache forever — a later call outside the TTL refetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(metadataResponse());

    await discoverMetadata(ISSUER, { fetch: fetchMock, ttlMs: -1 });
    await discoverMetadata(ISSUER, { fetch: fetchMock, ttlMs: -1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
