/**
 * Flags pull requests that are *documented* version/release PRs. Only two
 * grounded signals count; a title that merely contains "release" does not.
 *
 *   label  — one of GitHub's/the common release tools' explicit labels
 *   branch — the head branch prefix a release tool owns:
 *            release-please (`release-please--branches--…`) and
 *            Changesets (`changeset-release/…`)
 *
 * Anything else yields null: ambiguous naming is not a release status.
 */

const RELEASE_LABELS = new Set([
  'release',
  'autorelease: pending',
  'autorelease: tagged',
  'autorelease: snapshot',
]);

const RELEASE_BRANCH_PREFIXES = ['release-please--', 'changeset-release/'];

export function releaseHint(
  labels: readonly string[],
  headRef: string,
): string | null {
  const label = labels.find((l) => RELEASE_LABELS.has(l.trim().toLowerCase()));
  if (label) return `label “${label}”`;

  const prefix = RELEASE_BRANCH_PREFIXES.find((p) => headRef.startsWith(p));
  if (prefix) return `branch ${prefix}…`;

  return null;
}
