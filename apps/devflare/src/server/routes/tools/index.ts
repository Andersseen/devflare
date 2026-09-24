import { defineEventHandler, getRequestURL, sendRedirect } from 'h3';
import { devtoolsUrl, legacyToolRedirect } from '../../lib/legacy-tools';

/**
 * `/tools` and `/tools/*` are DevTools' URLs from before the split. They
 * forward to the standalone DevTools app when DEVTOOLS_URL is configured;
 * see ../../lib/legacy-tools.ts.
 */
export default defineEventHandler((event) =>
  sendRedirect(
    event,
    legacyToolRedirect(
      getRequestURL(event).pathname,
      devtoolsUrl(event.context),
    ),
    302,
  ),
);
