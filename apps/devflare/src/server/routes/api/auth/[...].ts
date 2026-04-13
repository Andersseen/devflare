import { defineEventHandler, toWebRequest } from 'h3';
import { auth } from '../../../auth';

/**
 * Catch-all que delega todas las peticiones /api/auth/* a better-auth.
 * Cubre: /api/auth/sign-in/email, /api/auth/sign-up/email,
 *        /api/auth/sign-out, /api/auth/get-session, etc.
 */
export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  return auth.handler(request);
});
