import { renderLayout } from './layout';
import { render as renderSignupBody } from './signup.flow.js';

export function renderSignupPage(): string {
  return renderLayout({
    title: 'Sign Up',
    body: renderSignupBody({}),
  });
}
