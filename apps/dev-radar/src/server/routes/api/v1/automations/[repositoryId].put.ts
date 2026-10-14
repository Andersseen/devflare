import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { db } from '../../../../db';
import { guarded } from '../../../../lib/automation/http';
import { saveRule } from '../../../../lib/automation/service';
import {
  parseRepositoryId,
  parseRuleInput,
} from '../../../../lib/automation/validate';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../../lib/http';

/**
 * PUT /api/v1/automations/:repositoryId — create or update the caller's rule
 * (enable/disable included). Enabling requires the repository to be followed.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  assertSameOriginJson(event);
  await enforceRateLimit(event, 'AUTOMATION_RATE_LIMITER', user.id);

  const body = await readBody(event);
  return guarded(async () => {
    const repositoryId = parseRepositoryId(
      getRouterParam(event, 'repositoryId'),
    );
    const input = parseRuleInput(body);
    return { rule: await saveRule(db, user.id, repositoryId, input) };
  });
});
