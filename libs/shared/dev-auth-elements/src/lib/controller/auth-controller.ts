/**
 * Framework-agnostic session controller for *this application's* own auth
 * routes — never the identity provider.
 *
 * This is the shared foundation `<dev-auth-sign-in>`/`<dev-auth-user-button>`
 * and `@dev-auth/angular`'s Angular `DevAuth` service both build on, so a page that
 * uses both never runs two independent session-fetch loops. It never speaks
 * OAuth/OIDC itself: dev-auth is the provider, the host application's server
 * completes the authorization code flow (see `@dev-auth/core`, a
 * deliberately separate package this one does not depend on) and keeps its
 * own session; this controller only ever talks to that application's own
 * `basePath` — same-origin, cookie-based, no provider credentials in reach of
 * browser code.
 *
 * Sign-in is deliberately not a fetch: it is a full-page navigation, because
 * the provider has to be able to render its own login page (and hand off to
 * GitHub).
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthControllerState {
  status: AuthStatus;
  user: AuthUser | null;
}

export interface AuthControllerConfig {
  basePath?: string;
}

export interface AuthController {
  getState(): AuthControllerState;
  /** Returns an unsubscribe function. */
  subscribe(listener: (state: AuthControllerState) => void): () => void;
  /** Resolves once the initial session lookup has settled. */
  ready(): Promise<void>;
  /** Hands the browser to the identity provider. Not a promise: this navigates away. */
  login(returnTo?: string): void;
  logout(): Promise<void>;
  updateProfile(input: { name: string }): Promise<void>;
  /** Re-runs the session lookup on demand. */
  refresh(): Promise<void>;
}

export const DEFAULT_BASE_PATH = '/api/auth';

interface SessionResponse {
  user: AuthUser | null;
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

export function createAuthController(
  config: AuthControllerConfig = {},
): AuthController {
  const basePath = config.basePath ?? DEFAULT_BASE_PATH;
  const listeners = new Set<(state: AuthControllerState) => void>();
  let state: AuthControllerState = { status: 'loading', user: null };

  function setState(next: AuthControllerState): void {
    state = next;
    for (const listener of listeners) listener(state);
  }

  async function loadSession(): Promise<void> {
    try {
      const response = await fetch(`${basePath}/session`, {
        credentials: 'include',
      });
      const { user } = response.ok
        ? ((await response.json()) as SessionResponse)
        : { user: null };
      setState({ status: user ? 'authenticated' : 'anonymous', user });
    } catch {
      setState({ status: 'anonymous', user: null });
    }
  }

  const ready = loadSession();

  return {
    getState(): AuthControllerState {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    ready(): Promise<void> {
      return ready;
    },

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
      setState({ status: 'anonymous', user: null });
    },

    async updateProfile(input: { name: string }): Promise<void> {
      const { user } = await json<SessionResponse>(
        await fetch(`${basePath}/user`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(input),
        }),
      );
      setState({ status: user ? 'authenticated' : 'anonymous', user });
    },

    refresh(): Promise<void> {
      return loadSession();
    },
  };
}
