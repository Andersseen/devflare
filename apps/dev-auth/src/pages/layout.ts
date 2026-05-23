/**
 * Layout base para todas las páginas de auth.
 * Incluye CDN de @andersseen/web-components, layout, motion e iconos.
 */
export interface LayoutOptions {
  title: string;
  body: string;
  scripts?: string;
}

export function renderLayout(options: LayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en" data-color="devflare">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)} — DevFlare Auth</title>

    <!-- Web Components -->
    <script type="module" src="https://unpkg.com/@andersseen/web-components@latest/dist/web-components/web-components.esm.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/@andersseen/web-components@latest/dist/web-components/web-components.css" />

    <!-- Layout & Motion -->
    <link rel="stylesheet" href="https://unpkg.com/@andersseen/layout@latest/dist/layout.css" />
    <link rel="stylesheet" href="https://unpkg.com/@andersseen/motion@latest/style.css" />
    <script type="module">
      import { initMotion } from 'https://unpkg.com/@andersseen/motion@latest/dist/index.js';
      import { registerAllIcons } from 'https://unpkg.com/@andersseen/icon@latest/dist/index.js';
      registerAllIcons();
      initMotion();
    </script>

    <style>
      :root {
        --primary: 243 75% 59%;
        --primary-foreground: 0 0% 100%;
        --background: 226 30% 98%;
        --foreground: 224 71% 4%;
        --card: 0 0% 100%;
        --card-foreground: 224 71% 4%;
        --border: 220 13% 91%;
        --input: 220 13% 91%;
        --ring: 243 75% 59%;
        --radius: 0.5rem;
        --muted: 220 14% 96%;
        --muted-foreground: 220 9% 46%;
        --destructive: 0 84% 60%;
        --destructive-foreground: 0 0% 100%;
        --success: 142 71% 45%;
        --success-foreground: 0 0% 100%;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --primary: 234 89% 74%;
          --primary-foreground: 229 50% 6%;
          --background: 229 50% 6%;
          --foreground: 226 100% 97%;
          --card: 229 50% 8%;
          --card-foreground: 226 100% 97%;
          --border: 229 30% 15%;
          --input: 229 30% 15%;
          --ring: 234 89% 74%;
          --muted: 229 30% 12%;
          --muted-foreground: 220 9% 60%;
        }
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: hsl(var(--background));
        color: hsl(var(--foreground));
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      a {
        color: hsl(var(--primary));
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }

      /* Ensure cards don't exceed viewport on mobile */
      and-card {
        max-width: 400px;
        width: 100%;
      }
    </style>
  </head>
  <body and-layout="vertical justify:center align:center gap:lg p:lg">
    <and-toast id="toaster"></and-toast>
    ${options.body}
    ${options.scripts ?? ''}
  </body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
