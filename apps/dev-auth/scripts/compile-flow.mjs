#!/usr/bin/env node
/**
 * Precompila todos los ficheros .flow de dev-auth a .flow.js.
 * Se engancha en [build] command de wrangler.toml.
 *
 * Usa `@flowview/compiler`, el compilador WASM publicado en npm. Antes esto
 * llamaba al binario Rust `flowview` por execFile, lo que obligaba a
 * `cargo install` en cada máquina y en CI; para sobrevivir a las máquinas sin
 * él había que commitear los .flow.js junto a un manifiesto de hashes que
 * detectase outputs obsoletos. Con el compilador en npm el binario ya no hace
 * falta en ningún sitio, así que el manifiesto desapareció: cada build compila
 * de verdad y nunca puede quedarse desincronizado.
 *
 * Los .flow.js siguen commiteados porque los importan los módulos de página
 * (`./login.flow.js`), que es lo que empaqueta wrangler.
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

  let existing;
  try {
    existing = readFileSync(outputPath, 'utf8');
  } catch {
    existing = undefined;
  }

  if (existing === result.code) {
    console.log(`[flowview] ${name} (up to date)`);
    return true;
  }

  writeFileSync(outputPath, result.code, 'utf8');
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

// Secuencial a propósito: son 6 ficheros y el WASM es síncrono, así que
// paralelizar sólo desordenaría la salida.
const ok = files.map(compileFile).every(Boolean);
if (!ok) {
  process.exit(1);
}
