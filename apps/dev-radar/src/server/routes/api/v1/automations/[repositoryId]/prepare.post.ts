import {
  createError,
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { db } from '../../../../../db';
import { guarded } from '../../../../../lib/automation/http';
import { prepareManually } from '../../../../../lib/automation/engine';
import {
  parsePrepareInput,
  parseRepositoryId,
} from '../../../../../lib/automation/validate';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../../../lib/http';
import {
  createRuntimeGitHub,
  resolveGitHubConfig,
} from '../../../../../lib/github/runtime';

const STATUS = {
  not_found: 404,
  github_not_configured: 503,
  ci_not_passing: 409,
  already_running: 409,
  access_revoked: 502,
  github_unavailable: 502,
  preparation_failed: 500,
} as const;

/**
 * POST /api/v1/automations/:repositoryId/prepare — manual prompt preparation
 * for the current head of the default branch. Body `{ "bypassCi": true }` is the
 * explicit user action that skips the CI gate. Reads GitHub, so it is limited
 * like manual sync (one in flight per user+repository is enforced by D1).
 */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  assertSameOriginJson(event);
  await enforceRateLimit(event, 'MUTATION_RATE_LIMITER', user.id);

  const body = await readBody(event);
  const { repositoryId, bypassCi } = await guarded(async () => ({
    repositoryId: parseRepositoryId(getRouterParam(event, 'repositoryId')),
    ...parsePrepareInput(body),
  }));

  const github = createRuntimeGitHub(resolveGitHubConfig(event.context));
  const result = await prepareManually(
    { db, github },
    { userId: user.id, repositoryId, bypassCi },
  );
  if (!result.ok) {
    throw createError({
      statusCode: STATUS[result.code],
      statusMessage: result.message,
      data: {
        code: result.code,
        ...(result.gate ? { gate: result.gate } : {}),
      },
    });
  }
  setResponseStatus(event, 201);
  return { ok: true, promptId: result.promptId };
});
