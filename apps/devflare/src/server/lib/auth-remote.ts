import { createError, type H3Event } from 'h3';

/**
 * Validates a session by calling the remote auth service (dev-auth).
 * This replaces the local `auth.api.getSession()` call.
 */
export async function getRemoteSession(event: H3Event) {
  const authServiceUrl = process.env['DEV_AUTH_URL'] ?? 'http://localhost:8787';
  const cookieHeader = event.headers.get('cookie') ?? '';

  try {
    const response = await fetch(`${authServiceUrl}/api/auth/get-session`, {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data as {
      session?: { id: string; userId: string };
      user?: { id: string };
    } | null;
  } catch {
    return null;
  }
}

export function requireAuth(session: { user?: { id: string } } | null) {
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  return session.user;
}
