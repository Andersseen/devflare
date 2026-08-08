import { renderLayout } from './layout';
import { render as renderLoginBody } from './login.flow.js';

export function renderLoginPage(appUrl?: string): string {
  return renderLayout({
    title: 'Sign In',
    body: renderLoginBody({ appUrl: appUrl || '/' }),
  });
}
