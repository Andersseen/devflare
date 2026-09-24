import { findSecretHints, maskSecret } from './secret-hints';

describe('findSecretHints', () => {
  it('finds bearer headers, JWTs and client secrets', () => {
    const kinds = findSecretHints(
      `curl -H 'Authorization: Bearer abc.def.ghi' https://x -d 'client_secret=s3cr3tvalue'
       token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig`,
    ).map((hint) => hint.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['Authorization header', 'JWT', 'Client secret']),
    );
  });

  it('finds cookies and well-known key formats', () => {
    const kinds = findSecretHints(
      `-b 'sid=abc123'\nCookie: a=b\nAKIAABCDEFGHIJKLMNOP ghp_${'a'.repeat(36)}`,
    ).map((hint) => hint.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'Cookie (curl -b)',
        'Cookie',
        'AWS access key',
        'GitHub token',
      ]),
    );
  });

  it('never returns the value itself', () => {
    const secret = 'Bearer supersecretvalue123';
    const [hint] = findSecretHints(`Authorization: ${secret}`);
    expect(hint.preview).not.toContain('supersecret');
    expect(hint.preview).toMatch(/\(26 chars\)$/);
  });

  it('stays quiet on ordinary input', () => {
    expect(findSecretHints('name = "worker"\nmain = "src/index.ts"')).toEqual(
      [],
    );
  });

  it('masks short values completely', () => {
    expect(maskSecret('abc')).toBe('… (3 chars)');
  });
});
