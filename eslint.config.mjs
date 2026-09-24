import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      // Vitest's HTML reporter emits <name>.ts.html files that the Angular
      // template parser then chokes on, plus its own bundled .js assets. Only
      // masked in CI because lint runs before test on a clean checkout.
      '**/coverage',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/.wrangler',
      '**/*.d.ts',
      // Compiled by flowview from the sibling .flow templates — machine output.
      '**/*.flow.js',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'scope:frontend',
              onlyDependOnLibsWithTags: ['scope:frontend', 'scope:shared'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            // `scope:backend` had no rule at all until now, so nothing enforced
            // the same layering the frontend already gets — closed as part of
            // the `domain:` work below, not a pre-existing decision.
            {
              sourceTag: 'scope:backend',
              onlyDependOnLibsWithTags: ['scope:backend', 'scope:shared'],
            },
            // `domain:*` is a second, independent tag dimension — bounded
            // contexts within the DevAuth ecosystem — layered on top of the
            // `scope:`/`type:` dimension above rather than replacing it. Both
            // sets of constraints apply at once: an import must satisfy every
            // rule that matches one of the source project's tags. See
            // docs/specs/013-dev-auth-modular-architecture.md for the full
            // rationale and the bounded-context map.
            {
              sourceTag: 'domain:dev-auth',
              onlyDependOnLibsWithTags: ['domain:dev-auth'],
            },
            {
              sourceTag: 'domain:dev-auth-sdk',
              onlyDependOnLibsWithTags: ['domain:dev-auth-sdk'],
            },
            {
              sourceTag: 'domain:cloudflare-connect',
              onlyDependOnLibsWithTags: [
                'domain:cloudflare-connect',
                'domain:shared',
              ],
            },
            // DevFlare (the project hub) and DevTools (browser utilities) are
            // separate products in one repo: neither may import the other, and
            // anything they genuinely share goes through a `domain:shared`
            // library. DevTools also gets no DevAuth SDK — it works anonymously
            // by design. See docs/specs/018-split-devtools-app.md.
            {
              sourceTag: 'domain:devflare',
              onlyDependOnLibsWithTags: [
                'domain:devflare',
                'domain:dev-auth-sdk',
                'domain:cloudflare-connect',
                'domain:shared',
              ],
            },
            {
              sourceTag: 'domain:devtools',
              onlyDependOnLibsWithTags: ['domain:devtools', 'domain:shared'],
            },
            {
              sourceTag: 'domain:shared',
              onlyDependOnLibsWithTags: ['domain:shared'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
