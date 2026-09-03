import { describe, it, expect } from 'vitest';
import { codeChallenge, createCodeVerifier, createState } from './crypto';

describe('codeChallenge', () => {
  it('matches the S256 vector from RFC 7636', async () => {
    await expect(
      codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('produces base64url with no padding', async () => {
    const challenge = await codeChallenge('anything');
    expect(challenge).not.toContain('=');
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('createState / createCodeVerifier', () => {
  it('produce URL-safe, sufficiently random tokens', () => {
    const a = createState();
    const b = createState();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThan(30);

    expect(createCodeVerifier()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
