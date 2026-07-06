#!/usr/bin/env node
/**
 * Precompila todos los ficheros .flow de dev-auth a .flow.js usando el CLI
 * de flowmark. Se engancha en [build] command de wrangler.toml.
 *
 * Limitación temporal (hasta Fase 4): requiere el binario `flowmark` instalado
 * (p. ej. `cargo install --path crates/flowmark-cli` en el repo flowmark).
 */
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = resolve(process.cwd());
const SRC_DIR = join(ROOT, 'src');
const RUNTIME_MODULE = '@flowview/runtime';

function findFlowFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFlowFiles(path));
    } else if (extname(entry.name) === '.flow') {
      results.push(path);
    }
  }
  return results;
}

async function compileFile(flowPath) {
  const outputPath = `${flowPath}.js`;
  const displayName = relative(ROOT, flowPath).replaceAll(sep, '/');

  const { stdout } = await execFileAsync(
    'flowmark',
    [
      'compile',
      flowPath,
      '--runtime',
      RUNTIME_MODULE,
      '--display-name',
      displayName,
    ],
    { encoding: 'utf8' },
  );

  let existing;
  try {
    existing = readFileSync(outputPath, 'utf8');
  } catch {
    existing = undefined;
  }

  if (existing === stdout) {
    return { outputPath, changed: false };
  }

  writeFileSync(outputPath, stdout, 'utf8');
  return { outputPath, changed: true };
}

let files;
try {
  files = findFlowFiles(SRC_DIR);
} catch (error) {
  console.error('[flowmark] Failed to scan src/', error.message);
  process.exit(1);
}

if (files.length === 0) {
  console.log('[flowmark] No .flow files found in src/');
  process.exit(0);
}

const results = await Promise.all(
  files.map(async (flowPath) => {
    const displayName = relative(ROOT, flowPath).replaceAll(sep, '/');
    try {
      const { outputPath, changed } = await compileFile(flowPath);
      const outputRelative = relative(ROOT, outputPath).replaceAll(sep, '/');
      if (changed) {
        console.log(`[flowmark] ${displayName} -> ${outputRelative}`);
      } else {
        console.log(`[flowmark] ${displayName} (up to date)`);
      }
      return { ok: true };
    } catch (error) {
      console.error(`[flowmark] Failed to compile ${displayName}`);
      console.error(error.stderr || error.message);
      return { ok: false };
    }
  }),
);

if (results.some((r) => !r.ok)) {
  process.exit(1);
}
