import { renderLayout } from './layout';
import { render as renderConsentBody } from './consent.flow.js';

/**
 * The consent screen the OAuth provider requires.
 *
 * No client registered today can reach it: they are all my own applications and
 * the registry marks every one of them `skipConsent`, because the consent screen
 * exists to protect a user from third-party software and none is allowed to
 * register. It is implemented anyway so that the day a client does need consent,
 * the flow lands on a working screen instead of a 404.
 */
export function renderConsentPage(): string {
  return renderLayout({
    title: 'Authorize',
    body: renderConsentBody({}),
  });
}
