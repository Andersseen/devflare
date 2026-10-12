import { defineEventHandler } from 'h3';
import { db } from '../../../db';
import {
  describeConnection,
  resolveGitHubConfig,
} from '../../../lib/github/runtime';
import { requireAllowedUser } from '../../../lib/http';
import { getOverview } from '../../../lib/store/queries';

/** GET /api/v1/overview — persisted state only; never calls GitHub. */
export default defineEventHandler(async (event) => {
  await requireAllowedUser(event);
  const connection = describeConnection(resolveGitHubConfig(event.context));
  return getOverview(db, connection);
});
