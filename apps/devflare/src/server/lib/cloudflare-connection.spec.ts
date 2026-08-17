import { describe, it, expect } from 'vitest';
import {
  EARLY_REFRESH_MS,
  expiresAtFrom,
  isExpiring,
  needsReconnect,
  toConnection,
  type ConnectionRow,
} from './cloudflare-connection';

/**
 * The decisions that do not need a database: when to renew, when to give up and
 * ask for a new consent, and what the browser is told about a connection.
 *
 * These are the ones with teeth. Renewing too late means a token that expires
 * mid-upload; treating a revoked grant as retryable means a Cloud section that
 * hammers the token endpoint forever instead of saying "reconnect".
 */

const NOW = Date.parse('2026-08-17T12:00:00.000Z');

function rowWith(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: 'default',
    accountId: 'acc',
    accountName: 'Andersseen',
    scope: 'offline_access page.write',
    accessToken: 'sealed-access',
    refreshToken: 'sealed-refresh',
    expiresAt: new Date(NOW + 900_000).toISOString(),
    connectedBy: 'user-1',
    connectedAt: '2026-08-17T10:00:00.000Z',
    updatedAt: '2026-08-17T11:45:00.000Z',
    ...overrides,
  };
}

describe('expiresAtFrom', () => {
  it('uses the lifetime the token endpoint reported', () => {
    expect(expiresAtFrom(900, NOW)).toBe(new Date(NOW + 900_000).toISOString());
  });

  it('falls back to Cloudflare’s documented 900s when it reports nothing', () => {
    // A missing expires_in must not produce an Invalid Date, which every
    // comparison afterwards would read as "expired".
    expect(expiresAtFrom(undefined, NOW)).toBe(expiresAtFrom(900, NOW));
    expect(expiresAtFrom(0, NOW)).toBe(expiresAtFrom(900, NOW));
    expect(expiresAtFrom(Number.NaN, NOW)).toBe(expiresAtFrom(900, NOW));
  });
});

describe('isExpiring', () => {
  it('renews early rather than at the last second', () => {
    // A request that resolves the credential and then spends seconds uploading
    // assets must not have it expire mid-flight.
    const inOneMinute = new Date(NOW + 60_000).toISOString();
    expect(isExpiring(inOneMinute, NOW)).toBe(true);
    expect(EARLY_REFRESH_MS).toBeGreaterThan(60_000);
  });

  it('leaves a fresh token alone', () => {
    expect(isExpiring(new Date(NOW + 900_000).toISOString(), NOW)).toBe(false);
  });

  it('treats an unreadable timestamp as expired', () => {
    expect(isExpiring('not a date', NOW)).toBe(true);
  });
});

describe('needsReconnect', () => {
  it('is false while there is still a refresh token', () => {
    const spent = rowWith({ expiresAt: new Date(NOW - 1000).toISOString() });
    expect(needsReconnect(spent, NOW)).toBe(false);
  });

  it('is true once the grant is spent and unrenewable', () => {
    const dead = rowWith({
      refreshToken: null,
      expiresAt: new Date(NOW - 1000).toISOString(),
    });
    expect(needsReconnect(dead, NOW)).toBe(true);
  });

  it('is false for a live access token with no refresh token', () => {
    // Still usable for the next few minutes; nothing to warn about yet.
    expect(needsReconnect(rowWith({ refreshToken: null }), NOW)).toBe(false);
  });
});

describe('toConnection', () => {
  it('describes the grant without ever carrying a token', () => {
    const connection = toConnection(rowWith(), NOW);

    expect(connection).toEqual({
      kind: 'oauth',
      accountId: 'acc',
      accountName: 'Andersseen',
      scope: 'offline_access page.write',
      connectedAt: '2026-08-17T10:00:00.000Z',
      expiresAt: new Date(NOW + 900_000).toISOString(),
      needsReconnect: false,
    });
    expect(JSON.stringify(connection)).not.toContain('sealed');
  });
});
