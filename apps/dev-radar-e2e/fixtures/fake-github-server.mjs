// A tiny local stand-in for api.github.com, for the E2E suite only. DevRadar is
// pointed at it with GITHUB_API_BASE_URL (playwright.config.ts), so manual
// prompt preparation and the automation processor read deterministic fixtures
// and nothing ever reaches the real GitHub.
//
// It mirrors the seeded repositories (seed.mjs): `api` has failing CI, `web`
// has passing CI, `docs` has no CI at all. Read-only, like the real App.
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_GITHUB_PORT ?? 4410);

const HEADS = {
  api: 'a1b2c3d4e5f6a7b8',
  web: 'ffeeddccbbaa9988',
  docs: '1122334455667788',
};
const AGO = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

const RUNS = {
  api: [
    {
      id: 7001,
      workflow_id: 1,
      name: 'CI',
      event: 'push',
      head_branch: 'main',
      head_sha: HEADS.api,
      status: 'completed',
      conclusion: 'failure',
      run_number: 128,
      run_attempt: 1,
      html_url: 'https://github.com/e2e-org/api/actions/runs/7001',
      created_at: AGO(85),
      updated_at: AGO(80),
    },
  ],
  web: [
    {
      id: 7003,
      workflow_id: 2,
      name: 'Build',
      event: 'push',
      head_branch: 'main',
      head_sha: HEADS.web,
      status: 'completed',
      conclusion: 'success',
      run_number: 55,
      run_attempt: 1,
      html_url: 'https://github.com/e2e-org/web/actions/runs/7003',
      created_at: AGO(25),
      updated_at: AGO(20),
    },
  ],
  docs: [],
};

const FILES = {
  api: {
    'README.md': '# api\n\nBilling API.',
    'AGENTS.md': '# Agents\n\nUse pnpm.',
  },
  web: { 'README.md': '# web\n\nCustomer dashboard.' },
  docs: {},
};

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const commit = (sha, message) => ({
  sha,
  html_url: `https://github.com/e2e-org/x/commit/${sha}`,
  commit: {
    message,
    author: { name: 'Ada', date: AGO(30) },
    committer: { date: AGO(30) },
  },
  author: { login: 'ada' },
});

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const path = url.pathname;

  if (
    req.method === 'POST' &&
    /^\/app\/installations\/\d+\/access_tokens$/.test(path)
  ) {
    return send(res, 201, { token: 'ghs_e2e_fake_installation_token' });
  }
  if (req.method !== 'GET') return send(res, 405, { message: 'read-only' });

  const match = path.match(/^\/repos\/e2e-org\/(api|web|docs)\/(.+)$/);
  if (!match) return send(res, 404, { message: 'Not Found' });
  const [, name, rest] = match;
  const head = HEADS[name];

  if (rest === 'commits') {
    return send(res, 200, [
      commit(head, `feat: latest on ${name}`),
      commit('0000000', 'chore: before'),
    ]);
  }
  const pulls = rest.match(/^commits\/([^/]+)\/pulls$/);
  if (pulls) {
    return send(res, 200, [
      {
        number: 12,
        title: `Improve ${name}`,
        state: 'closed',
        html_url: `https://github.com/e2e-org/${name}/pull/12`,
        body: 'Fixture pull request.',
        merged_at: AGO(40),
        user: { login: 'ada' },
        base: { ref: 'main' },
      },
    ]);
  }
  if (rest.startsWith('commits/')) {
    return send(res, 200, {
      ...commit(head, `feat: latest on ${name}`),
      files: [{ filename: 'src/index.ts', status: 'modified' }],
    });
  }
  if (rest === 'actions/runs') {
    const sha = url.searchParams.get('head_sha');
    const runs = RUNS[name].filter((r) => !sha || r.head_sha === sha);
    return send(res, 200, { total_count: runs.length, workflow_runs: runs });
  }
  if (rest.startsWith('contents')) {
    const wanted = decodeURIComponent(rest.slice('contents'.length)).replace(
      /^\/+|\/+$/g,
      '',
    );
    const files = FILES[name];
    if (wanted in files) {
      return send(res, 200, {
        type: 'file',
        size: Buffer.byteLength(files[wanted]),
        encoding: 'base64',
        content: Buffer.from(files[wanted]).toString('base64'),
      });
    }
    if (wanted === '') {
      const entries = Object.keys(files).map((file) => ({
        name: file,
        path: file,
        type: 'file',
        size: Buffer.byteLength(files[file]),
      }));
      return entries.length
        ? send(res, 200, entries)
        : send(res, 404, { message: 'Not Found' });
    }
  }
  return send(res, 404, { message: 'Not Found' });
}).listen(port, '127.0.0.1', () => {
  console.log(`[fake-github] listening on http://127.0.0.1:${port}`);
});
