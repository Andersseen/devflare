import { test, expect, type Page } from '@playwright/test';

/** Every migrated tool: path, the card title on the home page, and its h1. */
const TOOLS = [
  { path: '/seo-simulator', card: 'SEO Simulator', heading: 'SEO Simulator' },
  { path: '/qr-generator', card: 'QR Code Studio', heading: 'QR Code Studio' },
  { path: '/url-shortener', card: 'URL Shortener', heading: 'URL Shortener' },
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
  test('lists every tool by category, with no sign-in', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/DevTools/);
    for (const category of ['Web', 'Data', 'Media']) {
      await expect(
        page.getByRole('heading', { level: 2, name: category }),
      ).toBeVisible();
    }
    for (const tool of TOOLS) {
      await expect(page.getByRole('link', { name: tool.card })).toBeVisible();
    }

    // Anonymous by design: nothing in DevTools asks who you are.
    await expect(page.getByText(/sign in/i)).toHaveCount(0);
    await expect(page.locator('dev-auth-user-button')).toHaveCount(0);
  });

  test('an unknown path lands on the home page', async ({ page }) => {
    await page.goto('/does-not-exist');
    await page.waitForURL((url) => url.pathname === '/');
    await expect(
      page.getByRole('heading', { level: 1, name: /Small utilities/ }),
    ).toBeVisible();
  });
});

test.describe('every migrated tool', () => {
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
