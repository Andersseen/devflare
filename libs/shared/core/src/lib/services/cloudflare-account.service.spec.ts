import { describe, it, expect } from 'vitest';
import {
  deploymentTone,
  formatBytes,
  formatRelative,
} from './cloudflare-account.service';

describe('deploymentTone', () => {
  it('maps the statuses Cloudflare actually reports', () => {
    expect(deploymentTone('success')).toBe('success');
    expect(deploymentTone('failure')).toBe('failure');
    expect(deploymentTone('canceled')).toBe('failure');
    expect(deploymentTone('building')).toBe('progress');
    expect(deploymentTone('queued')).toBe('progress');
  });

  it('leaves an unrecognised status neutral', () => {
    // A stage name added upstream must not be rendered as a green tick.
    expect(deploymentTone('some-new-stage')).toBe('idle');
    expect(deploymentTone('')).toBe('idle');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-08-13T12:00:00Z').getTime();

  it('reads as a deploy list, not a timestamp', () => {
    expect(formatRelative('2026-08-13T11:59:30Z', now)).toBe('just now');
    expect(formatRelative('2026-08-13T11:30:00Z', now)).toBe('30m ago');
    expect(formatRelative('2026-08-13T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelative('2026-08-11T12:00:00Z', now)).toBe('2d ago');
  });

  it('falls back to a date once relative stops helping', () => {
    expect(formatRelative('2026-01-02T12:00:00Z', now)).toMatch(/\d/);
    expect(formatRelative('2026-01-02T12:00:00Z', now)).not.toMatch(/ago/);
  });

  it('handles a missing or unparseable date', () => {
    expect(formatRelative(null, now)).toBe('—');
    expect(formatRelative('not a date', now)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('scales to the unit that keeps the number readable', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('drops the decimal once the number is large enough not to need it', () => {
    expect(formatBytes(45 * 1024)).toBe('45 KB');
  });

  it('shows a dash when the API did not report a size', () => {
    expect(formatBytes(null)).toBe('—');
  });
});
