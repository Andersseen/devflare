import { test, expect, type Page } from '@playwright/test';

/** Every local tool: path, the card title on the home page, and its h1. */
const TOOLS = [
  { path: '/seo-simulator', card: 'SEO Simulator', heading: 'SEO Simulator' },
  { path: '/qr-generator', card: 'QR Code Studio', heading: 'QR Code Studio' },
  { path: '/curl-converter', card: 'cURL ↔ Fetch', heading: 'cURL ↔ Fetch' },
  {
    path: '/oauth-inspector',
    card: 'OAuth / OIDC Inspector',
    heading: 'OAuth / OIDC Inspector',
  },
  {
    path: '/security-headers',
    card: 'Security Headers',
    heading: 'Security Headers',
  },
  {
    path: '/wrangler-doctor',
    card: 'Wrangler Config Doctor',
    heading: 'Wrangler Config Doctor',
  },
  {
    path: '/data-converter',
    card: 'Data Converter',
    heading: 'Data Converter',
  },
  {
    path: '/screen-recorder',
    card: 'Screen Recorder',
    heading: 'Screen Recorder',
  },
  {
    path: '/og-generator',
    card: 'Social Card Designer',
    heading: 'Social Card Designer',
  },
  { path: '/palette', card: 'Cinematic Palette', heading: 'Cinematic Palette' },
  {
    path: '/bg-remover',
    card: 'Background Remover',
    heading: 'AI Background Remover',
  },
];

/** Collects uncaught page errors and any request to a same-origin API. */
function watch(page: Page) {
  const errors: string[] = [];
  const apiCalls: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiCalls.push(url.pathname);
  });

  return { errors, apiCalls };
}

test.describe('DevTools home', () => {
  test('separates local and connected tools, without asking who you are', async ({
    page,
  }) => {
    const { apiCalls } = watch(page);
    await page.goto('/');

    await expect(page).toHaveTitle(/DevTools/);
    for (const section of ['Local', 'Connected']) {
      await expect(
        page.getByRole('heading', { level: 2, name: section }),
      ).toBeVisible();
    }
    for (const category of ['Web', 'Security', 'Cloud', 'Data', 'Media']) {
      await expect(
        page.getByRole('heading', { level: 3, name: category }),
      ).toBeVisible();
    }
    for (const tool of TOOLS) {
      await expect(page.getByRole('link', { name: tool.card })).toBeVisible();
    }
    for (const name of ['Short Links', 'Domain Inspector']) {
      await expect(page.getByRole('link', { name })).toBeVisible();
    }

    // Auth stays quiet: no auth UI and not even a session lookup on home.
    await expect(page.locator('dev-auth-user-button')).toHaveCount(0);
    await expect(page.locator('dev-auth-sign-in')).toHaveCount(0);
    expect(apiCalls).toEqual([]);
  });

  test('the old URL Shortener address moves to Short Links', async ({
    page,
  }) => {
    await page.goto('/url-shortener');
    await page.waitForURL('**/short-links');
  });

  test('an unknown path lands on the home page', async ({ page }) => {
    await page.goto('/does-not-exist');
    await page.waitForURL((url) => url.pathname === '/');
    await expect(
      page.getByRole('heading', { level: 1, name: /Small utilities/ }),
    ).toBeVisible();
  });
});

