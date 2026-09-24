import { Injectable } from '@angular/core';
import {
  parse as parseJsonc,
  parseTree,
  printParseErrorCode,
  type Node as JsonNode,
  type ParseError,
} from 'jsonc-parser';
import { parse as parseToml, TomlError } from 'smol-toml';

/**
 * Wrangler Config Doctor — reads a wrangler.toml / wrangler.json(c) in the
 * tab and reports what can be checked deterministically.
 *
 * Every rule traces back to Wrangler itself, not to memory:
 * - binding keys, required fields and "not inherited by environments" come
 *   from Wrangler's published JSON schema (node_modules/wrangler/
 *   config-schema.json); wrangler-doctor.service.spec.ts fails if the tables
 *   below drift from it;
 * - duplicate binding names (vars included), the compatibility_date format
 *   and "compatibility_date is required when publishing" are Wrangler's own
 *   validation messages.
 *
 * It is not a schema validator: unknown keys are only reported as possible
 * typos, and Wrangler remains the authority.
 */

export type ConfigFormat = 'toml' | 'jsonc';
export type IssueLevel = 'error' | 'warning' | 'info';

export interface DoctorIssue {
  level: IssueLevel;
  code: string;
  message: string;
  /** `top level` or `env.<name>`. */
  scope?: string;
}

export interface BindingKindSpec {
  /** Where the list lives, e.g. `['queues', 'producers']`. */
  path: string[];
  label: string;
  shape: 'array' | 'object';
  nameField: 'binding' | 'name';
  required: string[];
  /** @cloudflare/workers-types name; absent = not generated. */
  tsType?: string;
  /** A field that identifies the resource, shown next to the name. */
  detailField?: string;
  /** Fields holding a resource id, checked for empty/placeholder values. */
  idFields?: string[];
}

/** Checked against Wrangler's schema in the spec. */
export const BINDING_KINDS: BindingKindSpec[] = [
  {
    path: ['d1_databases'],
    label: 'D1',
    shape: 'array',
    nameField: 'binding',
    required: ['binding'],
    tsType: 'D1Database',
    detailField: 'database_name',
    idFields: ['database_id'],
  },
  {
    path: ['kv_namespaces'],
    label: 'KV',
    shape: 'array',
    nameField: 'binding',
    required: ['binding'],
    tsType: 'KVNamespace',
    detailField: 'id',
    idFields: ['id'],
  },
  {
    path: ['r2_buckets'],
    label: 'R2',
    shape: 'array',
    nameField: 'binding',
    required: ['binding'],
    tsType: 'R2Bucket',
    detailField: 'bucket_name',
    idFields: ['bucket_name'],
  },
  {
    path: ['queues', 'producers'],
    label: 'Queue',
    shape: 'array',
    nameField: 'binding',
    required: ['binding', 'queue'],
    tsType: 'Queue',
    detailField: 'queue',
  },
  {
    path: ['durable_objects', 'bindings'],
    label: 'Durable Object',
    shape: 'array',
    nameField: 'name',
    required: ['name', 'class_name'],
    tsType: 'DurableObjectNamespace',
    detailField: 'class_name',
  },
  {
    path: ['services'],
    label: 'Service',
    shape: 'array',
    nameField: 'binding',
    required: ['binding', 'service'],
    tsType: 'Fetcher',
    detailField: 'service',
  },
  {
    path: ['hyperdrive'],
    label: 'Hyperdrive',
    shape: 'array',
    nameField: 'binding',
    required: ['binding', 'id'],
    tsType: 'Hyperdrive',
    detailField: 'id',
    idFields: ['id'],
  },
  {
    path: ['vectorize'],
    label: 'Vectorize',
    shape: 'array',
    nameField: 'binding',
    required: ['binding', 'index_name'],
    tsType: 'VectorizeIndex',
    detailField: 'index_name',
  },
  {
    path: ['analytics_engine_datasets'],
    label: 'Analytics Engine',
    shape: 'array',
    nameField: 'binding',
    required: ['binding'],
    tsType: 'AnalyticsEngineDataset',
    detailField: 'dataset',
  },
  {
    path: ['ratelimits'],
    label: 'Rate limit',
    shape: 'array',
    nameField: 'name',
    required: ['name', 'namespace_id', 'simple'],
    tsType: 'RateLimit',
    detailField: 'namespace_id',
  },
  {
    path: ['workflows'],
    label: 'Workflow',
    shape: 'array',
    nameField: 'binding',
    required: ['binding', 'name', 'class_name'],
    tsType: 'Workflow',
    detailField: 'name',
  },
  {
    path: ['send_email'],
    label: 'Send Email',
    shape: 'array',
    nameField: 'name',
    required: ['name'],
    tsType: 'SendEmail',
  },
  {
    path: ['ai'],
    label: 'Workers AI',
    shape: 'object',
    nameField: 'binding',
    required: ['binding'],
    tsType: 'Ai',
  },
  {
    path: ['browser'],
    label: 'Browser',
    shape: 'object',
    nameField: 'binding',
    required: ['binding'],
    tsType: 'Fetcher',
  },
  {
    path: ['images'],
    label: 'Images',
    shape: 'object',
    nameField: 'binding',
    required: ['binding'],
    tsType: 'ImagesBinding',
  },
  {
    path: ['version_metadata'],
    label: 'Version metadata',
    shape: 'object',
    nameField: 'binding',
    required: ['binding'],
    tsType: 'WorkerVersionMetadata',
  },
  // `assets.binding` is optional: only an assets block that names a binding
  // exposes one to the Worker.
  {
    path: ['assets'],
    label: 'Assets',
    shape: 'object',
    nameField: 'binding',
    required: [],
    tsType: 'Fetcher',
    detailField: 'directory',
  },
];

