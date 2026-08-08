import { renderLayout } from './layout';
import { render as renderSignupBody } from './signup.flow.js';

export function renderSignupPage(appUrl?: string): string {
  return renderLayout({
    title: 'Sign Up',
    body: renderSignupBody({ appUrl: appUrl || '/' }),
  });
}
