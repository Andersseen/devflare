/**
 * Declaración de tipos para los módulos generados por flowmark.
 * Se eliminará cuando el plugin de Vite o el compilador generen .d.ts
 * automáticamente (Fase 6 del plan).
 */
declare module '*.flow.js' {
  import type { RenderContext } from '@flowview/runtime';
  export function render(context?: RenderContext): string;
}
