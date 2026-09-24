import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  BINDING_KINDS,
  ENVIRONMENT_KEYS,
  NON_INHERITED_KEYS,
  TOP_LEVEL_ONLY_KEYS,
  WranglerConfigError,
  WranglerDoctor,
  detectFormat,
} from './wrangler-doctor.service';

const doctor = new WranglerDoctor();
const today = new Date('2026-09-24T00:00:00Z');

function codes(text: string): string[] {
  return doctor.inspect(text, undefined, today).issues.map((i) => i.code);
}

const VALID_TOML = `
name = "shop"
main = "src/index.ts"
compatibility_date = "2026-05-23"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "shop-db"
database_id = "1c9e6a3e-5b0e-4d6b-9a52-6d4f0f3f7a11"

[[kv_namespaces]]
binding = "CACHE"
id = "a1b2c3d4e5f6"

[[r2_buckets]]
binding = "FILES"
bucket_name = "shop-files"

[vars]
PUBLIC_URL = "https://shop.example"

[env.production]
name = "shop"

[[env.production.d1_databases]]
binding = "DB"
database_name = "shop-db"
database_id = "1c9e6a3e-5b0e-4d6b-9a52-6d4f0f3f7a11"

[[env.production.kv_namespaces]]
binding = "CACHE"
id = "a1b2c3d4e5f6"

[[env.production.r2_buckets]]
binding = "FILES"
bucket_name = "shop-files"

[env.production.vars]
PUBLIC_URL = "https://shop.example"
`;

describe('Wrangler Doctor — parsing', () => {
  it('detects TOML and JSONC', () => {
    expect(detectFormat('name = "x"')).toBe('toml');
    expect(detectFormat('// comment\n{ "name": "x" }')).toBe('jsonc');
    expect(detectFormat('# comment\nname = "x"')).toBe('toml');
  });

  it('reports a clean config without errors or warnings', () => {
    const report = doctor.inspect(VALID_TOML, undefined, today);
    expect(report.format).toBe('toml');
    expect(report.workerName).toBe('shop');
    expect(report.compatibilityFlags).toEqual(['nodejs_compat']);
    expect(report.issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(report.environments.map((e) => e.scope)).toEqual([
      'top level',
      'env.production',
    ]);
    expect(report.environments[0].bindings).toEqual([
      { name: 'DB', kind: 'D1', tsType: 'D1Database', detail: 'shop-db' },
      {
        name: 'CACHE',
        kind: 'KV',
        tsType: 'KVNamespace',
        detail: 'a1b2c3d4e5f6',
      },
      { name: 'FILES', kind: 'R2', tsType: 'R2Bucket', detail: 'shop-files' },
    ]);
  });

  it('reads wrangler.jsonc with comments and trailing commas', () => {
    const report = doctor.inspect(
      `{
        // the worker
        "name": "api",
        "compatibility_date": "2026-01-01",
        "main": "src/index.ts",
        "durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "Room" }] },
        "queues": { "producers": [{ "binding": "JOBS", "queue": "jobs" }] },
        "services": [{ "binding": "AUTH", "service": "auth-worker" }],
      }`,
      undefined,
      today,
    );
    expect(report.format).toBe('jsonc');
    expect(
      report.environments[0].bindings.map((b) => `${b.kind}:${b.name}`),
    ).toEqual(['Queue:JOBS', 'Durable Object:ROOMS', 'Service:AUTH']);
  });

  it('points at the line of a TOML or JSON syntax error', () => {
    try {
      doctor.inspect('name = "x"\nmain = \n', 'toml');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WranglerConfigError);
      expect((error as WranglerConfigError).line).toBe(2);
    }
    expect(() => doctor.inspect('{ "name": "x", }}', 'jsonc')).toThrow(
      /line 1/,
    );
    expect(() => doctor.inspect('[1, 2]', 'jsonc')).toThrow(/JSON object/);
    expect(() => doctor.inspect('   ')).toThrow(/empty/);
  });

  it('rejects duplicate keys in TOML at parse time', () => {
    expect(() => doctor.inspect('name = "a"\nname = "b"', 'toml')).toThrow(
      WranglerConfigError,
    );
  });
});

