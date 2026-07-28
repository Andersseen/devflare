#!/usr/bin/env node
/**
 * Precompila todos los ficheros .flow de dev-auth a .flow.js usando el CLI
 * de flowmark. Se engancha en [build] command de wrangler.toml.
 *
 * Limitación temporal (hasta Fase 4): requiere el binario `flowmark` instalado
 * (p. ej. `cargo install --path crates/flowmark-cli` en el repo flowmark).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = resolve(process.cwd());
const SRC_DIR = join(ROOT, 'src');
const RUNTIME_MODULE = '@flowview/runtime';
const MANIFEST_PATH = join(ROOT, 'flow-manifest.json');

function manifestKey(flowPath) {
  return relative(ROOT, flowPath).replaceAll(sep, '/');
}

function hashSource(flowPath) {
  return createHash('sha256').update(readFileSync(flowPath)).digest('hex');
}

/**
 * Record the hash of every .flow source that produced the current .flow.js
 * outputs. Committed alongside them so a machine without the CLI can tell
 * whether those outputs still match their sources.
 */
function writeManifest(flowFiles) {
  const sources = {};
  for (const flowPath of [...flowFiles].sort()) {
    sources[manifestKey(flowPath)] = hashSource(flowPath);
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify({ sources }, null, 2)}\n`);
}

/**
 * Does every .flow.js exist and match the source it was compiled from?
 *
 * This lets a machine without the `flowmark` binary (CI, a fresh clone) still
 * build, because the compiled .flow.js files are committed. It is a staleness
 * check, not a blanket skip: if a .flow was edited without recompiling, the
 * outputs are stale and we must fail rather than silently deploy old pages.
 *
 * Staleness is decided by content hash, not mtime: git does not preserve
 * mtimes, so on a fresh checkout an output can easily land older than its
 * source and a timestamp comparison would fail at random.
 */
function outputsAreCurrent(flowFiles) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).sources;
  } catch {
    return false;
  }

  // A source added or removed since the manifest was written also makes it stale.
  if (!manifest || Object.keys(manifest).length !== flowFiles.length) {
    return false;
  }

  return flowFiles.every(
    (flowPath) =>
      existsSync(`${flowPath}.js`) &&
      manifest[manifestKey(flowPath)] === hashSource(flowPath),
  );
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
      `[flowmark] binary not found — using the ${files.length} committed .flow.js files (all matching their sources).`,
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

// Only now that every output is known-good does the manifest describe reality.
writeManifest(files);
