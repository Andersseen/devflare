/**
 * Framework-agnostic browser session controller for *this application's* own
 * auth routes — never the identity provider.
 *
 * The host application's server completes OAuth/OIDC with `@dev-auth/core`
 * and leaves behind its own cookie session. This client only reads and mutates
 * that same-origin session API.
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

export interface AuthUserWire {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

export interface AuthControllerError {
  code: string;
  message: string;
  status?: number;
}

export interface AuthControllerState {
  status: AuthStatus;
  user: AuthUser | null;
  error: AuthControllerError | null;
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
  /** Removes listeners and prevents later requests from mutating state. */
  dispose(): void;
}

export const DEFAULT_BASE_PATH = '/api/auth';

interface SessionResponse {
  user: AuthUserWire | null;
}

interface ErrorPayload {
  statusMessage?: string;
  message?: string;
  code?: string;
}

export class AuthControllerRequestError
  extends Error
  implements AuthControllerError
{
  readonly code: string;
  readonly status?: number;

  constructor(error: AuthControllerError) {
    super(error.message);
    this.name = 'AuthControllerRequestError';
    this.code = error.code;
    this.status = error.status;
  }
}

/**
 * Same-origin return paths only. Absolute URLs and protocol-relative URLs are
 * collapsed to `/` before they can be echoed into a redirecting route.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  return trimmed;
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
  return `${basePath}/login?returnTo=${encodeURIComponent(
    safeReturnTo(returnTo),
  )}`;
}

function requestError(error: AuthControllerError): AuthControllerRequestError {
  return new AuthControllerRequestError(error);
}

async function errorFromResponse(
  response: Response,
): Promise<AuthControllerRequestError> {
  const body = (await response.json().catch(() => null)) as ErrorPayload | null;
  return requestError({
    code: body?.code ?? `http_${response.status}`,
    message:
      body?.statusMessage ??
      body?.message ??
      `Request failed with ${response.status}`,
    status: response.status,
  });
}

function errorFromUnknown(error: unknown): AuthControllerError {
  if (error instanceof AuthControllerRequestError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }
  if (error instanceof Error) {
    return { code: 'network_error', message: error.message };
  }
  return { code: 'unknown_error', message: 'Authentication request failed' };
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeUser(user: AuthUserWire): AuthUser {
  return {
    ...user,
    createdAt: toDate(user.createdAt),
    updatedAt: toDate(user.updatedAt),
  };
}

function normalizeSession(response: SessionResponse): {
  user: AuthUser | null;
} {
  return { user: response.user ? normalizeUser(response.user) : null };
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  return (await response.json()) as T;
}

export function createAuthController(
  config: AuthControllerConfig = {},
): AuthController {
  const basePath = config.basePath ?? DEFAULT_BASE_PATH;
  const listeners = new Set<(state: AuthControllerState) => void>();
  let state: AuthControllerState = {
    status: 'loading',
    user: null,
    error: null,
  };
  let generation = 0;
  let disposed = false;

  function setState(next: AuthControllerState): void {
    if (disposed) return;
    state = next;
    for (const listener of listeners) listener(state);
  }

  function isCurrent(current: number): boolean {
    return !disposed && current === generation;
  }

  async function loadSession(): Promise<void> {
    const current = ++generation;
    try {
      const response = await fetch(`${basePath}/session`, {
        credentials: 'include',
      });
      if (!isCurrent(current)) return;
      if (response.status === 401) {
        setState({ status: 'anonymous', user: null, error: null });
        return;
      }
      const { user } = normalizeSession(await json<SessionResponse>(response));
      if (!isCurrent(current)) return;
      setState({
        status: user ? 'authenticated' : 'anonymous',
        user,
        error: null,
      });
    } catch (error) {
      if (!isCurrent(current)) return;
      setState({
        status: 'error',
        user: state.user,
        error: errorFromUnknown(error),
      });
    }
  }

  const ready = loadSession();

  return {
    getState(): AuthControllerState {
      return state;
    },

    subscribe(listener) {
      if (disposed) return () => undefined;
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
      const current = ++generation;
      await json(
        await fetch(`${basePath}/logout`, {
          method: 'POST',
          credentials: 'include',
        }),
      );
      if (isCurrent(current)) {
        setState({ status: 'anonymous', user: null, error: null });
      }
    },

    async updateProfile(input: { name: string }): Promise<void> {
      const current = ++generation;
      const { user } = normalizeSession(
        await json<SessionResponse>(
          await fetch(`${basePath}/user`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(input),
          }),
        ),
      );
      if (isCurrent(current)) {
        setState({
          status: user ? 'authenticated' : 'anonymous',
          user,
          error: null,
        });
      }
    },

    refresh(): Promise<void> {
      return loadSession();
    },

    dispose(): void {
      disposed = true;
      generation++;
      listeners.clear();
    },
  };
}
