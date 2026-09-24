/**
 * Where to land after sign-in. Only same-site paths are accepted: a
 * `returnTo` arrives from the browser, and echoing an absolute URL back into a
 * redirect is an open redirect. `//host` is rejected too — browsers read it as
 * protocol-relative and leave the site — and so is anything containing a
 * backslash, whitespace or a control character: URL parsers treat `\` as `/`
 * and silently drop tabs and newlines, so `/\host` and `/<tab>/host` both
 * resolve to `//host`.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  // eslint-disable-next-line no-control-regex -- control characters are the point
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return '/';
  return value;
}
