import { createError, getRouterParam, type H3Event } from 'h3';
import { getAppSession } from './session';
import { cloudAdminVerdict } from './cloud-admin';
import { resolveCloudflareCredential } from './cloudflare-connection';
import {
  ProjectApiError,
  type Caller,
  type VerificationAccess,
} from './project-service';

/**
 * The h3 half of the project routes: session in, `ProjectApiError` out as an
 * HTTP error whose `data.reason` the UI can branch on. Everything worth testing
 * is in ./project-service.ts.
 */

export async function callerOf(event: H3Event): Promise<Caller | null> {
  const session = await getAppSession(event);
  return session ? { id: session.user.id, email: session.user.email } : null;
}

export function routeParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name);
  if (!value) {
    throw createError({
      statusCode: 400,
      statusMessage: `${name} is required`,
    });
  }
  return value;
}

export function verificationAccess(event: H3Event): VerificationAccess {
  return {
    verdict: (email) => cloudAdminVerdict(event, email),
    credential: () => resolveCloudflareCredential(event.context),
  };
}

export async function answer<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProjectApiError) {
      throw createError({
        statusCode: error.status,
        statusMessage: error.message,
        data: { reason: error.reason, error: error.message },
      });
    }
    throw error;
  }
}