describe('Wrangler Doctor — diagnostics', () => {
  it('requires compatibility_date and validates its format', () => {
    expect(codes('name = "x"\nmain = "i.ts"')).toContain(
      'missing-compatibility-date',
    );
    expect(
      codes('name = "x"\nmain = "i.ts"\ncompatibility_date = "2026–05–23"'),
    ).toContain('invalid-compatibility-date');
    expect(
      codes('name = "x"\nmain = "i.ts"\ncompatibility_date = "2027-01-01"'),
    ).toContain('future-compatibility-date');
  });

  it('flags duplicate binding names across kinds, vars included', () => {
    const list = codes(`
      name = "x"
      main = "i.ts"
      compatibility_date = "2026-01-01"
      [[d1_databases]]
      binding = "DATA"
      database_name = "d"
      [[kv_namespaces]]
      binding = "DATA"
      id = "k"
      [vars]
      DATA = "oops"
    `);
    expect(list.filter((c) => c === 'duplicate-binding')).toHaveLength(1);
    const issue = doctor
      .inspect(
        'name="x"\nmain="i"\ncompatibility_date="2026-01-01"\n[[r2_buckets]]\nbinding="B"\nbucket_name="b"\n[[r2_buckets]]\nbinding="B"\nbucket_name="c"',
        'toml',
        today,
      )
      .issues.find((i) => i.code === 'duplicate-binding');
    expect(issue?.message).toMatch(/B is bound more than once \(R2, R2\)/);
  });

  it('flags duplicate vars in JSON, which silently keeps the last', () => {
    const report = doctor.inspect(
      '{ "name": "x", "main": "i", "compatibility_date": "2026-01-01", "vars": { "A": "1", "A": "2" } }',
      'jsonc',
      today,
    );
    const issue = report.issues.find((i) => i.code === 'duplicate-key');
    expect(issue).toMatchObject({ level: 'error' });
    expect(issue?.message).toContain('vars.A');
  });

  it('reports sections not inherited by an environment', () => {
    const report = doctor.inspect(
      `name="x"\nmain="i"\ncompatibility_date="2026-01-01"
       [[d1_databases]]\nbinding="DB"\ndatabase_name="d"\ndatabase_id="abc"
       [vars]\nA="1"
       [env.staging]\nname="x-staging"`,
      'toml',
      today,
    );
    const drift = report.issues.filter((i) => i.code === 'not-inherited');
    expect(drift.map((i) => i.message)).toEqual([
      expect.stringContaining(
        '"vars" is set at the top level but not in env.staging',
      ),
      expect.stringContaining(
        '"d1_databases" is set at the top level but not in env.staging',
      ),
    ]);
    // The per-binding warning is not repeated when the whole section is gone.
    expect(report.issues.some((i) => i.code === 'missing-in-env')).toBe(false);
  });

  it('reports per-binding drift in both directions', () => {
    const list = doctor.inspect(
      `name="x"\nmain="i"\ncompatibility_date="2026-01-01"
       [[kv_namespaces]]\nbinding="CACHE"\nid="a"
       [[kv_namespaces]]\nbinding="SESSIONS"\nid="b"
       [env.production]
       [[env.production.kv_namespaces]]\nbinding="CACHE"\nid="c"
       [[env.production.kv_namespaces]]\nbinding="FLAGS"\nid="d"`,
      'toml',
      today,
    ).issues;
    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-in-env',
          scope: 'env.production',
          message:
            'SESSIONS exists at the top level but not in env.production.',
        }),
        expect.objectContaining({
          code: 'only-in-env',
          message: expect.stringContaining('FLAGS'),
        }),
      ]),
    );
  });

  it('notices a binding that changes kind between environments', () => {
    expect(
      codes(`name="x"\nmain="i"\ncompatibility_date="2026-01-01"
        [[kv_namespaces]]\nbinding="STORE"\nid="a"
        [env.p]
        [[env.p.r2_buckets]]\nbinding="STORE"\nbucket_name="b"`),
    ).toContain('kind-drift');
  });

  it('checks required fields from the schema', () => {
    const report = doctor.inspect(
      `name="x"\nmain="i"\ncompatibility_date="2026-01-01"
       [[services]]\nbinding="AUTH"
       [[hyperdrive]]\nbinding="PG"`,
      'toml',
      today,
    );
    expect(
      report.issues
        .filter((i) => i.code === 'missing-field')
        .map((i) => i.message),
    ).toEqual([
      'Service binding services[0] is missing required "service".',
      'Hyperdrive binding hyperdrive[0] is missing required "id".',
    ]);
  });

  it('flags empty and placeholder ids, empty vars and secrets in vars', () => {
    const list = codes(`name="x"\nmain="i"\ncompatibility_date="2026-01-01"
      [[d1_databases]]\nbinding="DB"\ndatabase_name="d"\ndatabase_id=""
      [[kv_namespaces]]\nbinding="KV"\nid="<your-kv-id>"
      [vars]\nEMPTY=""\nSTRIPE_SECRET_KEY="sk_live_x"`);
    expect(list).toEqual(
      expect.arrayContaining([
        'empty-id',
        'placeholder-id',
        'empty-var',
        'secret-in-vars',
      ]),
    );
  });

  it('reports unknown keys as possible typos and misplaced env keys', () => {
    const list = doctor.inspect(
      'name="x"\nmain="i"\ncompatibility_date="2026-01-01"\ncompatability_flags=[]\n[env.p]\nkeep_vars=true',
      'toml',
      today,
    ).issues;
    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown-key',
          message: expect.stringContaining('compatability_flags'),
        }),
        expect.objectContaining({ code: 'unknown-env-key', level: 'warning' }),
      ]),
    );
  });

  it('notes a config with neither main nor assets', () => {
    expect(codes('name="x"\ncompatibility_date="2026-01-01"')).toContain(
      'no-entry-point',
    );
    expect(
      codes(
        'name="x"\ncompatibility_date="2026-01-01"\n[assets]\ndirectory="dist"',
      ),
    ).not.toContain('no-entry-point');
  });
});

