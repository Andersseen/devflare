/**
 * Where to land after sign-in. Only same-site paths are accepted: a
 * `returnTo` arrives from the browser, and echoing an absolute URL back into a
 * redirect is an open redirect. `//host` is rejected too — browsers read it as
 * protocol-relative and leave the site.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
}
