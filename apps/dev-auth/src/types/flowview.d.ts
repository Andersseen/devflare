/**
 * Declaración de tipos para los módulos generados por flowview
 * (`scripts/compile-flow.mjs`).
 */
declare module '*.flow.js' {
  import type { RenderContext } from '@flowview/runtime';
  export function render(context?: RenderContext): string;
}
