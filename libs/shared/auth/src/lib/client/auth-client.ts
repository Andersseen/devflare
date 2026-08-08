import type { AuthUser } from '../types/auth.types';

/**
 * Browser client for *this app's* session endpoints — not for the identity
 * provider.
 *
 * This used to be a better-auth client pointed at dev-auth, which meant the app
 * shared a cookie with the auth service and only worked because both sat on
 * subdomains of one domain. dev-auth is now an OAuth 2.1 / OIDC provider: the app
 * completes an authorization code flow on the server and keeps its own session,
 * so everything the browser needs is same-origin and there is no auth SDK left to
 * configure.
 *
 * Sign-in is deliberately not a fetch: it is a full-page navigation, because the
 * provider has to be able to render its own login page (and hand off to GitHub).
 */

const BASE = '/api/auth';

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
export function signInUrl(returnTo = '/'): string {
  return `${BASE}/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function createClient() {
  return {
    /** Current session, or `{ user: null }`. */
    async getSession(): Promise<SessionResponse> {
      const response = await fetch(`${BASE}/session`, {
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
    signIn(returnTo = '/'): void {
      window.location.assign(signInUrl(returnTo));
    },

    async signOut(): Promise<void> {
      await json(
        await fetch(`${BASE}/logout`, {
          method: 'POST',
          credentials: 'include',
        }),
      );
    },

    async updateUser(input: { name: string }): Promise<SessionResponse> {
      return json<SessionResponse>(
        await fetch(`${BASE}/user`, {
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
