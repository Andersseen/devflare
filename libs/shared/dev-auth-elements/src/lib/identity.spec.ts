import { describe, it, expect } from 'vitest';
import { displayIdentity, initials } from './identity';

describe('displayIdentity', () => {
  it('prefers the name', () => {
    expect(displayIdentity('Andrii Pap', 'a@b.com')).toBe('Andrii Pap');
  });

  it('falls back to email when the name is missing', () => {
    expect(displayIdentity(null, 'a@b.com')).toBe('a@b.com');
  });

  it('falls back to email when the name is only whitespace', () => {
    expect(displayIdentity('   ', 'a@b.com')).toBe('a@b.com');
  });

  it('falls back to a generic label when both are missing', () => {
    expect(displayIdentity(null, null)).toBe('your account');
  });

  it('accepts a custom fallback label', () => {
    expect(displayIdentity(undefined, undefined, 'signed-in account')).toBe(
      'signed-in account',
    );
  });
});

describe('initials', () => {
  it('uses first and last initials for a multi-word name', () => {
    expect(initials('Andrii Pap', 'a@b.com')).toBe('AP');
  });

  it('uses first and last initials for a name with more than two words', () => {
    expect(initials('Andrii Mykola Pap', 'a@b.com')).toBe('AP');
  });

  it('uses a single initial for a one-word name', () => {
    expect(initials('Andrii', 'a@b.com')).toBe('A');
  });

  it('falls back to the email initial when no name is present', () => {
    expect(initials(null, 'a@b.com')).toBe('A');
  });

  it('returns an empty string when neither name nor email is present', () => {
    expect(initials(null, null)).toBe('');
  });

  it('ignores a whitespace-only name', () => {
    expect(initials('   ', 'z@b.com')).toBe('Z');
  });
});
