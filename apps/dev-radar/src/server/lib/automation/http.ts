import { createError } from 'h3';
import { ServiceError } from './service';
import { ValidationError } from './validate';

/**
 * Maps the automation layer's typed errors to fixed-message HTTP errors.
 * Anything else is rethrown untouched (h3 turns it into a generic 500), so no
 * database or GitHub detail reaches the response.
 */
export async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw createError({
        statusCode: 400,
        statusMessage: error.message,
        data: { code: 'invalid_request' },
      });
    }
    if (error instanceof ServiceError) {
      throw createError({
        statusCode: error.status,
        statusMessage: error.message,
        data: { code: error.code },
      });
    }
    throw error;
  }
}
