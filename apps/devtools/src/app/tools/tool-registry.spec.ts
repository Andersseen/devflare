import {
  TOOL_CATEGORIES,
  TOOLS,
  toolForUrl,
  toolsIn,
  toolsWithMode,
} from './tool-registry';

/** Page files that are routes but not tools. `url-shortener` only redirects
 * to `short-links`, which replaced it (spec 020). */
const NON_TOOL_PAGES = ['(home)', '[...not-found]', 'url-shortener'];

const pageFiles = Object.keys(import.meta.glob('../pages/*.page.ts')).map(
  (file) => file.replace('../pages/', '').replace('.page.ts', ''),
);

describe('tool registry', () => {
  it('has a page for every listed tool', () => {
    // A link without a page is exactly how three DevFlare tool links
    // (/tools/converter, /tools/recorder, /tools/shortener) silently fell
    // through to the not-found redirect before the split.
    for (const tool of TOOLS) {
      expect(pageFiles).toContain(tool.path);
    }
  });

  it('lists every tool page', () => {
    const toolPages = pageFiles.filter(
      (page) => !NON_TOOL_PAGES.includes(page),
    );
    expect(toolPages.sort()).toEqual(TOOLS.map((tool) => tool.path).sort());
  });

  it('uses unique paths and known categories', () => {
    const paths = TOOLS.map((tool) => tool.path);
    expect(new Set(paths).size).toBe(paths.length);

    const categories = TOOL_CATEGORIES.map((category) => category.id);
    for (const tool of TOOLS) {
      expect(categories).toContain(tool.category);
    }
  });

  it('puts every tool in exactly one category', () => {
    const grouped = TOOL_CATEGORIES.flatMap((category) => toolsIn(category.id));
    expect(grouped).toHaveLength(TOOLS.length);
  });

  it('marks exactly the server-backed tools as connected', () => {
    expect(toolsWithMode('connected').map((tool) => tool.path)).toEqual([
      'short-links',
      'domain-inspector',
    ]);
    expect(toolsWithMode('local')).toHaveLength(TOOLS.length - 2);
  });

  it('keeps "connected" a mode, never a category', () => {
    expect(TOOL_CATEGORIES.map((c) => c.id)).not.toContain('connected');
    expect(toolsIn('web', 'connected')).toHaveLength(2);
  });

  it('resolves the tool owning a URL', () => {
    expect(toolForUrl('/palette')?.title).toBe('Cinematic Palette');
    expect(toolForUrl('/qr-generator?x=1#top')?.path).toBe('qr-generator');
    expect(toolForUrl('/')).toBeNull();
    expect(toolForUrl('/unknown')).toBeNull();
  });
});
