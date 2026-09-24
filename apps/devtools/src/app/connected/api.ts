/**
 * Same-origin JSON calls to DevTools' own API — only ever used by connected
 * tools. Errors keep the server's status and fixed message so a page can tell
 * "sign in" (401) from "not allowed" (403), validation (400/409/422), rate
 * limiting (429) and everything else.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface ErrorBody {
  statusMessage?: string;
  message?: string;
  data?: { code?: string };
}

export async function apiRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers:
        init.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      'network',
      'Could not reach DevTools. Check your connection.',
    );
  }

  if (response.status === 204) return undefined as T;
  if (response.ok) return (await response.json()) as T;

  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const fallback =
    response.status === 429
      ? 'Too many requests — try again in a minute.'
      : response.status >= 500
        ? 'Something went wrong on our side.'
        : `Request failed (${response.status}).`;
  throw new ApiError(
    response.status,
    body?.data?.code ?? `http_${response.status}`,
    response.status >= 500
      ? fallback
      : (body?.statusMessage ?? body?.message ?? fallback),
  );
}
