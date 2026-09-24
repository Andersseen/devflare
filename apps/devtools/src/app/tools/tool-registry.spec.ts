import { TOOL_CATEGORIES, TOOLS, toolForUrl, toolsIn } from './tool-registry';

/** Page files that are routes but not tools. */
const NON_TOOL_PAGES = ['(home)', '[...not-found]'];

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

  it('resolves the tool owning a URL', () => {
    expect(toolForUrl('/palette')?.title).toBe('Cinematic Palette');
    expect(toolForUrl('/qr-generator?x=1#top')?.path).toBe('qr-generator');
    expect(toolForUrl('/')).toBeNull();
    expect(toolForUrl('/unknown')).toBeNull();
  });
});
