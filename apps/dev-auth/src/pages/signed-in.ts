import { renderLayout } from './layout';
import { render as renderSignedInBody } from './signed-in.flow.js';

export interface SignedInUser {
  email: string;
  name?: string | null;
}

/**
 * What a direct visit to this service shows once there is a session.
 *
 * Deliberately not a dashboard and deliberately not a redirect into any
 * consumer application: dev-auth serves several of them, so "signed in here"
 * does not mean "signed in to DevFlare". It reports the provider session and
 * offers a way to end it, and nothing else.
 */
export function renderSignedInPage(user: SignedInUser): string {
  return renderLayout({
    title: 'Signed In',
    body: renderSignedInBody({ email: user.email, name: user.name ?? '' }),
  });
}
