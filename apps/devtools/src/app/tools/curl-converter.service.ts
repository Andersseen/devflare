import { Injectable } from '@angular/core';
import { parse as parseJs } from 'acorn';

/**
 * cURL ↔ Fetch, both directions, in the tab.
 *
 * cURL → Fetch: a POSIX-shell lexer (quotes, escapes, `$'…'`, line
 * continuations) feeds an option parser that knows the flags that shape an
 * HTTP request. Flags that would change the request in a way `fetch` cannot
 * express become warnings rather than being dropped silently.
 *
 * Fetch → cURL: the snippet is parsed with a real JavaScript parser (acorn)
 * and only literal values are evaluated — strings, numbers, object/array
 * literals, `JSON.stringify(literal)`, `new URLSearchParams(literal)`,
 * `new Headers(literal)`. Anything else (a variable, a function call) is
 * reported as unsupported instead of guessed.
 */

export interface HttpRequestModel {
  url: string;
  method: string;
  headers: [string, string][];
  body?:
    | { kind: 'text'; text: string }
    | { kind: 'json'; value: unknown; text: string }
    | { kind: 'form'; fields: [string, string][] };
  /** fetch follows redirects by default; curl only with -L. */
  followRedirects: boolean;
  timeoutSeconds?: number;
}

export interface Conversion {
  output: string;
  warnings: string[];
}

export class ConversionError extends Error {}

// --- Shell lexer ------------------------------------------------------------

const SHELL_OPERATORS = /[|;&<>`]/;

/**
 * Splits a command line into words the way a POSIX shell would, for the
 * subset people actually paste: whitespace, '…', "…" with \-escapes, $'…'
 * ANSI-C strings (Chrome's "Copy as cURL"), backslash escapes and
 * backslash-newline continuations. Pipes, redirections, command substitution
 * and variables are refused — their result cannot be known here.
 */
export function shellSplit(input: string): string[] {
  const words: string[] = [];
  let current = '';
  let inWord = false;
  let i = 0;
  const text = input.replace(/\r\n/g, '\n');

  const push = () => {
    if (inWord) words.push(current);
    current = '';
    inWord = false;
  };

  while (i < text.length) {
    const char = text[i];

    if (char === '\\' && text[i + 1] === '\n') {
      i += 2;
      continue;
    }
    // Windows cmd "Copy as cURL" uses ^ for line continuation.
    if (char === '^' && text[i + 1] === '\n') {
      i += 2;
      continue;
    }
    if (/\s/.test(char)) {
      push();
      i++;
      continue;
    }
    if (char === '#' && !inWord) {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    if (char === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) throw new ConversionError('Unterminated single quote.');
      current += text.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }

    if (char === '$' && text[i + 1] === "'") {
      i += 2;
      inWord = true;
      let closed = false;
      while (i < text.length) {
        const c = text[i];
        if (c === "'") {
          closed = true;
          i++;
          break;
        }
        if (c === '\\') {
          const [value, consumed] = ansiEscape(text, i + 1);
          current += value;
          i += 1 + consumed;
          continue;
        }
        current += c;
        i++;
      }
      if (!closed) throw new ConversionError("Unterminated $'…' string.");
      continue;
    }

    if (char === '"') {
      i++;
      inWord = true;
      let closed = false;
      while (i < text.length) {
        const c = text[i];
        if (c === '"') {
          closed = true;
          i++;
          break;
        }
        if (c === '\\' && i + 1 < text.length) {
          const next = text[i + 1];
          if (next === '\n') {
            i += 2;
            continue;
          }
          if ('"\\$`'.includes(next)) {
            current += next;
            i += 2;
            continue;
          }
        }
        if (c === '$' && /[A-Za-z_{(]/.test(text[i + 1] ?? '')) {
          throw new ConversionError(
            'Shell variables and $(…) inside double quotes cannot be resolved here — paste the expanded command.',
          );
        }
        if (c === '`') {
          throw new ConversionError(
            'Command substitution (`…`) is not supported.',
          );
        }
        current += c;
        i++;
      }
      if (!closed) throw new ConversionError('Unterminated double quote.');
      continue;
    }

    if (char === '\\') {
      if (i + 1 < text.length) current += text[i + 1];
      inWord = true;
      i += 2;
      continue;
    }

    if (char === '$' && /[A-Za-z_{(]/.test(text[i + 1] ?? '')) {
      throw new ConversionError(
        'Shell variables and $(…) cannot be resolved here — paste the expanded command.',
      );
    }
    if (SHELL_OPERATORS.test(char)) {
      throw new ConversionError(
        `The shell operator "${char}" is not supported — paste a single curl command.`,
      );
    }

    current += char;
    inWord = true;
    i++;
  }
  push();
  return words;
}

