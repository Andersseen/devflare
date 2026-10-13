import type { DiscoveryIdentityOverride } from '@org/core';
import type { WatchedProject } from './dashboard-projects.models';

/**
 * Discovery identities (spec 022): the named groups that suggest which unowned
 * Workers/Pages belong together. The built-in list (WATCHED_PROJECTS) is the
 * bootstrap; a user's persisted edits override it by slug. This is *matching*
 * only — it never decides ownership (that is `project_resource`) and has
 * nothing to do with where a card sits on the dashboard (that is the layout).
 *
 * Only built-in identities can carry `verifiedDomains`: a domain a user typed
 * is never presented as verified, so the editable fields are name and aliases.
 */

/** What the server stores per user: a difference from the built-ins. */
export type IdentityOverride = DiscoveryIdentityOverride;

/** An identity the page works with, flagged by where it came from. */
export interface Identity extends WatchedProject {
  aliases: string[];
  /** Defined in code (carries verified domains) rather than by the user. */
  builtIn: boolean;
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Built-ins with the user's overrides applied; user's settings win. */
export function effectiveIdentities(
  seed: readonly WatchedProject[],
  overrides: readonly IdentityOverride[],
): Identity[] {
  const byOverride = new Map(overrides.map((o) => [o.slug, o]));
  const result: Identity[] = [];

  for (const watched of seed) {
    const override = byOverride.get(watched.slug);
    if (override?.removed) continue;
    result.push({
      ...watched,
      name: override?.name ?? watched.name,
      aliases: [...(override ? override.aliases : (watched.aliases ?? []))],
      builtIn: true,
    });
  }

  const seeded = new Set(seed.map((w) => w.slug));
  for (const override of overrides) {
    if (seeded.has(override.slug) || override.removed) continue;
    result.push({
      name: override.name,
      slug: override.slug,
      aliases: [...override.aliases],
      builtIn: false,
    });
  }
  return result;
}

/** The minimal overrides that turn the built-ins into `effective`. */
export function diffIdentities(
  seed: readonly WatchedProject[],
  effective: readonly Identity[],
): IdentityOverride[] {
  const keep = new Map(effective.map((identity) => [identity.slug, identity]));
  const overrides: IdentityOverride[] = [];

  for (const watched of seed) {
    const current = keep.get(watched.slug);
    if (!current) {
      overrides.push({
        slug: watched.slug,
        name: watched.name,
        aliases: [...(watched.aliases ?? [])],
        removed: true,
      });
      continue;
    }
    const sameAliases =
      JSON.stringify(current.aliases) === JSON.stringify(watched.aliases ?? []);
    if (current.name !== watched.name || !sameAliases) {
      overrides.push({
        slug: watched.slug,
        name: current.name,
        aliases: current.aliases,
        removed: false,
      });
    }
  }

  const seeded = new Set(seed.map((w) => w.slug));
  for (const identity of effective) {
    if (seeded.has(identity.slug)) continue;
    overrides.push({
      slug: identity.slug,
      name: identity.name,
      aliases: identity.aliases,
      removed: false,
    });
  }
  return overrides;
}

/** A slug for a user-defined identity that collides with nothing taken. */
export function newIdentitySlug(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'group';
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export function parseAliasList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

/**
 * Names too short to match safely ("ui" would claim half the account) are
 * kept but flagged, so the editor can tell the user why they do nothing.
 */
export const isMatchable = (alias: string): boolean => norm(alias).length >= 3;
