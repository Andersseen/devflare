import { createError, type H3Event } from 'h3';
import { envVar } from '../env';
import { ShortLinkError } from './store';
import { parseShortLinkBase, type ShortLinkBase } from './validation';

export function shortLinkBase(event: H3Event): ShortLinkBase | null {
  return parseShortLinkBase(envVar(event.context, 'SHORT_LINK_BASE_URL'));
}

/** Maps a store error to its HTTP status; anything else is rethrown and
 * becomes a generic 500 without detail. */
export async function withShortLinkErrors<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ShortLinkError) {
      throw createError({
        statusCode: error.status,
        statusMessage: error.message,
        data: { code: error.code },
      });
    }
    throw error;
  }
}
