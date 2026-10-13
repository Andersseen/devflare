import { createError, readBody, type H3Event } from 'h3';
import { parseLayout, type DashboardLayout } from '@org/dashboard-layout/logic';
import { callerOf } from './project-http';
import { DashboardInputError } from './dashboard-store';

/** The h3 half of the dashboard routes: session in, 4xx out. */

export async function requireUserId(event: H3Event): Promise<string> {
  const caller = await callerOf(event);
  if (!caller)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  return caller.id;
}

const MAX_ITEMS = 500;
/** `saved:<project id>` or `discovered:<slug>`. */
const ITEM_KEY =
  /^(saved:[0-9a-fA-F-]{8,64}|discovered:[a-z0-9][a-z0-9-]{0,63})$/;

export async function readLayoutBody(event: H3Event): Promise<DashboardLayout> {
  const parsed = parseLayout(await readBody(event), {
    maxItems: MAX_ITEMS,
    isItemId: (value) => ITEM_KEY.test(value),
  });
  if (!parsed.ok)
    throw createError({ statusCode: 400, statusMessage: parsed.error });
  if (parsed.layout.pinnedIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'pinnedIds must be empty',
    });
  }
  return parsed.layout;
}

export async function badInput<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DashboardInputError) {
      throw createError({ statusCode: 400, statusMessage: error.message });
    }
    throw error;
  }
}
