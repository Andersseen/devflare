import { defineEventHandler } from 'h3';
import {
  answer,
  callerOf,
  routeParam,
} from '../../../../../../lib/project-http';
import { unlinkResourceFor } from '../../../../../../lib/project-service';

/**
 * DELETE /api/v1/projects/:id/resources/:resourceId — unlink one resource.
 *
 * `:resourceId` is the link's own id (`resources[].id`), not the Cloudflare
 * identifier. Unlinking needs no Cloudflare access: it only removes DevFlare's
 * claim, which is how a link to a resource deleted upstream is cleaned up.
 */
export default defineEventHandler(async (event) => {
  const caller = await callerOf(event);
  const id = routeParam(event, 'id');
  const linkId = routeParam(event, 'resourceId');

  return answer(async () => {
    await unlinkResourceFor(caller, id, linkId);
    return { success: true };
  });
});
