#!/usr/bin/env node
/**
 * Precompila todos los ficheros .flow de dev-auth a .flow.js usando el CLI
 * de flowmark. Se engancha en [build] command de wrangler.toml.
 *
 * Limitación temporal (hasta Fase 4): requiere el binario `flowmark` instalado
 * (p. ej. `cargo install --path crates/flowmark-cli` en el repo flowmark).
 */
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = resolve(process.cwd());
const SRC_DIR = join(ROOT, 'src');
const RUNTIME_MODULE = '@flowview/runtime';

/**
 * Is every .flow.js present and at least as new as its .flow source?
 *
 * This lets a machine without the `flowmark` binary (CI, a fresh clone) still
 * build, because the compiled .flow.js files are committed. It is a staleness
 * check, not a blanket skip: if a .flow was edited without recompiling, the
 * outputs are stale and we must fail rather than silently deploy old pages.
 */
function outputsAreCurrent(flowFiles) {
  return flowFiles.every((flowPath) => {
    try {
      return statSync(`${flowPath}.js`).mtimeMs >= statSync(flowPath).mtimeMs;
    } catch {
      return false;
    }
  });
}

async function flowmarkAvailable() {
  try {
    await execFileAsync('flowmark', ['--version'], { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

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

// wrangler runs this as its [build] command, so it also executes on CI and on
// any machine without the Rust CLI installed.
if (!(await flowmarkAvailable())) {
  if (outputsAreCurrent(files)) {
    console.log(
      `[flowmark] binary not found — using the ${files.length} committed .flow.js files (all newer than their sources).`,
    );
    process.exit(0);
  }

  console.error(
    '[flowmark] binary not found AND the .flow.js outputs are stale.',
  );
  console.error(
    'A .flow file changed without being recompiled, so building now',
  );
  console.error('would ship outdated pages. Either install the CLI:');
  console.error(
    '  cargo install --path crates/flowmark-cli   # in the flowmark repo',
  );
  console.error(
    'then run `pnpm --filter @devflare/dev-auth build:flow`, or commit the',
  );
  console.error('regenerated .flow.js files from a machine that has it.');
  process.exit(1);
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
