#!/usr/bin/env node
/**
 * Compiles every .flow file under src/ to a sibling .flow.js, the same way
 * apps/dev-auth does (see its scripts/compile-flow.mjs) — @flowview/compiler
 * is the WASM build published on npm, so no Rust toolchain is required here
 * either. The .flow.js files stay committed because dev-auth-elements has no
 * separate library build step in this monorepo: consumers resolve
 * @org/dev-auth-elements straight to this package's TS source, and that
 * source imports the compiled .flow.js files directly.
 */
import { compileFlowview, FlowviewCompilerError } from '@flowview/compiler';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const SRC_DIR = join(ROOT, 'src');
const RUNTIME_MODULE = '@flowview/runtime';

function displayName(flowPath) {
  return relative(ROOT, flowPath).replaceAll(sep, '/');
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

function reportDiagnostics(name, diagnostics) {
  for (const d of diagnostics) {
    console.error(`[flowview] ${name}:${d.line}:${d.column} ${d.message}`);
  }
}

function compileFile(flowPath) {
  const name = displayName(flowPath);
  const outputPath = `${flowPath}.js`;

  let result;
  try {
    result = compileFlowview(readFileSync(flowPath, 'utf8'), {
      filename: name,
      runtimeImport: RUNTIME_MODULE,
    });
  } catch (error) {
    console.error(`[flowview] Failed to compile ${name}`);
    if (error instanceof FlowviewCompilerError) {
      reportDiagnostics(name, error.diagnostics);
    } else {
      console.error(error.message);
    }
    return false;
  }

  reportDiagnostics(name, result.warnings);

  // A sibling .d.ts (not an ambient *.flow.js module declaration) so
  // consumers outside this package's own tsconfig — e.g. @org/auth, which
  // compiles with `declaration: true` and hits this import transitively —
  // resolve a type for it too: TS looks up a same-named .d.ts next to a .js
  // import via module resolution, independent of any project's `include`.
  const declarationPath = `${outputPath.slice(0, -3)}.d.ts`;
  const declaration =
    'export declare function render(context: unknown): string;\n';

  let existing;
  try {
    existing = readFileSync(outputPath, 'utf8');
  } catch {
    existing = undefined;
  }

  if (existing === result.code) {
    console.log(`[flowview] ${name} (up to date)`);
    writeFileSync(declarationPath, declaration, 'utf8');
    return true;
  }

  writeFileSync(outputPath, result.code, 'utf8');
  writeFileSync(declarationPath, declaration, 'utf8');
  console.log(`[flowview] ${name} -> ${displayName(outputPath)}`);
  return true;
}

let files;
try {
  files = findFlowFiles(SRC_DIR);
} catch (error) {
  console.error('[flowview] Failed to scan src/', error.message);
  process.exit(1);
}

if (files.length === 0) {
  console.log('[flowview] No .flow files found in src/');
  process.exit(0);
}

const ok = files.map(compileFile).every(Boolean);
if (!ok) {
  process.exit(1);
}