function ansiEscape(text: string, i: number): [string, number] {
  const c = text[i];
  const simple: Record<string, string> = {
    n: '\n',
    t: '\t',
    r: '\r',
    '\\': '\\',
    "'": "'",
    '"': '"',
    a: '\x07',
    b: '\b',
    e: '\x1b',
    E: '\x1b',
    f: '\f',
    v: '\v',
    '?': '?',
  };
  if (c in simple) return [simple[c], 1];
  if (c === 'x') {
    const hex = /^[0-9a-fA-F]{1,2}/.exec(text.slice(i + 1))?.[0] ?? '';
    return [String.fromCharCode(parseInt(hex || '0', 16)), 1 + hex.length];
  }
  if (c === 'u' || c === 'U') {
    const hex =
      new RegExp(`^[0-9a-fA-F]{1,${c === 'u' ? 4 : 8}}`).exec(
        text.slice(i + 1),
      )?.[0] ?? '';
    return [String.fromCodePoint(parseInt(hex || '0', 16)), 1 + hex.length];
  }
  if (/[0-7]/.test(c)) {
    const oct = /^[0-7]{1,3}/.exec(text.slice(i))?.[0] ?? c;
    return [String.fromCharCode(parseInt(oct, 8)), oct.length];
  }
  return [`\\${c ?? ''}`, 1];
}

// --- cURL options ------------------------------------------------------------

/** Options that take a value, by every spelling. */
const VALUE_OPTIONS: Record<string, string> = {
  '-X': 'request',
  '--request': 'request',
  '-H': 'header',
  '--header': 'header',
  '-d': 'data',
  '--data': 'data',
  '--data-ascii': 'data',
  '--data-raw': 'data-raw',
  '--data-binary': 'data-binary',
  '--data-urlencode': 'data-urlencode',
  '--json': 'json',
  '-F': 'form',
  '--form': 'form',
  '--form-string': 'form-string',
  '-u': 'user',
  '--user': 'user',
  '-b': 'cookie',
  '--cookie': 'cookie',
  '-A': 'user-agent',
  '--user-agent': 'user-agent',
  '-e': 'referer',
  '--referer': 'referer',
  '--url': 'url',
  '-m': 'max-time',
  '--max-time': 'max-time',
  '--oauth2-bearer': 'bearer',
  '-o': 'output',
  '--output': 'output',
  '-x': 'proxy',
  '--proxy': 'proxy',
  '-T': 'upload-file',
  '--upload-file': 'upload-file',
  '--cert': 'cert',
  '-E': 'cert',
  '--key': 'key',
  '--cacert': 'cacert',
  '--connect-timeout': 'connect-timeout',
  '--retry': 'retry',
  '-w': 'write-out',
  '--write-out': 'write-out',
  '-c': 'cookie-jar',
  '--cookie-jar': 'cookie-jar',
  '--resolve': 'resolve',
  '--connect-to': 'resolve',
  '--max-redirs': 'max-redirs',
};

/** Flags without a value that the converter understands or can ignore. */
const FLAG_OPTIONS: Record<string, string> = {
  '-G': 'get',
  '--get': 'get',
  '-I': 'head',
  '--head': 'head',
  '-L': 'location',
  '--location': 'location',
  '-k': 'insecure',
  '--insecure': 'insecure',
  '--compressed': 'compressed',
  '-s': 'quiet',
  '--silent': 'quiet',
  '-S': 'quiet',
  '--show-error': 'quiet',
  '-v': 'quiet',
  '--verbose': 'quiet',
  '-i': 'quiet',
  '--include': 'quiet',
  '-f': 'quiet',
  '--fail': 'quiet',
  '--fail-with-body': 'quiet',
  '-#': 'quiet',
  '--progress-bar': 'quiet',
  '--http1.1': 'http-version',
  '--http2': 'http-version',
  '--http1.0': 'http-version',
  '-0': 'http-version',
  '--http3': 'http-version',
  '-N': 'quiet',
  '--no-buffer': 'quiet',
};

