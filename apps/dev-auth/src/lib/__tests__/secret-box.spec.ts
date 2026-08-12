import { describe, it, expect } from 'vitest';
import { open, seal, SecretBoxError } from '../secret-box';

const KEY = 'zm9Vb0hQZ0hkT2xQbGtqaGdmZHNhcXdlcnR5dWlvcDA=';

describe('secret box', () => {
  it('round-trips a value', async () => {
    const sealed = await seal('github-client-secret', KEY);

    expect(await open(sealed, KEY)).toBe('github-client-secret');
  });

  it('does not leak the plaintext into the sealed form', async () => {
    const sealed = await seal('github-client-secret', KEY);

    expect(sealed).not.toContain('github-client-secret');
  });

  it('produces a different ciphertext each time', async () => {
    // A fresh nonce per seal. Reusing one under the same key is the classic way
    // to break GCM, so identical inputs must not produce identical output.
    const first = await seal('same-value', KEY);
    const second = await seal('same-value', KEY);

    expect(first).not.toBe(second);
    expect(await open(second, KEY)).toBe('same-value');
  });

  it('refuses to open with the wrong key', async () => {
    const sealed = await seal('github-client-secret', KEY);

    await expect(open(sealed, 'a-completely-different-key')).rejects.toThrow(
      SecretBoxError,
    );
  });

  it('refuses to open a tampered value', async () => {
    // AES-GCM authenticates, so this fails rather than decrypting to something
    // an attacker chose.
    const sealed = await seal('github-client-secret', KEY);
    const [iv, ciphertext] = sealed.split('.');
    const flipped = `${iv}.${'A' + (ciphertext as string).slice(1)}`;

    await expect(open(flipped, KEY)).rejects.toThrow(SecretBoxError);
  });

  it('refuses a malformed sealed value', async () => {
    await expect(open('not-sealed', KEY)).rejects.toThrow(SecretBoxError);
  });

  it('refuses to work without a key', async () => {
    await expect(seal('anything', '')).rejects.toThrow(/SECRET_ENCRYPTION_KEY/);
  });

  it('accepts a key that is not base64 of the right length', async () => {
    // A hand-typed value should produce a usable key rather than an obscure
    // WebCrypto error about key length.
    const sealed = await seal('value', 'a passphrase someone typed');

    expect(await open(sealed, 'a passphrase someone typed')).toBe('value');
  });
});
