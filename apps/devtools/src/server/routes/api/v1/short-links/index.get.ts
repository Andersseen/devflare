import { defineEventHandler } from 'h3';
import { db } from '../../../../db';
import { requireAllowedUser } from '../../../../lib/http';
import { shortLinkBase } from '../../../../lib/short-links/http';
import { listLinks } from '../../../../lib/short-links/store';

/** GET /api/v1/short-links — the signed-in, allowed user's links. */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  const base = shortLinkBase(event);
  return {
    links: await listLinks(db, user.id, base),
    baseUrl: base?.url ?? null,
  };
});
