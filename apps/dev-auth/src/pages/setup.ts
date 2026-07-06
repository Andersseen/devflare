import { renderLayout } from './layout';
import { render as renderSetupBody } from './setup.flow.js';

export function renderSetupPage(): string {
  return renderLayout({
    title: 'Cloudflare Setup',
    body: renderSetupBody({}),
  });
}