/** Warnings for options that change what is sent in a way fetch cannot copy. */
const UNSUPPORTED: Record<string, string> = {
  insecure:
    '-k/--insecure has no fetch equivalent: TLS errors will not be ignored.',
  output:
    '-o/--output: fetch returns the body to your code; write it yourself.',
  proxy: '-x/--proxy: fetch has no per-request proxy option.',
  'upload-file': '-T/--upload-file reads a local file; not converted.',
  cert: 'Client certificates (--cert/--key) have no fetch equivalent.',
  key: 'Client certificates (--cert/--key) have no fetch equivalent.',
  cacert: '--cacert: fetch uses the platform trust store.',
  resolve: '--resolve/--connect-to: fetch cannot pin a host to an address.',
  'cookie-jar': '-c/--cookie-jar: saving cookies is not converted.',
};

function splitShortCluster(word: string): string[] {
  // -sSL → -s -S -L; -XPOST → -X POST; -H'x: y' is already one word.
  if (!/^-[A-Za-z0-9#]{2,}$/.test(word)) return [word];
  const out: string[] = [];
  for (let i = 1; i < word.length; i++) {
    const flag = `-${word[i]}`;
    if (VALUE_OPTIONS[flag]) {
      out.push(flag);
      const rest = word.slice(i + 1);
      if (rest) out.push(rest);
      return out;
    }
    out.push(flag);
  }
  return out;
}

function basicAuth(credentials: string): string {
  const bytes = new TextEncoder().encode(credentials);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

function formEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

function headerName(headers: [string, string][], name: string): number {
  return headers.findIndex(([n]) => n.toLowerCase() === name.toLowerCase());
}

export function parseCurl(input: string): {
  request: HttpRequestModel;
  warnings: string[];
} {
  const words = shellSplit(input.trim());
  if (words.length === 0) throw new ConversionError('Paste a curl command.');
  if (words[0] !== 'curl') {
    throw new ConversionError('The command must start with "curl".');
  }

  const warnings: string[] = [];
  const headers: [string, string][] = [];
  const dataParts: string[] = [];
  const formFields: [string, string][] = [];
  let url: string | undefined;
  let method: string | undefined;
  let get = false;
  let head = false;
  let follow = false;
  let json = false;
  let binaryData = false;
  let timeoutSeconds: number | undefined;

  const args = words.slice(1).flatMap(splitShortCluster);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--') {
      url ??= args[i + 1];
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      if (url && url !== arg)
        warnings.push(`Only one URL is converted; ignored "${arg}".`);
      url ??= arg;
      continue;
    }

    const flag = FLAG_OPTIONS[arg];
    if (flag) {
      if (flag === 'get') get = true;
      else if (flag === 'head') head = true;
      else if (flag === 'location') follow = true;
      else if (flag === 'insecure') warnings.push(UNSUPPORTED['insecure']);
      else if (flag === 'compressed') {
        // fetch negotiates and decodes compression itself.
      } else if (flag === 'http-version') {
        warnings.push(`${arg}: fetch does not let you pick the HTTP version.`);
      }
      continue;
    }

    const option = VALUE_OPTIONS[arg];
    if (!option) {
      warnings.push(
        `Unsupported option ${arg} was ignored — check whether it changes the request.`,
      );
      continue;
    }
    const value = args[++i];
    if (value === undefined) throw new ConversionError(`${arg} needs a value.`);

    switch (option) {
      case 'request':
        method = value.toUpperCase();
        break;
      case 'header': {
        const colon = value.indexOf(':');
        if (colon <= 0) {
          warnings.push(
            `Header "${value}" has no "name: value" form; ignored.`,
          );
          break;
        }
        const name = value.slice(0, colon).trim();
        const headerValue = value.slice(colon + 1).trim();
        // `-H 'X-Foo;'` sends an empty header; `-H 'X-Foo:'` removes one.
        if (headerValue === '' && value.trimEnd().endsWith(':')) {
          warnings.push(
            `"${name}:" removes a default curl header; nothing to convert.`,
          );
          break;
        }
        headers.push([name, headerValue]);
        break;
      }
      case 'data':
      case 'data-raw':
      case 'data-binary':
        if (option !== 'data-raw' && value.startsWith('@')) {
          warnings.push(`${arg} ${value} reads a local file; not converted.`);
          break;
        }
        if (option === 'data-binary') binaryData = true;
        // Only a file read strips newlines (`-d @file`); literal data is sent as is.
        dataParts.push(value);
        break;
      case 'data-urlencode': {
        if (/^[^=]*@/.test(value) && !value.includes('=')) {
          warnings.push(
            `--data-urlencode ${value} reads a local file; not converted.`,
          );
          break;
        }
        const eq = value.indexOf('=');
        if (eq === -1) dataParts.push(formEncode(value));
        else if (eq === 0) dataParts.push(formEncode(value.slice(1)));
        else if (value.slice(0, eq).includes('@')) {
          warnings.push(
            `--data-urlencode ${value} reads a local file; not converted.`,
          );
        } else
          dataParts.push(
            `${value.slice(0, eq)}=${formEncode(value.slice(eq + 1))}`,
          );
        break;
      }
      case 'json':
        if (value.startsWith('@')) {
          warnings.push(`--json ${value} reads a local file; not converted.`);
          break;
        }
        json = true;
        dataParts.push(value);
        break;
      case 'form':
      case 'form-string': {
        const eq = value.indexOf('=');
        if (eq <= 0) {
          warnings.push(
            `Form field "${value}" has no name=value form; ignored.`,
          );
          break;
        }
        const name = value.slice(0, eq);
        let fieldValue = value.slice(eq + 1);
        if (option === 'form' && /^[@<]/.test(fieldValue)) {
          warnings.push(
            `-F ${name}=${fieldValue} uploads a local file; add a Blob/File yourself.`,
          );
          break;
        }
        if (
          option === 'form' &&
          /;\s*(type|filename|headers)=/.test(fieldValue)
        ) {
          warnings.push(
            `-F ${name}: ;type=/;filename= modifiers were dropped.`,
          );
          fieldValue = fieldValue.replace(
            /;\s*(type|filename|headers)=.*$/,
            '',
          );
        }
        formFields.push([name, fieldValue]);
        break;
      }
      case 'user':
        headers.push([
          'Authorization',
          basicAuth(value.includes(':') ? value : `${value}:`),
        ]);
        if (!value.includes(':'))
          warnings.push(
            '-u without ":password" prompts in curl; an empty password was used.',
          );
        break;
      case 'bearer':
        headers.push(['Authorization', `Bearer ${value}`]);
        break;
      case 'cookie':
        if (!value.includes('=')) {
          warnings.push(`-b ${value} reads a cookie file; not converted.`);
          break;
        }
        headers.push(['Cookie', value]);
        break;
      case 'user-agent':
        headers.push(['User-Agent', value]);
        break;
      case 'referer':
        headers.push(['Referer', value]);
        break;
      case 'url':
        url ??= value;
        break;
      case 'max-time':
        timeoutSeconds = Number(value);
        if (!Number.isFinite(timeoutSeconds)) {
          warnings.push(`--max-time ${value} is not a number; ignored.`);
          timeoutSeconds = undefined;
        }
        break;
      case 'connect-timeout':
      case 'retry':
      case 'write-out':
      case 'max-redirs':
        warnings.push(`${arg} has no fetch equivalent; ignored.`);
        break;
      default:
        warnings.push(UNSUPPORTED[option] ?? `${arg} was ignored.`);
    }
  }

  if (!url) throw new ConversionError('No URL found in the command.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    // curl assumes http:// for a bare host.
    url = `http://${url}`;
    warnings.push('The URL had no scheme; curl assumes http://.');
  }

  let body: HttpRequestModel['body'];
  if (formFields.length > 0 && dataParts.length > 0) {
    throw new ConversionError(
      'curl cannot mix -F with -d; neither can this converter.',
    );
  }

  if (get && dataParts.length > 0) {
    const parsed = new URL(url);
    parsed.search = parsed.search
      ? `${parsed.search}&${dataParts.join('&')}`
      : `?${dataParts.join('&')}`;
    url = parsed.toString();
  } else if (dataParts.length > 0) {
    const text = dataParts.join(binaryData || json ? '' : '&');
    if (json) {
      if (headerName(headers, 'content-type') === -1)
        headers.push(['Content-Type', 'application/json']);
      if (headerName(headers, 'accept') === -1)
        headers.push(['Accept', 'application/json']);
    } else if (headerName(headers, 'content-type') === -1) {
      headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
    }
    body = asJsonBody(text, headers) ?? { kind: 'text', text };
  } else if (formFields.length > 0) {
    body = { kind: 'form', fields: formFields };
    const contentType = headerName(headers, 'content-type');
    if (contentType !== -1) {
      warnings.push(
        'Content-Type was removed: fetch sets multipart/form-data with the boundary itself.',
      );
      headers.splice(contentType, 1);
    }
  }

  const resolvedMethod = method ?? (head ? 'HEAD' : body ? 'POST' : 'GET');

  if (headers.some(([name]) => name.toLowerCase() === 'cookie')) {
    warnings.push(
      'Browsers do not let fetch set a Cookie header (it is forbidden); it works in Node, Deno, Bun and Workers.',
    );
  }

  return {
    request: {
      url,
      method: resolvedMethod,
      headers,
      body,
      followRedirects: follow,
      timeoutSeconds,
    },
    warnings,
  };
}

function asJsonBody(
  text: string,
  headers: [string, string][],
): HttpRequestModel['body'] | undefined {
  const index = headerName(headers, 'content-type');
  if (index === -1 || !/json/i.test(headers[index][1])) return undefined;
  try {
    return { kind: 'json', value: JSON.parse(text), text };
  } catch {
    return undefined;
  }
}

// --- fetch output -----------------------------------------------------------

function js(value: unknown, indent = 0): string {
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : ' '.repeat(indent) + line))
    .join('\n');
}

