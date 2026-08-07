import { renderLayout } from './layout';
import { render as renderVerifyBody } from './verify.flow.js';

export function renderVerifyPage(error?: string): string {
  return renderLayout({
    title: 'Verify Email',
    body: renderVerifyBody({ error }),
  });
}
