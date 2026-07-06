#!/usr/bin/env node
/**
 * Watcher de desarrollo para plantillas .flow.
 * Corre junto a `wrangler dev`: recompila el .flow que se edita sin reiniciar
 * el worker (wrangler recarga al detectar cambios en los .flow.js generados).
 */
import { execFileSync } from 'node:child_process';
import { watch } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const SRC_DIR = join(ROOT, 'src');

function compileAll() {
  try {
    execFileSync('node', ['scripts/compile-flow.mjs'], { stdio: 'inherit' });
  } catch {
    // Los errores ya se imprimen por el script hijo; no salimos.
  }
}

console.log('[flowmark:watch] Starting watcher on src/...');
compileAll();

let debounceTimer;
const watcher = watch(SRC_DIR, { recursive: true }, (eventType, filename) => {
  if (!filename || extname(filename) !== '.flow') {
    return;
  }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`[flowmark:watch] ${eventType}: ${filename}`);
    compileAll();
  }, 100);
});

process.on('SIGINT', () => {
  console.log('\n[flowmark:watch] Stopping watcher');
  watcher.close();
  process.exit(0);
});
