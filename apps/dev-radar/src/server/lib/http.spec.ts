import type { H3Event } from 'h3';
import { createTestDb } from '../testing/test-db';

const testDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db', () => ({
  get db() {
    return testDb.current;
  },
}));

import type { SqlDatabase } from '../db';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
  requireSessionUser,
  userIsAllowed,
} from './http';
import { createSession } from './session-store';

interface FakeOptions {
  headers?: Record<string, string>;
  env?: Record<string, unknown>;
}

function fakeEvent({ headers = {}, env = {} }: FakeOptions = {}): H3Event {
  return {
    node: {
      req: {
        headers: { host: 'radar.test', ...headers },
        method: 'POST',
        url: '/',
        socket: {},
      },
      res: {},
    },
    context: { cloudflare: { env } },
  } as unknown as H3Event;
}

const status = async (promise: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof promise === 'function' ? promise() : promise);
    return 200;
  } catch (error) {
    return (error as { statusCode: number }).statusCode;
  }
};

describe('request guards', () => {
  let db: SqlDatabase;
  beforeEach(() => {
    ({ db } = createTestDb());
    testDb.current = db;
  });

  const cookieFor = async (user: { id: string; email: string }) => {
    const { token } = await createSession(db, {
      ...user,
      name: 'T',
      image: null,
    });
    return `dr_session=${token}`;
  };

  describe('authentication (401)', () => {
    it('refuses an anonymous request', async () => {
      expect(await status(requireSessionUser(fakeEvent()))).toBe(401);
      expect(await status(requireAllowedUser(fakeEvent()))).toBe(401);
    });

    it('refuses an unknown or forged session cookie', async () => {
      const event = fakeEvent({
        headers: { cookie: 'dr_session=forged-token' },
      });
      expect(await status(requireAllowedUser(event))).toBe(401);
    });

    it('does not accept another app’s session cookie names', async () => {
      const { token } = await createSession(db, {
        id: 'u',
        email: 'a@b.c',
        name: 'T',
        image: null,
      });
      for (const name of [
        'dt_session',
        'df_session',
        'better-auth.session_token',
      ]) {
        const event = fakeEvent({
          headers: { cookie: `${name}=${token}` },
          env: { DEVRADAR_ALLOWED_USERS: 'u' },
        });
        expect(await status(requireAllowedUser(event))).toBe(401);
      }
    });
  });

  describe('authorization (403)', () => {
    it('a valid DevAuth identity that is not on the allowlist is refused', async () => {
      const cookie = await cookieFor({ id: 'stranger', email: 'x@y.z' });
      const event = fakeEvent({
        headers: { cookie },
        env: { DEVRADAR_ALLOWED_USERS: 'owner-id' },
      });
      expect(await status(requireSessionUser(event))).toBe(200); // authenticated…
      expect(await status(requireAllowedUser(event))).toBe(403); // …but not authorized
    });

    it('fails closed when the allowlist is empty or unset', async () => {
      const cookie = await cookieFor({ id: 'owner', email: 'o@x.y' });
      for (const env of [
        {},
        { DEVRADAR_ALLOWED_USERS: '' },
        { DEVRADAR_ALLOWED_USERS: ' , ' },
      ]) {
        expect(
          await status(
            requireAllowedUser(fakeEvent({ headers: { cookie }, env })),
          ),
        ).toBe(403);
      }
    });

    it('admits an allowlisted user id or email', async () => {
      const cookie = await cookieFor({
        id: 'owner-id',
        email: 'Owner@Example.com',
      });
      const byId = fakeEvent({
        headers: { cookie },
        env: { DEVRADAR_ALLOWED_USERS: 'owner-id' },
      });
      const byEmail = fakeEvent({
        headers: { cookie },
        env: { DEVRADAR_ALLOWED_USERS: 'owner@example.com' },
      });
      expect(await status(requireAllowedUser(byId))).toBe(200);
      expect(await status(requireAllowedUser(byEmail))).toBe(200);
      expect(
        userIsAllowed(byId, {
          id: 'owner-id',
          email: '',
          name: '',
          image: null,
        }),
      ).toBe(true);
    });

    it('error responses carry fixed messages only', async () => {
      const event = fakeEvent();
      const error = (await requireAllowedUser(event).catch(
        (e: unknown) => e,
      )) as { statusMessage: string };
      expect(error.statusMessage).toBe('Sign in to use DevRadar');
    });
  });

  describe('CSRF (assertSameOriginJson)', () => {
    it('accepts a same-origin Origin header with JSON', () => {
      const event = fakeEvent({
        headers: {
          origin: 'http://radar.test',
          'content-type': 'application/json',
        },
      });
      expect(() => assertSameOriginJson(event)).not.toThrow();
    });

    it('accepts Sec-Fetch-Site: same-origin when no Origin is sent', () => {
      const event = fakeEvent({
        headers: {
          'sec-fetch-site': 'same-origin',
          'content-type': 'application/json',
        },
      });
      expect(() => assertSameOriginJson(event)).not.toThrow();
    });

    it('refuses a foreign Origin, and a request that declares nothing', async () => {
      const foreign = fakeEvent({
        headers: {
          origin: 'https://evil.test',
          'content-type': 'application/json',
        },
      });
      expect(await status(() => assertSameOriginJson(foreign))).toBe(403);
      expect(await status(() => assertSameOriginJson(fakeEvent()))).toBe(403);
    });

    it('refuses non-JSON bodies a plain HTML form could send', async () => {
      const event = fakeEvent({
        headers: {
          origin: 'http://radar.test',
          'content-type': 'application/x-www-form-urlencoded',
        },
      });
      expect(await status(() => assertSameOriginJson(event))).toBe(415);
      expect(() => assertSameOriginJson(event, false)).not.toThrow(); // bodyless POST
    });
  });

  describe('rate limiting', () => {
    it('answers 429 when the limiter says no, and allows when the binding is absent', async () => {
      const limited = fakeEvent({
        env: {
          MUTATION_RATE_LIMITER: { limit: async () => ({ success: false }) },
        },
      });
      expect(
        await status(enforceRateLimit(limited, 'MUTATION_RATE_LIMITER', 'u')),
      ).toBe(429);
      expect(
        await status(
          enforceRateLimit(fakeEvent(), 'MUTATION_RATE_LIMITER', 'u'),
        ),
      ).toBe(200);
    });
  });
});
