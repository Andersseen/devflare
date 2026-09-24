import {
  defineEventHandler,
  getRequestURL,
  sendRedirect,
  setResponseHeader,
  setResponseStatus,
} from 'h3';
import { db } from '../db';
import { shortLinkBase } from '../lib/short-links/http';
import { resolveRedirect } from '../lib/short-links/store';
import { matchShortLinkRequest } from '../lib/short-links/validation';

/**
 * The public short-link redirect: request → one indexed read → redirect.
 *
 * A Nitro middleware rather than a route, so it runs before the Angular
 * renderer is ever reached, and so it can match on the Host header — the
 * short-link host (SHORT_LINK_BASE_URL) is served by this same Worker. For
 * every other request it returns immediately after comparing the host.
 * Public by design: no session, no rate limit (Cloudflare's edge sits in
 * front), nothing logged about the visitor.
 */
export default defineEventHandler(async (event) => {
  const base = shortLinkBase(event);
  if (!base) return;

  const match = matchShortLinkRequest(getRequestURL(event), base);
  if (!match) return;

  setResponseHeader(event, 'Cache-Control', 'no-store');
  setResponseHeader(event, 'X-Robots-Tag', 'noindex');

  if (event.method !== 'GET' && event.method !== 'HEAD') {
    setResponseHeader(event, 'Allow', 'GET, HEAD');
    setResponseStatus(event, 405);
    return 'Method not allowed';
  }

  if (match.kind === 'invalid') {
    setResponseStatus(event, 404);
    return 'Short link not found';
  }

  const decision = await resolveRedirect(db, match.slug);
  if (decision.status === 302) {
    return sendRedirect(event, decision.location, 302);
  }

  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
  setResponseStatus(event, decision.status);
  return decision.status === 410
    ? 'This short link has been disabled'
    : 'Short link not found';
});
