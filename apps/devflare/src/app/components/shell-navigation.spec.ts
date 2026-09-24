import {
  SETTINGS_ITEM,
  SHELL_SECTIONS,
  sectionForUrl,
} from './shell-navigation';

describe('shell navigation', () => {
  it('makes Projects the primary section', () => {
    expect(SHELL_SECTIONS[0].id).toBe('projects');
    expect(SHELL_SECTIONS[0].link).toBe('/');
  });

  it('resolves the section owning a URL', () => {
    expect(sectionForUrl('/').id).toBe('projects');
    expect(sectionForUrl('/projects/imageryx').id).toBe('projects');
    expect(sectionForUrl('/settings?tab=identity').id).toBe('projects');
    expect(sectionForUrl('/cloud').id).toBe('cloud');
    expect(sectionForUrl('/cloud/workers/devflare').id).toBe('cloud');
  });

  it('exposes no browser utilities or SDK showcase', () => {
    // DevTools is its own app (apps/devtools) and the DevAuth SDK showcase is
    // an internal route; neither belongs in the project hub's navigation.
    const links = [
      ...SHELL_SECTIONS.flatMap((section) => [
        section.link,
        ...section.matches,
        ...section.groups.flatMap((group) =>
          group.items.map((item) => item.link),
        ),
      ]),
      SETTINGS_ITEM.link,
    ];

    for (const link of links) {
      expect(link).not.toMatch(/^\/tools(\/|$)/);
      expect(link).not.toMatch(/^\/dev-auth-sdk/);
    }
    expect(SHELL_SECTIONS.map((section) => section.id)).toEqual([
      'projects',
      'cloud',
    ]);
  });
});
