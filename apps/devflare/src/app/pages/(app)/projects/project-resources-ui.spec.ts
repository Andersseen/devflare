import {
  importProvidersFrom,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AlertCircle,
  Boxes,
  Database,
  ExternalLink,
  Globe,
  HardDrive,
  Link,
  Loader,
  Lock,
  LucideAngularModule,
  Unlink,
  Zap,
} from 'lucide-angular';
import {
  linkCandidates,
  ownershipIndex,
  resolveProjectResources,
  type CloudInventory,
  type CloudResourceRef,
  type Project,
  type ProjectResource,
  type ResolvedResource,
} from '@org/core';
import { LinkResourcesPanel } from './link-resources-panel';
import { ResourceList } from './resource-list';

/**
 * The two pieces of the project page that carry spec 019's promises to the
 * screen: every link is visible whatever Cloudflare says about it, and an
 * unreadable product is never presented as an empty one.
 */

function inventory(overrides: Partial<CloudInventory> = {}): CloudInventory {
  const worker = (name: string) => ({
    name,
    createdOn: '2026-09-01T00:00:00.000Z',
    modifiedOn: '2026-09-20T00:00:00.000Z',
    domains: [],
  });
  return {
    worker: { items: [worker('ally-api'), worker('ally-runner')], error: null },
    pages: {
      items: [
        {
          name: 'ally-web',
          subdomain: 'ally-web.pages.dev',
          domains: [],
          productionBranch: 'main',
          createdOn: '2026-09-01T00:00:00.000Z',
          repo: null,
          gitConnected: false,
          latestDeployment: null,
        },
      ],
      error: null,
    },
    d1: {
      items: [
        {
          id: 'd1-uuid',
          name: 'ally-db',
          createdAt: null,
          sizeBytes: 2048,
          tables: null,
        },
      ],
      error: null,
    },
    kv: { items: [{ id: 'kv-id', name: 'ally-cache' }], error: null },
    r2: {
      items: [
        {
          name: 'ally-reports',
          createdAt: '2026-09-01T00:00:00.000Z',
          location: null,
        },
      ],
      error: null,
    },
    ...overrides,
  };
}

let seq = 0;
function link(
  type: ProjectResource['type'],
  resourceId: string,
  projectId = 'ally',
): ProjectResource {
  seq += 1;
  return {
    id: `link-${seq}`,
    projectId,
    provider: 'cloudflare',
    type,
    resourceId,
    resourceName: resourceId,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      importProvidersFrom(
        LucideAngularModule.pick({
          AlertCircle,
          Boxes,
          Database,
          ExternalLink,
          Globe,
          HardDrive,
          Link,
          Loader,
          Lock,
          Unlink,
          Zap,
        }),
      ),
    ],
  });
});

async function renderList(resources: ResolvedResource[]) {
  const fixture = TestBed.createComponent(ResourceList);
  fixture.componentRef.setInput('resources', resources);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, element };
}

function rows(element: HTMLElement): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>('[data-testid="project-resource"]'),
  );
}