test.describe('every local tool', () => {
  for (const tool of TOOLS) {
    test(`${tool.card} opens from the home page`, async ({ page }) => {
      const { errors, apiCalls } = watch(page);

      await page.goto('/');
      await page.getByRole('link', { name: tool.card }).click();

      await page.waitForURL(`**${tool.path}`);
      await expect(
        page.getByRole('heading', { level: 1, name: tool.heading }),
      ).toBeVisible();
      // The tool strip marks where you are.
      await expect(
        page
          .getByRole('navigation', { name: 'Tools' })
          .locator('[aria-current="page"]'),
      ).toHaveCount(1);

      expect(errors).toEqual([]);
      expect(apiCalls).toEqual([]);
    });

    test(`${tool.card} renders on a direct load`, async ({ page }) => {
      const { errors } = watch(page);

      const response = await page.goto(tool.path);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole('heading', { level: 1, name: tool.heading }),
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test.describe('tools work client-side', () => {
  test('Data Converter turns JSON into CSV and back', async ({ page }) => {
    await page.goto('/data-converter');

    const [json, csv] = [
      page.locator('volt-textarea textarea').nth(0),
      page.locator('volt-textarea textarea').nth(1),
    ];

    await json.fill('[{"name":"Ada","year":1815}]');
    await page.getByRole('button', { name: /JSON → CSV/ }).click();
    await expect(csv).toHaveValue('name,year\nAda,1815');

    await json.fill('');
    await csv.fill('name,year\nGrace,1906');
    await page.getByRole('button', { name: /CSV → JSON/ }).click();
    await expect(json).toHaveValue(/"name": "Grace"/);
  });

  test('QR Code Studio draws a code and downloads a PNG', async ({ page }) => {
    await page.goto('/qr-generator');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await expect
      .poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.width))
      .toBeGreaterThan(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download PNG/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('qrcode.png');
  });
});

test.describe('new local tools work in the tab', () => {
  test('OAuth Inspector checks a URL, decodes a JWT and derives PKCE', async ({
    page,
  }) => {
    const { apiCalls, errors } = watch(page);
    await page.goto('/oauth-inspector');

    await page
      .getByRole('textbox', { name: 'Authorization URL' })
      .fill(
        'https://auth.example.com/authorize?client_id=app&response_type=code&redirect_uri=https%3A%2F%2Fapp.example%2Fcb',
      );
    await expect(page.getByText('No PKCE.', { exact: false })).toBeVisible();

    await page.getByRole('tab', { name: 'JWT' }).click();
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user-1', exp: 1 }),
    ).toString('base64url');
    await page
      .getByRole('textbox', { name: 'Token' })
      .fill(`eyJhbGciOiJIUzI1NiJ9.${payload}.c2ln`);
    await expect(page.getByText('not verified')).toBeVisible();
    await expect(page.getByText(/Expired/)).toBeVisible();

    await page.getByRole('tab', { name: 'PKCE' }).click();
    await page
      .getByRole('textbox', { name: 'code_verifier' })
      .fill('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    await expect(
      page.getByText('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'),
    ).toBeVisible();

    expect(apiCalls).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Wrangler Doctor reports drift and generates an Env interface', async ({
    page,
  }) => {
    const { apiCalls } = watch(page);
    await page.goto('/wrangler-doctor');
    await page
      .getByLabel('Wrangler configuration')
      .fill(
        [
          'name = "x"',
          'main = "src/index.ts"',
          'compatibility_date = "2026-01-01"',
          '[[kv_namespaces]]',
          'binding = "CACHE"',
          'id = "abc"',
          '[env.production]',
          'name = "x"',
        ].join('\n'),
      );
    await expect(
      page.getByText(
        /"kv_namespaces" is set at the top level but not in env.production/,
      ),
    ).toBeVisible();
    await expect(page.getByText('CACHE: KVNamespace;')).toBeVisible();
    expect(apiCalls).toEqual([]);
  });

  test('Security Headers analyses pasted headers', async ({ page }) => {
    const { apiCalls } = watch(page);
    await page.goto('/security-headers');
    await page
      .getByLabel('Response headers')
      .fill(
        "content-security-policy: script-src 'self' 'unsafe-inline'\nx-frame-options: DENY",
      );
    await expect(
      page.getByText('script-src allows inline scripts'),
    ).toBeVisible();
    await expect(page.getByText('X-Frame-Options: DENY')).toBeVisible();
    expect(apiCalls).toEqual([]);
  });

  test('cURL ↔ Fetch converts both ways', async ({ page }) => {
    const { apiCalls } = watch(page);
    await page.goto('/curl-converter');
    await page
      .getByLabel('curl command')
      .fill(
        `curl https://api.example.com -H 'Content-Type: application/json' -d '{"a":1}'`,
      );
    await expect(page.getByTestId('conversion-output')).toContainText(
      'body: JSON.stringify(',
    );

    await page.getByRole('tab', { name: 'Fetch → cURL' }).click();
    await page
      .getByLabel('fetch() call')
      .fill('fetch("https://x.example/a", { method: "DELETE" })');
    await expect(page.getByTestId('conversion-output')).toHaveText(
      'curl -X DELETE -L https://x.example/a',
    );
    expect(apiCalls).toEqual([]);
  });
});
