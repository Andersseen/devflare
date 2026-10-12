import { defineEventHandler, getRequestURL } from 'h3';
import { db } from '../../../db';
import {
  describeConnection,
  resolveGitHubConfig,
} from '../../../lib/github/runtime';
import { requireAllowedUser } from '../../../lib/http';
import { getSettings } from '../../../lib/store/queries';

/** GET /api/v1/settings — connection status and installations. No secrets. */
export default defineEventHandler(async (event) => {
  await requireAllowedUser(event);
  const connection = describeConnection(resolveGitHubConfig(event.context));
  const webhookUrl = `${getRequestURL(event).origin}/api/github/webhook`;
  return getSettings(db, connection, webhookUrl);
});