export function toFetch(request: HttpRequestModel): string {
  const lines: string[] = [];
  const init: string[] = [];

  if (request.method !== 'GET') init.push(`  method: ${js(request.method)},`);
  if (request.headers.length > 0) {
    init.push('  headers: {');
    for (const [name, value] of request.headers)
      init.push(`    ${js(name)}: ${js(value)},`);
    init.push('  },');
  }

  if (request.body?.kind === 'json') {
    init.push(`  body: JSON.stringify(${js(request.body.value, 2)}),`);
  } else if (request.body?.kind === 'text') {
    init.push(`  body: ${js(request.body.text)},`);
  } else if (request.body?.kind === 'form') {
    lines.push('const body = new FormData();');
    for (const [name, value] of request.body.fields)
      lines.push(`body.append(${js(name)}, ${js(value)});`);
    lines.push('');
    init.push('  body,');
  }

  if (request.timeoutSeconds !== undefined) {
    init.push(
      `  signal: AbortSignal.timeout(${Math.round(request.timeoutSeconds * 1000)}),`,
    );
  }

  if (init.length === 0) {
    lines.push(`const response = await fetch(${js(request.url)});`);
  } else {
    lines.push(
      `const response = await fetch(${js(request.url)}, {`,
      ...init,
      '});',
    );
  }
  return lines.join('\n');
}

