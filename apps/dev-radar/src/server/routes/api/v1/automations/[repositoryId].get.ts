import { defineEventHandler, getRouterParam } from 'h3';
import { db } from '../../../../db';
import { guarded } from '../../../../lib/automation/http';
import { getAutomationDetail } from '../../../../lib/automation/service';
import { parseRepositoryId } from '../../../../lib/automation/validate';
import { requireAllowedUser } from '../../../../lib/http';
import {
  describeConnection,
  resolveGitHubConfig,
} from '../../../../lib/github/runtime';

/** GET /api/v1/automations/:repositoryId — rule, known workflows and recent runs for one repository. */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  const { configured } = describeConnection(resolveGitHubConfig(event.context));
  return guarded(() =>
    getAutomationDetail(
      db,
      user.id,
      parseRepositoryId(getRouterParam(event, 'repositoryId')),
      configured,
    ),
  );
});