/**
 * Keys the schema marks "not automatically inherited from the top level
 * environment" — they must be repeated in every `[env.*]` block. Checked
 * against the schema in the spec.
 */
export const NON_INHERITED_KEYS = [
  'define',
  'vars',
  'secrets',
  'durable_objects',
  'workflows',
  'cloudchamber',
  'containers',
  'kv_namespaces',
  'send_email',
  'queues',
  'r2_buckets',
  'd1_databases',
  'vectorize',
  'ai_search_namespaces',
  'ai_search',
  'hyperdrive',
  'services',
  'analytics_engine_datasets',
  'browser',
  'ai',
  'images',
  'media',
  'stream',
  'unsafe',
  'mtls_certificates',
  'tail_consumers',
  'streaming_tail_consumers',
  'dispatch_namespaces',
  'pipelines',
  'secrets_store_secrets',
  'artifacts',
  'unsafe_hello_world',
  'flagship',
  'ratelimits',
  'worker_loaders',
  'vpc_services',
  'vpc_networks',
];

/** Every key valid inside an environment (schema `RawEnvironment`). */
export const ENVIRONMENT_KEYS = [
  'name',
  'account_id',
  'compatibility_date',
  'compatibility_flags',
  'main',
  'find_additional_modules',
  'preserve_file_names',
  'base_dir',
  'workers_dev',
  'preview_urls',
  'routes',
  'route',
  'tsconfig',
  'jsx_factory',
  'jsx_fragment',
  'migrations',
  'triggers',
  'limits',
  'rules',
  'build',
  'no_bundle',
  'minify',
  'keep_names',
  'first_party_worker',
  'logfwdr',
  'logpush',
  'upload_source_maps',
  'placement',
  'assets',
  'observability',
  'cache',
  'compliance_region',
  'python_modules',
  'previews',
  ...NON_INHERITED_KEYS,
  'version_metadata',
];

/** Keys valid only at the top level (schema `RawConfig` minus environment). */
export const TOP_LEVEL_ONLY_KEYS = [
  '$schema',
  'env',
  'pages_build_output_dir',
  'legacy_env',
  'send_metrics',
  'dev',
  'site',
  'wasm_modules',
  'text_blobs',
  'data_blobs',
  'alias',
  'keep_vars',
];

const ENV_KEYS = new Set(ENVIRONMENT_KEYS);
const TOP_KEYS = new Set([...ENVIRONMENT_KEYS, ...TOP_LEVEL_ONLY_KEYS]);

export interface BindingInfo {
  name: string;
  kind: string;
  tsType?: string;
  detail?: string;
}