// --- fetch → cURL ------------------------------------------------------------

interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

class Unsupported extends ConversionError {}

function evaluate(node: AstNode, source: string): unknown {
  const snippet = () => source.slice(node.start, node.end);
  switch (node.type) {
    case 'Literal':
      if ((node as { regex?: unknown }).regex)
        throw new Unsupported(`Unsupported value: ${snippet()}`);
      return node['value'];
    case 'TemplateLiteral': {
      if ((node['expressions'] as unknown[]).length > 0) {
        throw new Unsupported(
          `Template literal with \${…} cannot be resolved: ${snippet()}`,
        );
      }
      const quasis = node['quasis'] as { value: { cooked: string } }[];
      return quasis.map((q) => q.value.cooked).join('');
    }
    case 'UnaryExpression':
      if (node['operator'] === '-')
        return -(evaluate(node['argument'] as AstNode, source) as number);
      throw new Unsupported(`Unsupported expression: ${snippet()}`);
    case 'ArrayExpression':
      return (node['elements'] as (AstNode | null)[]).map((element) => {
        if (!element || element.type === 'SpreadElement')
          throw new Unsupported(`Unsupported array: ${snippet()}`);
        return evaluate(element, source);
      });
    case 'ObjectExpression': {
      const result: Record<string, unknown> = {};
      for (const property of node['properties'] as AstNode[]) {
        if (
          property.type !== 'Property' ||
          property['computed'] ||
          property['kind'] !== 'init'
        ) {
          throw new Unsupported(
            `Unsupported object member: ${source.slice(property.start, property.end)}`,
          );
        }
        const key = property['key'] as AstNode;
        const name =
          key.type === 'Identifier'
            ? (key['name'] as string)
            : String(evaluate(key, source));
        if (property['shorthand'])
          throw new Unsupported(
            `Shorthand property "${name}" refers to a variable.`,
          );
        result[name] = evaluate(property['value'] as AstNode, source);
      }
      return result;
    }
    case 'CallExpression': {
      const callee = node['callee'] as AstNode;
      const args = node['arguments'] as AstNode[];
      if (
        callee.type === 'MemberExpression' &&
        (callee['object'] as AstNode)['name'] === 'JSON' &&
        (callee['property'] as AstNode)['name'] === 'stringify' &&
        args.length >= 1
      ) {
        const space = args[2]
          ? (evaluate(args[2], source) as number | string)
          : undefined;
        return { __json: evaluate(args[0], source), __space: space };
      }
      throw new Unsupported(`Function call cannot be evaluated: ${snippet()}`);
    }
    case 'NewExpression': {
      const callee = node['callee'] as AstNode;
      const args = node['arguments'] as AstNode[];
      const name = callee['name'];
      if (name === 'URLSearchParams') {
        const init = args[0] ? evaluate(args[0], source) : '';
        return {
          __search: new URLSearchParams(
            init as string | Record<string, string> | string[][],
          ).toString(),
        };
      }
      if (name === 'Headers') return args[0] ? evaluate(args[0], source) : {};
      if (name === 'URL' && args.length === 1)
        return String(evaluate(args[0], source));
      throw new Unsupported(`"new ${String(name)}(…)" cannot be converted.`);
    }
    case 'Identifier':
      if (node['name'] === 'undefined') return undefined;
      throw new Unsupported(
        `"${String(node['name'])}" is a variable; replace it with its value.`,
      );
    default:
      throw new Unsupported(`Unsupported construct: ${snippet()}`);
  }
}

