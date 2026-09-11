/**
 * Identity-display fallbacks, ported from the tested logic in PR #32
 * (`libs/shared/auth-ui`) — framework-agnostic already, just relocated.
 *
 * None of `name`/`email`/`image` on an `AuthUser` are guaranteed to be
 * present or non-empty, so every consumer of these needs the same
 * trim-and-fallback chain rather than reinventing it per call site.
 */

function clean(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

/** A human-readable identity string: name, then email, then a generic label. */
export function displayIdentity(
  name: string | null | undefined,
  email: string | null | undefined,
  fallback = 'your account',
): string {
  return clean(name) || clean(email) || fallback;
}

/**
 * Initials for an avatar fallback. A multi-word name uses its first and last
 * word's initials ("Andrii Pap" -> "AP"); a single-word name or an email-only
 * identity uses just the first character; an empty identity returns ''.
 */
export function initials(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const cleanName = clean(name);
  const cleanEmail = clean(email);
  const words = cleanName.split(/\s+/).filter(Boolean);

  if (words.length > 1) {
    return `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}`.toUpperCase();
  }

  const source = words[0] || cleanEmail;
  return source ? source.charAt(0).toUpperCase() : '';
}