export interface VarInfo {
  name: string;
  /** `string`, `number`, `boolean` or `json` (object/array). */
  valueType: 'string' | 'number' | 'boolean' | 'json';
}

export interface EnvironmentSummary {
  scope: string;
  bindings: BindingInfo[];
  vars: VarInfo[];
}

export interface DoctorReport {
  format: ConfigFormat;
  workerName?: string;
  compatibilityDate?: string;
  compatibilityFlags: string[];
  environments: EnvironmentSummary[];
  issues: DoctorIssue[];
  envInterface: string;
  summaryText: string;
}

export class WranglerConfigError extends Error {
  constructor(
    message: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function at(config: Json, path: string[]): unknown {
  let value: unknown = config;
  for (const key of path) {
    if (!isObject(value)) return undefined;
    value = value[key];
  }
  return value;
}

export function detectFormat(text: string): ConfigFormat {
  const withoutComments = text
    .replace(/^\s*(#|\/\/).*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trimStart();
  return withoutComments.startsWith('{') ? 'jsonc' : 'toml';
}

function lineAndColumn(text: string, offset: number): [number, number] {
  const before = text.slice(0, offset).split('\n');
  return [before.length, before[before.length - 1].length + 1];
}

/** Keys that appear twice in one JSON object — legal for jsonc-parser (last
 * wins), silently surprising for a person. TOML rejects them at parse time. */
function duplicateJsonKeys(root: JsonNode | undefined): string[] {
  const found: string[] = [];
  const walk = (node: JsonNode, path: string) => {
    if (node.type === 'object') {
      const seen = new Set<string>();
      for (const property of node.children ?? []) {
        const [keyNode, valueNode] = property.children ?? [];
        const key = String(keyNode?.value);
        const childPath = path ? `${path}.${key}` : key;
        if (seen.has(key)) found.push(childPath);
        seen.add(key);
        if (valueNode) walk(valueNode, childPath);
      }
    } else if (node.type === 'array') {
      (node.children ?? []).forEach((child, i) => walk(child, `${path}[${i}]`));
    }
  };
  if (root) walk(root, '');
  return found;
}

const PLACEHOLDER =
  /^(?:<.*>|your[-_].*|replace[-_ ]?me.*|todo|xxx+|changeme|0{8}-0{4}-.*|placeholder.*)$/i;
const SECRET_NAME =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key)/i;

@Injectable({ providedIn: 'root' })
export class WranglerDoctor {
  parse(
    text: string,
    format: ConfigFormat,
  ): { config: Json; duplicateKeys: string[] } {
    if (!text.trim())
      throw new WranglerConfigError('The configuration is empty.');

    if (format === 'toml') {
      try {
        return { config: parseToml(text) as Json, duplicateKeys: [] };
      } catch (error) {
        if (error instanceof TomlError) {
          const firstLine = error.message.split('\n')[0];
          throw new WranglerConfigError(firstLine, error.line, error.column);
        }
        throw new WranglerConfigError('Could not parse TOML.');
      }
    }

    const errors: ParseError[] = [];
    const config = parseJsonc(text, errors, { allowTrailingComma: true });
    if (errors.length > 0) {
      const [line, column] = lineAndColumn(text, errors[0].offset);
      throw new WranglerConfigError(
        `${printParseErrorCode(errors[0].error)} at line ${line}, column ${column}.`,
        line,
        column,
      );
    }
    if (!isObject(config)) {
      throw new WranglerConfigError('The configuration must be a JSON object.');
    }
    const tree = parseTree(text, [], { allowTrailingComma: true });
    return { config, duplicateKeys: duplicateJsonKeys(tree) };
  }

  inspect(
    text: string,
    format: ConfigFormat = detectFormat(text),
    today = new Date(),
  ): DoctorReport {
    const { config, duplicateKeys } = this.parse(text, format);
    const issues: DoctorIssue[] = [];

    for (const path of duplicateKeys) {
      issues.push({
        level:
          path.startsWith('vars.') || path.includes('.vars.')
            ? 'error'
            : 'warning',
        code: 'duplicate-key',
        message: `"${path}" is declared twice. JSON keeps the last value and silently drops the first.`,
      });
    }

    this.#checkTopLevel(config, issues, today);

    const scopes: { scope: string; body: Json }[] = [
      { scope: 'top level', body: config },
    ];
    if (config['env'] !== undefined) {
      if (!isObject(config['env'])) {
        issues.push({
          level: 'error',
          code: 'env-shape',
          message: '"env" must be a table/object of named environments.',
        });
      } else {
        for (const [name, body] of Object.entries(config['env'])) {
          if (!isObject(body)) {
            issues.push({
              level: 'error',
              code: 'env-shape',
              message: `env.${name} must be a table/object.`,
            });
            continue;
          }
          scopes.push({ scope: `env.${name}`, body });
          for (const key of Object.keys(body)) {
            if (!ENV_KEYS.has(key)) {
              issues.push({
                level: TOP_KEYS.has(key) ? 'warning' : 'info',
                code: 'unknown-env-key',
                scope: `env.${name}`,
                message: TOP_KEYS.has(key)
                  ? `"${key}" is only valid at the top level, not inside an environment.`
                  : `"${key}" is not a Wrangler setting — a typo?`,
              });
            }
          }
        }
      }
    }

    const environments = scopes.map(({ scope, body }) =>
      this.#summarize(scope, body, issues),
    );
    this.#checkDrift(scopes, environments, issues);

    const report: DoctorReport = {
      format,
      workerName:
        typeof config['name'] === 'string' ? config['name'] : undefined,
      compatibilityDate:
        typeof config['compatibility_date'] === 'string'
          ? config['compatibility_date']
          : undefined,
      compatibilityFlags: Array.isArray(config['compatibility_flags'])
        ? config['compatibility_flags'].filter(
            (f): f is string => typeof f === 'string',
          )
        : [],
      environments,
      issues: sortIssues(issues),
      envInterface: '',
      summaryText: '',
    };
    report.envInterface = this.generateEnvInterface(environments);
    report.summaryText = this.summaryText(report);
    return report;
  }

  #checkTopLevel(config: Json, issues: DoctorIssue[], today: Date): void {
    for (const key of Object.keys(config)) {
      if (!TOP_KEYS.has(key)) {
        issues.push({
          level: 'info',
          code: 'unknown-key',
          scope: 'top level',
          message: `"${key}" is not a Wrangler setting — a typo?`,
        });
      }
    }

    if (typeof config['name'] !== 'string' || !config['name']) {
      issues.push({
        level: 'warning',
        code: 'missing-name',
        scope: 'top level',
        message: 'No "name". `wrangler deploy` needs one (or --name).',
      });
    }

    const date = config['compatibility_date'];
    if (date === undefined) {
      issues.push({
        level: 'error',
        code: 'missing-compatibility-date',
        scope: 'top level',
        message:
          'No compatibility_date. Wrangler refuses to publish without one ("A compatibility_date is required when publishing").',
      });
    } else if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(new Date(date).getTime())
    ) {
      issues.push({
        level: 'error',
        code: 'invalid-compatibility-date',
        scope: 'top level',
        message: `compatibility_date should be a valid ISO-8601 date (YYYY-MM-DD), got ${JSON.stringify(date)}.`,
      });
    } else if (new Date(`${date}T00:00:00Z`).getTime() > today.getTime()) {
      issues.push({
        level: 'info',
        code: 'future-compatibility-date',
        scope: 'top level',
        message: `compatibility_date ${date} is later than today.`,
      });
    }

    if (config['main'] === undefined && !isObject(config['assets'])) {
      issues.push({
        level: 'info',
        code: 'no-entry-point',
        scope: 'top level',
        message:
          'Neither "main" nor "assets" is set. Wrangler needs an entry point or an assets directory ("Missing entry-point to Worker script or to assets directory").',
      });
    }
  }

  #summarize(
    scope: string,
    body: Json,
    issues: DoctorIssue[],
  ): EnvironmentSummary {
    const bindings: BindingInfo[] = [];

    for (const spec of BINDING_KINDS) {
      const raw = at(body, spec.path);
      if (raw === undefined) continue;

      const entries = spec.shape === 'array' ? raw : [raw];
      if (
        !Array.isArray(entries) ||
        (spec.shape === 'object' && !isObject(raw))
      ) {
        issues.push({
          level: 'error',
          code: 'binding-shape',
          scope,
          message: `"${spec.path.join('.')}" should be ${spec.shape === 'array' ? 'a list' : 'a table/object'}.`,
        });
        continue;
      }

      entries.forEach((entry, index) => {
        const where =
          spec.shape === 'array'
            ? `${spec.path.join('.')}[${index}]`
            : spec.path.join('.');
        if (!isObject(entry)) {
          issues.push({
            level: 'error',
            code: 'binding-shape',
            scope,
            message: `${where} should be a table/object.`,
          });
          return;
        }
        for (const field of spec.required) {
          if (entry[field] === undefined) {
            issues.push({
              level: 'error',
              code: 'missing-field',
              scope,
              message: `${spec.label} binding ${where} is missing required "${field}".`,
            });
          }
        }
        for (const field of spec.idFields ?? []) {
          const value = entry[field];
          if (value === '') {
            issues.push({
              level: 'warning',
              code: 'empty-id',
              scope,
              message: `${where}.${field} is empty.`,
            });
          } else if (typeof value === 'string' && PLACEHOLDER.test(value)) {
            issues.push({
              level: 'warning',
              code: 'placeholder-id',
              scope,
              message: `${where}.${field} looks like a placeholder ("${value}").`,
            });
          }
        }

        const name = entry[spec.nameField];
        if (typeof name !== 'string' || !name) return;
        const detail = spec.detailField ? entry[spec.detailField] : undefined;
        bindings.push({
          name,
          kind: spec.label,
          tsType: spec.tsType,
          detail:
            typeof detail === 'string' || typeof detail === 'number'
              ? String(detail)
              : undefined,
        });
      });
    }

    const vars: VarInfo[] = [];
    const rawVars = body['vars'];
    if (rawVars !== undefined) {
      if (!isObject(rawVars)) {
        issues.push({
          level: 'error',
          code: 'vars-shape',
          scope,
          message: '"vars" should be a table/object.',
        });
      } else {
        for (const [name, value] of Object.entries(rawVars)) {
          const valueType =
            typeof value === 'string'
              ? 'string'
              : typeof value === 'number'
                ? 'number'
                : typeof value === 'boolean'
                  ? 'boolean'
                  : 'json';
          vars.push({ name, valueType });
          if (value === '') {
            issues.push({
              level: 'info',
              code: 'empty-var',
              scope,
              message: `vars.${name} is an empty string.`,
            });
          }
          if (
            SECRET_NAME.test(name) &&
            typeof value === 'string' &&
            value !== ''
          ) {
            issues.push({
              level: 'warning',
              code: 'secret-in-vars',
              scope,
              message: `vars.${name} looks like a secret. vars are plain text in the config and the dashboard; use \`wrangler secret put ${name}\` instead.`,
            });
          }
        }
      }
    }

    // Wrangler: "Bindings must have unique names" — vars included.
    const owners = new Map<string, string[]>();
    for (const { name, kind } of [
      ...bindings,
      ...vars.map((v) => ({ name: v.name, kind: 'var' })),
    ]) {
      owners.set(name, [...(owners.get(name) ?? []), kind]);
    }
    for (const [name, kinds] of owners) {
      if (kinds.length > 1) {
        issues.push({
          level: 'error',
          code: 'duplicate-binding',
          scope,
          message: `${name} is bound more than once (${kinds.join(', ')}). Wrangler rejects this: bindings must have unique names.`,
        });
      }
    }

    return { scope, bindings, vars };
  }

