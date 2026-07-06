import { renderLayout } from './layout';
import { render as renderForgotBody } from './forgot.flow.js';

export function renderForgotPage(): string {
  return renderLayout({
    title: 'Reset Password',
    body: renderForgotBody({}),
  });
}
