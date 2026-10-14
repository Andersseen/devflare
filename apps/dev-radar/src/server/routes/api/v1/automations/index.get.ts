import { defineEventHandler } from 'h3';
import { db } from '../../../../db';
import { guarded } from '../../../../lib/automation/http';
import { listAutomations } from '../../../../lib/automation/service';
import { requireAllowedUser } from '../../../../lib/http';
import {
  describeConnection,
  resolveGitHubConfig,
} from '../../../../lib/github/runtime';

/** GET /api/v1/automations — the caller's rules (with derived state) and eligible repositories. */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  const { configured } = describeConnection(resolveGitHubConfig(event.context));
  return guarded(() => listAutomations(db, user.id, configured));
});
