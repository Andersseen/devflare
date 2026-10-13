import { describe, expect, it } from 'vitest';
import { WATCHED_PROJECTS } from './dashboard-projects.data';
import {
  diffIdentities,
  effectiveIdentities,
  newIdentitySlug,
  parseAliasList,
} from './dashboard-projects.identities';
import { buildProjectViews } from './dashboard-projects';
import type { CloudInventory } from '@org/core';

const inventory = (workers: string[]): CloudInventory => ({
  worker: {
    items: workers.map((name) => ({
      name,
      createdOn: '2026-08-01T00:00:00.000Z',
      modifiedOn: '2026-08-24T00:00:00.000Z',
      domains: [],
    })),
    error: null,
  },
  pages: { items: [], error: null },
  d1: { items: [], error: null },
  kv: { items: [], error: null },
  r2: { items: [], error: null },
});

describe('effective identities', () => {
  it('without overrides equals the built-ins, domains included', () => {
    const effective = effectiveIdentities(WATCHED_PROJECTS, []);
    expect(effective).toHaveLength(WATCHED_PROJECTS.length);
    expect(
      effective.find((i) => i.slug === 'volt-ui')?.verifiedDomains,
    ).toEqual(['volt-ui.andersseen.dev']);
    expect(effective.every((i) => i.builtIn)).toBe(true);
  });

  it('persisted settings win over the seed; verified domains survive an edit', () => {
    const effective = effectiveIdentities(WATCHED_PROJECTS, [
      { slug: 'volt-ui', name: 'Volt', aliases: ['volt-docs'], removed: false },
      { slug: 'etym', name: 'Etym', aliases: [], removed: true },
      { slug: 'my-app', name: 'My App', aliases: ['mine-api'], removed: false },
    ]);
    const volt = effective.find((i) => i.slug === 'volt-ui');
    expect(volt).toMatchObject({ name: 'Volt', aliases: ['volt-docs'] });
    expect(volt?.verifiedDomains).toEqual(['volt-ui.andersseen.dev']);
    expect(effective.find((i) => i.slug === 'etym')).toBeUndefined();
    const custom = effective.find((i) => i.slug === 'my-app');
    expect(custom).toMatchObject({ builtIn: false, aliases: ['mine-api'] });
    expect(custom?.verifiedDomains).toBeUndefined();
  });

  it('diff then apply round-trips, and an untouched list produces no overrides', () => {
    expect(
      diffIdentities(
        WATCHED_PROJECTS,
        effectiveIdentities(WATCHED_PROJECTS, []),
      ),
    ).toEqual([]);

    const edited = effectiveIdentities(WATCHED_PROJECTS, []).filter(
      (i) => i.slug !== 'duplex',
    );
    edited[0] = { ...edited[0], aliases: [...edited[0].aliases, 'extra-name'] };
    edited.push({
      name: 'New',
      slug: 'new',
      aliases: ['newish'],
      builtIn: false,
    });
    const overrides = diffIdentities(WATCHED_PROJECTS, edited);
    expect(overrides.map((o) => [o.slug, o.removed])).toEqual([
      [edited[0].slug, false],
      ['duplex', true],
      ['new', false],
    ]);
    expect(
      effectiveIdentities(WATCHED_PROJECTS, overrides).map((i) => i.slug),
    ).toEqual(edited.map((i) => i.slug));
  });
});

describe('helpers', () => {
  it('derives a unique slug and parses aliases', () => {
    expect(newIdentitySlug('My App!', new Set(['my-app']))).toBe('my-app-2');
    expect(newIdentitySlug('***', new Set())).toBe('group');
    expect(parseAliasList(' a1, b2 ,a1,, ')).toEqual(['a1', 'b2']);
  });
});

describe('matching uses the effective identities', () => {
  it('a user alias groups a Worker; removing a built-in stops grouping it', () => {
    const inv = inventory(['billing-service', 'duplex-web', 'duplex-worker']);
    const custom = effectiveIdentities(WATCHED_PROJECTS, [
      {
        slug: 'billing',
        name: 'Billing',
        aliases: ['billing-service'],
        removed: false,
      },
      { slug: 'duplex', name: 'Duplex', aliases: [], removed: true },
    ]);
    const { discovered } = buildProjectViews({
      saved: [],
      inventory: inv,
      identities: custom,
    });
    const billing = discovered.find((v) => v.name === 'Billing');
    expect(billing?.resources.map((r) => r.name)).toEqual(['billing-service']);
    // Duplex no longer groups: each Worker is its own discovered project.
    expect(discovered.filter((v) => v.name.startsWith('duplex'))).toHaveLength(
      2,
    );
  });

  it('defaults to the built-ins', () => {
    const { discovered } = buildProjectViews({
      saved: [],
      inventory: inventory(['duplex-web', 'duplex-worker']),
    });
    expect(discovered.find((v) => v.name === 'Duplex')?.resources).toHaveLength(
      2,
    );
  });
});
