import { renderLayout } from './layout';
import { render as renderNotFoundBody } from './not-found.flow.js';

export function renderNotFoundPage(): string {
  return renderLayout({
    title: 'Page Not Found',
    body: renderNotFoundBody({}),
  });
}