describe('ResourceList', () => {
  it('shows several Workers under Compute', async () => {
    const { element } = await renderList(
      resolveProjectResources(
        [link('worker', 'ally-api'), link('worker', 'ally-runner')],
        inventory(),
      ),
    );
    expect(element.textContent).toContain('Compute');
    expect(rows(element).map((row) => row.dataset['resourceType'])).toEqual([
      'worker',
      'worker',
    ]);
  });

  it('groups Pages, Worker, D1, R2 and KV into Web, Compute and Storage', async () => {
    const { element } = await renderList(
      resolveProjectResources(
        [
          link('kv', 'kv-id'),
          link('r2', 'ally-reports'),
          link('d1', 'd1-uuid'),
          link('worker', 'ally-api'),
          link('pages', 'ally-web'),
        ],
        inventory(),
      ),
    );
    const headings = Array.from(element.querySelectorAll('h3')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Web', 'Compute', 'Storage']);
    expect(rows(element)).toHaveLength(5);
    expect(
      rows(element).every(
        (row) => row.dataset['resourceState'] === 'available',
      ),
    ).toBe(true);
  });

  it('renders nothing for a project with no resources', async () => {
    const { element } = await renderList([]);
    expect(rows(element)).toHaveLength(0);
  });

  it('keeps a missing resource on screen, with a way to unlink it', async () => {
    const { element, fixture } = await renderList(
      resolveProjectResources([link('worker', 'deleted-worker')], inventory()),
    );
    const unlinked: ResolvedResource[] = [];
    fixture.componentInstance.unlink.subscribe((resource) =>
      unlinked.push(resource),
    );

    const [row] = rows(element);
    expect(row.dataset['resourceState']).toBe('missing');
    expect(row.textContent).toContain('deleted-worker');
    expect(row.textContent).toContain('Missing from Cloudflare account');
    // Nothing to open — Cloudflare has no such resource.
    expect(row.querySelector('a[aria-label^="Open"]')).toBeNull();

    Array.from(row.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Unlink deleted-worker'))
      ?.click();
    expect(unlinked.map((resource) => resource.name)).toEqual([
      'deleted-worker',
    ]);
  });

  it('says "Cannot verify" with the reason when permission is missing', async () => {
    const { element } = await renderList(
      resolveProjectResources(
        [link('r2', 'ally-reports')],
        inventory({
          r2: {
            items: [],
            error: 'Insufficient permissions (Cloudflare error 10000)',
          },
        }),
      ),
    );
    const [row] = rows(element);
    expect(row.dataset['resourceState']).toBe('unverifiable');
    expect(row.textContent).toContain('Cannot verify');
    expect(row.textContent).toContain('Insufficient permissions');
    expect(row.textContent).not.toContain('Missing');
  });

  it('offers no unlink for a discovered, unsaved resource', async () => {
    const fixture = TestBed.createComponent(ResourceList);
    fixture.componentRef.setInput('resources', [
      {
        link: null,
        type: 'worker',
        resourceId: 'ally-api',
        name: 'ally-api',
        state: 'available',
        reason: null,
        detail: null,
      } satisfies ResolvedResource,
    ]);
    fixture.componentRef.setInput('mode', 'discovered');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Unlink',
    );
  });
});

describe('LinkResourcesPanel', () => {
  function project(id: string, resources: ProjectResource[]): Project {
    return {
      id,
      userId: 'u',
      name: id === 'ally' ? 'Ally' : 'Imageryx',
      repoUrl: null,
      createdAt: '',
      resources,
    };
  }

  async function renderPanel(inv: CloudInventory, projects: Project[]) {
    const fixture = TestBed.createComponent(LinkResourcesPanel);
    fixture.componentRef.setInput(
      'sections',
      linkCandidates(inv, ownershipIndex(projects), 'ally'),
    );
    await fixture.whenStable();
    const submitted: CloudResourceRef[][] = [];
    fixture.componentInstance.submitted.subscribe((refs) =>
      submitted.push(refs),
    );
    return {
      fixture,
      element: fixture.nativeElement as HTMLElement,
      submitted,
    };
  }

  it('offers only what this project does not own, with labelled checkboxes', async () => {
    const { element } = await renderPanel(inventory(), [
      project('ally', [link('worker', 'ally-api')]),
    ]);
    const labels = Array.from(element.querySelectorAll('label')).map((l) =>
      l.textContent?.trim(),
    );
    expect(labels).toContain('ally-runner');
    expect(labels).not.toContain('ally-api');
    expect(element.querySelectorAll('fieldset legend').length).toBe(3);
  });

  it('shows a resource another project owns as disabled, naming the owner', async () => {
    const { element } = await renderPanel(inventory(), [
      project('ally', []),
      project('imageryx', [link('pages', 'ally-web', 'imageryx')]),
    ]);
    const label = Array.from(element.querySelectorAll('label')).find((l) =>
      l.textContent?.includes('ally-web'),
    );
    expect(label?.textContent).toContain('in Imageryx');
    expect(label?.querySelector('input')?.disabled).toBe(true);
  });

  it('says "unavailable" for an unreadable product rather than listing none', async () => {
    const { element } = await renderPanel(
      inventory({ r2: { items: [], error: 'Insufficient permissions' } }),
      [project('ally', [])],
    );
    const notices = Array.from(
      element.querySelectorAll('[data-testid="link-section-unavailable"]'),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toContain('R2 unavailable');
    expect(notices[0].textContent).toContain('Insufficient permissions');
  });

  it('submits every selected resource at once', async () => {
    const { element, fixture, submitted } = await renderPanel(inventory(), [
      project('ally', []),
    ]);

    for (const name of ['ally-api', 'ally-reports']) {
      const input = Array.from(element.querySelectorAll('label'))
        .find((l) => l.textContent?.trim() === name)
        ?.querySelector('input');
      input?.click();
    }
    await fixture.whenStable();

    element
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(submitted).toHaveLength(1);
    expect(submitted[0].map((ref) => [ref.type, ref.resourceId])).toEqual([
      ['worker', 'ally-api'],
      ['r2', 'ally-reports'],
    ]);
  });
});
