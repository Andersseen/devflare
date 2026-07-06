import { renderLayout } from './layout';
import { render as renderLoginBody } from './login.flow.js';

export function renderLoginPage(): string {
  return renderLayout({
    title: 'Sign In',
    body: renderLoginBody({}),
  });
}
