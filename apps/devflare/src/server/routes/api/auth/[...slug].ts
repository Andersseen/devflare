import {
  defineEventHandler,
  getRequestHeaders,
  getQuery,
  readRawBody,
} from 'h3';

/**
 * Catch-all proxy for /api/auth/* requests.
 * Forwards everything to the external dev-auth service.
 */
export default defineEventHandler(async (event) => {
  const authUrl = process.env['DEV_AUTH_URL'] || 'http://localhost:8787';
  const slug = event.context.params?.slug || '';
  const query = getQuery(event);
  const queryString =
    Object.keys(query).length > 0
      ? '?' + new URLSearchParams(query as Record<string, string>).toString()
      : '';

  const target = `${authUrl}/api/auth/${slug}${queryString}`;

  const headers: Record<string, string> = {};
  const reqHeaders = getRequestHeaders(event);
  for (const [key, value] of Object.entries(reqHeaders)) {
    if (value !== undefined && value !== null && key.toLowerCase() !== 'host') {
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  // Override Origin so better-auth validates against the auth service baseURL
  headers.origin = authUrl;

  const body = ['GET', 'HEAD'].includes(event.method)
    ? undefined
    : await readRawBody(event).catch(() => undefined);

  const response = await fetch(target, {
    method: event.method,
    headers,
    body,
  });

  // Forward status
  event.node.res.statusCode = response.status;
  event.node.res.statusMessage = response.statusText;

  // Forward headers (skip h3-managed ones)
  const skip = new Set([
    'content-encoding',
    'transfer-encoding',
    'connection',
    'set-cookie',
  ]);
  for (const [key, value] of response.headers.entries()) {
    if (!skip.has(key.toLowerCase())) {
      event.node.res.setHeader(key, value);
    }
  }

  // Handle Set-Cookie separately (may be multiple)
  const setCookie =
    (
      response.headers as unknown as { getSetCookie?: () => string[] }
    ).getSetCookie?.() ||
    response.headers.get('set-cookie') ||
    undefined;
  if (setCookie) {
    if (Array.isArray(setCookie)) {
      event.node.res.setHeader('Set-Cookie', setCookie);
    } else {
      event.node.res.setHeader('Set-Cookie', setCookie);
    }
  }

  const buf = await response.arrayBuffer();
  return Buffer.from(buf);
});
