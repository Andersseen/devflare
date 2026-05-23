import { renderLayout } from './layout';

export function renderNotFoundPage(): string {
  return renderLayout({
    title: 'Page Not Found',
    body: `
      <and-card variant="elevated" padded
        and-layout="vertical gap:md align:center"
        and-motion="fade-in slide-in-up"
        and-motion-trigger="enter"
        and-motion-duration="600ms">

        <and-icon name="search" size="48" color="hsl(var(--muted-foreground))"></and-icon>

        <div and-layout="vertical gap:xs">
          <h1 and-text="h1 align:center color:foreground">404</h1>
          <p and-text="p align:center color:muted">This page doesn't exist or has been moved.</p>
        </div>

        <and-button onclick="window.location.href='/'" variant="default">
          <and-icon slot="start" name="home" size="16"></and-icon>
          Go Home
        </and-button>
      </and-card>
    `,
  });
}
