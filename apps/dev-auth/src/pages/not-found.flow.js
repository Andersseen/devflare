import { renderValue } from '@flowview/runtime';

export function render(context) {
  let output = '';
  output += '<and-card variant="elevated" padded and-layout="vertical gap:md align:center" and-motion="fade-in slide-in-up" and-motion-trigger="enter" and-motion-duration="600ms">\n\n  <and-icon name="search" size="48" color="hsl(var(--muted-foreground))"></and-icon>\n\n  <div and-layout="vertical gap:xs">\n    <h1 and-text="h1 align:center color:foreground">404</h1>\n    <p and-text="p align:center color:muted">This page doesn\'t exist or has been moved.</p>\n  </div>\n\n  <and-button onclick="window.location.href=\'/\'" variant="default">\n    <and-icon slot="start" name="home" size="16"></and-icon>\n    Go Home\n  </and-button>\n</and-card>';
  output += '\n';

  return output;
}