function findFetchCall(node: unknown): AstNode | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as AstNode;
  if (n.type === 'CallExpression') {
    const callee = n['callee'] as AstNode;
    const isFetch =
      (callee.type === 'Identifier' && callee['name'] === 'fetch') ||
      (callee.type === 'MemberExpression' &&
        ['window', 'globalThis', 'self'].includes(
          String((callee['object'] as AstNode)['name']),
        ) &&
        (callee['property'] as AstNode)['name'] === 'fetch');
    if (isFetch) return n;
  }
  for (const value of Object.values(n)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (child && typeof child === 'object' && 'type' in child) {
        const found = findFetchCall(child);
        if (found) return found;
      }
    }
  }
  return null;
}

export function parseFetch(source: string): {
  request: HttpRequestModel;
  warnings: string[];
} {
  let program: unknown;
  try {
    program = parseJs(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    });
  } catch (error) {
    throw new ConversionError(
      `Not valid JavaScript: ${(error as Error).message}`,
    );
  }

  const call = findFetchCall(program);
  if (!call) throw new ConversionError('No fetch(…) call found.');

  const [urlNode, initNode] = call['arguments'] as AstNode[];
  if (!urlNode) throw new ConversionError('fetch() has no URL.');

  const warnings: string[] = [];
  const url = evaluate(urlNode, source);
  if (typeof url !== 'string')
    throw new ConversionError('The URL must be a string literal.');

  const init = initNode ? evaluate(initNode, source) : {};
  if (!init || typeof init !== 'object' || Array.isArray(init)) {
    throw new ConversionError('The second argument must be an object literal.');
  }
  const options = init as Record<string, unknown>;

  const headers: [string, string][] = [];
  const rawHeaders = options['headers'];
  if (Array.isArray(rawHeaders)) {
    for (const pair of rawHeaders) {
      if (!Array.isArray(pair) || pair.length !== 2)
        throw new ConversionError(
          'headers array must hold [name, value] pairs.',
        );
      headers.push([String(pair[0]), String(pair[1])]);
    }
  } else if (rawHeaders && typeof rawHeaders === 'object') {
    for (const [name, value] of Object.entries(rawHeaders))
      headers.push([name, String(value)]);
  }

  let body: HttpRequestModel['body'];
  const rawBody = options['body'];
  if (rawBody !== undefined && rawBody !== null) {
    if (typeof rawBody === 'string') {
      body = { kind: 'text', text: rawBody };
    } else if (typeof rawBody === 'object' && '__json' in rawBody) {
      const { __json, __space } = rawBody as {
        __json: unknown;
        __space?: number | string;
      };
      body = {
        kind: 'json',
        value: __json,
        text: JSON.stringify(__json, null, __space),
      };
    } else if (typeof rawBody === 'object' && '__search' in rawBody) {
      body = { kind: 'text', text: (rawBody as { __search: string }).__search };
      if (headerName(headers, 'content-type') === -1) {
        // fetch adds this for a URLSearchParams body.
        headers.push([
          'Content-Type',
          'application/x-www-form-urlencoded;charset=UTF-8',
        ]);
      }
    } else {
      throw new ConversionError(
        'The body must be a string, JSON.stringify(…) or new URLSearchParams(…).',
      );
    }
  }

  const method =
    typeof options['method'] === 'string'
      ? options['method'].toUpperCase()
      : 'GET';
  if (body && (method === 'GET' || method === 'HEAD')) {
    throw new ConversionError(`fetch rejects a body on a ${method} request.`);
  }
  if (body && headerName(headers, 'content-type') === -1) {
    // A string body makes fetch send text/plain; curl's -d default would be
    // form-encoded, so it is spelled out to send the same request.
    headers.push(['Content-Type', 'text/plain;charset=UTF-8']);
    warnings.push(
      'No Content-Type was set, so fetch sends text/plain;charset=UTF-8 — added explicitly. Did you mean application/json?',
    );
  }

  for (const key of Object.keys(options)) {
    if (['method', 'headers', 'body', 'redirect'].includes(key)) continue;
    if (key === 'credentials')
      warnings.push(
        `credentials: "${String(options[key])}" — pass cookies to curl yourself with -b.`,
      );
    else if (key === 'signal')
      warnings.push('signal was ignored; use --max-time for a timeout.');
    else warnings.push(`"${key}" has no curl equivalent; ignored.`);
  }

  const redirect = options['redirect'];
  return {
    request: {
      url,
      method,
      headers,
      body,
      followRedirects: redirect === undefined || redirect === 'follow',
    },
    warnings,
  };
}