describe('Wrangler Doctor — derived output', () => {
  it('generates an Env interface only for mapped bindings', () => {
    const report = doctor.inspect(
      `name="x"\nmain="i"\ncompatibility_date="2026-01-01"
       [assets]\ndirectory="dist"\nbinding="ASSETS"
       [[d1_databases]]\nbinding="DB"\ndatabase_name="d"
       [vars]\nURL="https://x"\nRETRIES=3\nFLAGS={ beta = true }`,
      'toml',
      today,
    );
    expect(report.envInterface).toBe(
      [
        'interface Env {',
        '  DB: D1Database;',
        '  ASSETS: Fetcher;',
        '  URL: string;',
        '  RETRIES: number;',
        '  // FLAGS: JSON var — type it by hand',
        '}',
      ].join('\n'),
    );
  });

  it('refuses to guess a type that differs between environments', () => {
    const report = doctor.inspect(
      `name="x"\nmain="i"\ncompatibility_date="2026-01-01"
       [[kv_namespaces]]\nbinding="STORE"\nid="a"
       [env.p]
       [[env.p.r2_buckets]]\nbinding="STORE"\nbucket_name="b"`,
      'toml',
      today,
    );
    expect(report.envInterface).toContain(
      '// STORE: differs between environments (KVNamespace / R2Bucket)',
    );
  });

  it('produces a copyable bindings summary', () => {
    const { summaryText } = doctor.inspect(VALID_TOML, 'toml', today);
    expect(summaryText).toContain(
      'Worker: shop · compatibility_date 2026-05-23',
    );
    expect(summaryText).toContain('[env.production]');
    expect(summaryText).toMatch(/D1\s+DB → shop-db/);
    expect(summaryText).toMatch(/var\s+PUBLIC_URL/);
  });

  it('inspects this repository’s own DevTools config without errors', () => {
    const text = readFileSync(`${__dirname}/../../../wrangler.toml`, 'utf8');
    const report = doctor.inspect(text, 'toml', today);
    expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(report.environments[0].bindings.map((b) => b.name)).toEqual([
      'DB',
      'AUTH_RATE_LIMITER',
      'MUTATION_RATE_LIMITER',
      'INSPECT_RATE_LIMITER',
      'ASSETS',
    ]);
  });
});

/**
 * The rule tables above are only as good as their source. These read the JSON
 * schema Wrangler publishes and the Workers type definitions, so an upgrade
 * that renames a field or type fails here instead of in a user's report.
 */
describe('Wrangler Doctor — pinned to Wrangler’s schema', () => {
  const require = createRequire(__filename);
  const schema = JSON.parse(
    readFileSync(require.resolve('wrangler/config-schema.json'), 'utf8'),
  ) as {
    definitions: Record<
      string,
      { properties?: Record<string, SchemaNode>; required?: string[] }
    >;
  };
  interface SchemaNode {
    $ref?: string;
    type?: string;
    description?: string;
    required?: string[];
    items?: SchemaNode;
    properties?: Record<string, SchemaNode>;
  }
  const defs = schema.definitions;
  const envProps = defs['RawEnvironment'].properties ?? {};
  const resolve = (node: SchemaNode): SchemaNode =>
    node.$ref ? (defs[node.$ref.split('/').pop() ?? ''] as SchemaNode) : node;

  it('knows exactly the schema’s environment keys', () => {
    expect([...ENVIRONMENT_KEYS].sort()).toEqual(Object.keys(envProps).sort());
  });

  it('knows exactly the schema’s top-level-only keys', () => {
    const top = Object.keys(defs['RawConfig'].properties ?? {}).filter(
      (k) => !(k in envProps),
    );
    expect([...TOP_LEVEL_ONLY_KEYS].sort()).toEqual(top.sort());
  });

  it('lists exactly the keys the schema says are not inherited', () => {
    const notInherited = Object.entries(envProps)
      .filter(([, node]) =>
        /not automatically inherited/.test(node.description ?? ''),
      )
      .map(([key]) => key);
    expect([...NON_INHERITED_KEYS].sort()).toEqual(notInherited.sort());
  });

  it.each(BINDING_KINDS.map((spec) => [spec.path.join('.'), spec] as const))(
    '%s: name field and required fields match the schema',
    (_, spec) => {
      let node = resolve(envProps[spec.path[0]]);
      for (const key of spec.path.slice(1))
        node = resolve(node.properties?.[key] ?? {});
      const item = resolve(spec.shape === 'array' ? (node.items ?? {}) : node);

      expect(Object.keys(item.properties ?? {})).toContain(spec.nameField);
      expect([...(item.required ?? [])].sort()).toEqual(
        [...spec.required].sort(),
      );
    },
  );

  it('maps only to types that exist in @cloudflare/workers-types', () => {
    const types = readFileSync(
      require.resolve('@cloudflare/workers-types/index.d.ts'),
      'utf8',
    );
    for (const spec of BINDING_KINDS.filter((s) => s.tsType)) {
      expect(types).toMatch(
        new RegExp(`(interface|class|type) ${spec.tsType}\\b`),
      );
    }
  });
});
