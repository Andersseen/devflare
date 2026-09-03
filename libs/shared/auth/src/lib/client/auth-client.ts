import type { AuthUser } from '../types/auth.types';

/**
 * Browser client for *this app's* session endpoints — not for the identity
 * provider.
 *
 * This is the Angular-side half of DevAuth's consumer SDK. It never speaks
 * OAuth/OIDC itself: dev-auth is the provider, the host application's server
 * completes the authorization code flow (see @org/dev-auth-core) and keeps its
 * own session, and this client only ever talks to that application's own
 * `basePath` — same-origin, cookie-based, no provider credentials in reach of
 * browser code.
 *
 * Sign-in is deliberately not a fetch: it is a full-page navigation, because the
 * provider has to be able to render its own login page (and hand off to GitHub).
 */

export const DEFAULT_BASE_PATH = '/api/auth';

export interface SessionResponse {
  user: AuthUser | null;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      (body as { statusMessage?: string; message?: string })?.statusMessage ??
        (body as { message?: string })?.message ??
        `Request failed with ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

/**
 * The URL that hands the browser to the identity provider. Separate from the
 * navigation so it can be asserted on — jsdom will not let a test replace
 * `window.location`.
 */
export function signInUrl(
  returnTo = '/',
  basePath = DEFAULT_BASE_PATH,
): string {
  return `${basePath}/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function createClient(basePath = DEFAULT_BASE_PATH) {
  return {
    /** Current session, or `{ user: null }`. */
    async getSession(): Promise<SessionResponse> {
      const response = await fetch(`${basePath}/session`, {
        credentials: 'include',
      });
      if (!response.ok) return { user: null };
      return (await response.json()) as SessionResponse;
    },

    /**
     * Leaves the SPA for the provider. `returnTo` is a path on this app; the
     * server refuses anything that is not (an absolute URL here would be an open
     * redirect).
     */
    login(returnTo = '/'): void {
      window.location.assign(signInUrl(returnTo, basePath));
    },

    async logout(): Promise<void> {
      await json(
        await fetch(`${basePath}/logout`, {
          method: 'POST',
          credentials: 'include',
        }),
      );
    },

    async updateUser(input: { name: string }): Promise<SessionResponse> {
      return json<SessionResponse>(
        await fetch(`${basePath}/user`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(input),
        }),
      );
    },
  };
}

export type AuthClient = ReturnType<typeof createClient>;