export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_\-.,:/@%+=]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(request: HttpRequestModel): string {
  const parts = ['curl'];
  const hasBody = request.body !== undefined;

  if (request.method === 'HEAD' && !hasBody) parts.push('-I');
  else if (
    !(request.method === 'GET' && !hasBody) &&
    !(request.method === 'POST' && hasBody)
  ) {
    parts.push('-X', request.method);
  }
  if (request.followRedirects) parts.push('-L');

  parts.push(shellQuote(request.url));

  for (const [name, value] of request.headers)
    parts.push('-H', shellQuote(`${name}: ${value}`));

  if (request.body?.kind === 'form') {
    for (const [name, value] of request.body.fields)
      parts.push('--form-string', shellQuote(`${name}=${value}`));
  } else if (request.body) {
    // --data-raw: no @file interpretation, sent byte for byte.
    parts.push('--data-raw', shellQuote(request.body.text));
  }
  if (request.timeoutSeconds !== undefined)
    parts.push('--max-time', String(request.timeoutSeconds));

  return parts.join(' ');
}

@Injectable({ providedIn: 'root' })
export class CurlConverter {
  curlToFetch(input: string): Conversion {
    const { request, warnings } = parseCurl(input);
    return { output: toFetch(request), warnings };
  }

  fetchToCurl(input: string): Conversion {
    const { request, warnings } = parseFetch(input);
    return { output: toCurl(request), warnings };
  }
}