  #checkDrift(
    scopes: { scope: string; body: Json }[],
    environments: EnvironmentSummary[],
    issues: DoctorIssue[],
  ): void {
    const [root, ...named] = environments;
    if (named.length === 0) return;

    const rootBody = scopes[0].body;
    const rootNames = new Set([
      ...root.bindings.map((b) => b.name),
      ...root.vars.map((v) => v.name),
    ]);

    named.forEach((environment, i) => {
      const body = scopes[i + 1].body;
      const names = new Set([
        ...environment.bindings.map((b) => b.name),
        ...environment.vars.map((v) => v.name),
      ]);

      // A whole non-inherited section present at the top but absent here.
      for (const key of NON_INHERITED_KEYS) {
        if (rootBody[key] !== undefined && body[key] === undefined) {
          issues.push({
            level: 'warning',
            code: 'not-inherited',
            scope: environment.scope,
            message: `"${key}" is set at the top level but not in ${environment.scope}. Wrangler does not inherit it, so ${environment.scope} has none of it.`,
          });
        }
      }

      for (const name of rootNames) {
        const sectionMissing = [...NON_INHERITED_KEYS].some(
          (key) =>
            rootBody[key] !== undefined &&
            body[key] === undefined &&
            sectionHas(root, key, name),
        );
        if (!names.has(name) && !sectionMissing) {
          issues.push({
            level: 'warning',
            code: 'missing-in-env',
            scope: environment.scope,
            message: `${name} exists at the top level but not in ${environment.scope}.`,
          });
        }
      }
      for (const name of names) {
        if (!rootNames.has(name)) {
          issues.push({
            level: 'info',
            code: 'only-in-env',
            scope: environment.scope,
            message: `${name} exists only in ${environment.scope}. Local \`wrangler dev\` without --env will not have it.`,
          });
        }
      }

      // Same name, different kind.
      for (const binding of environment.bindings) {
        const rootBinding = root.bindings.find((b) => b.name === binding.name);
        if (rootBinding && rootBinding.kind !== binding.kind) {
          issues.push({
            level: 'warning',
            code: 'kind-drift',
            scope: environment.scope,
            message: `${binding.name} is ${rootBinding.kind} at the top level but ${binding.kind} in ${environment.scope}.`,
          });
        }
      }
    });
  }

  /** `interface Env`, only for bindings with a known workers-types type. */
  generateEnvInterface(environments: EnvironmentSummary[]): string {
    const types = new Map<string, Set<string>>();
    const skipped: string[] = [];

    for (const environment of environments) {
      for (const binding of environment.bindings) {
        if (!binding.tsType) {
          skipped.push(binding.name);
          continue;
        }
        types.set(
          binding.name,
          (types.get(binding.name) ?? new Set()).add(binding.tsType),
        );
      }
      for (const variable of environment.vars) {
        if (variable.valueType === 'json') {
          skipped.push(variable.name);
          continue;
        }
        types.set(
          variable.name,
          (types.get(variable.name) ?? new Set()).add(variable.valueType),
        );
      }
    }

    const lines = ['interface Env {'];
    for (const [name, set] of types) {
      const key = /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
      if (set.size > 1) {
        lines.push(
          `  // ${name}: differs between environments (${[...set].join(' / ')}) — not generated`,
        );
        continue;
      }
      lines.push(`  ${key}: ${[...set][0]};`);
    }
    for (const name of [...new Set(skipped)].filter((n) => !types.has(n))) {
      lines.push(`  // ${name}: JSON var — type it by hand`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  summaryText(
    report: Pick<
      DoctorReport,
      'workerName' | 'compatibilityDate' | 'environments'
    >,
  ): string {
    const lines = [
      `Worker: ${report.workerName ?? '(no name)'}${report.compatibilityDate ? ` · compatibility_date ${report.compatibilityDate}` : ''}`,
    ];
    for (const environment of report.environments) {
      lines.push('', `[${environment.scope}]`);
      if (environment.bindings.length === 0 && environment.vars.length === 0) {
        lines.push('  (no bindings)');
      }
      for (const binding of environment.bindings) {
        lines.push(
          `  ${binding.kind.padEnd(17)} ${binding.name}${binding.detail ? ` → ${binding.detail}` : ''}`,
        );
      }
      for (const variable of environment.vars) {
        lines.push(`  ${'var'.padEnd(17)} ${variable.name}`);
      }
    }
    return lines.join('\n');
  }
}

function sectionHas(
  summary: EnvironmentSummary,
  key: string,
  name: string,
): boolean {
  if (key === 'vars') return summary.vars.some((v) => v.name === name);
  const spec = BINDING_KINDS.find((s) => s.path[0] === key);
  return (
    !!spec &&
    summary.bindings.some((b) => b.name === name && b.kind === spec.label)
  );
}

const LEVEL_ORDER: Record<IssueLevel, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function sortIssues(issues: DoctorIssue[]): DoctorIssue[] {
  return [...issues].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level],
  );
}
