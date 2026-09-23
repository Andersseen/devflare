import { describe, expect, it } from 'vitest';
import type { CloudPagesProject, CloudWorker, Project } from '@org/core';
import {
  groupDashboardProjects,
  resourceUrl,
  resourceUrls,
} from './dashboard-projects';

const baseProject: Project = {
  id: 'saved-1',
  userId: 'user-1',
  name: 'devflare',
  repoUrl: 'https://github.com/andriipap/devflare',
  createdAt: '2026-08-01T00:00:00.000Z',
  cfType: null,
  cfName: null,
};

function worker(name: string): CloudWorker {
  return {
    name,
    createdOn: '2026-08-01T00:00:00.000Z',
    modifiedOn: '2026-08-24T00:00:00.000Z',
    domains: [],
  };
}

function pages(name: string): CloudPagesProject {
  return {
    name,
    subdomain: `${name}.pages.dev`,
    domains: [],
    productionBranch: 'main',
    createdOn: '2026-08-01T00:00:00.000Z',
    repo: null,
    gitConnected: false,
    latestDeployment: null,
  };
}

describe('groupDashboardProjects', () => {
  it('groups DevFlare resources under one high-level project', () => {
    const groups = groupDashboardProjects({
      saved: [baseProject],
      pages: [pages('volt-ui')],
      workers: [
        worker('devflare'),
        worker('dev-auth-prod'),
        worker('dev-auth-staging'),
        worker('worker-devflare-hono'),
        worker('control-bucket'),
      ],
    });

    const devflare = groups.find((group) => group.slug === 'devflare');

    expect(devflare?.workers.map((item) => item.name).sort()).toEqual([
      'control-bucket',
      'dev-auth-prod',
      'dev-auth-staging',
      'devflare',
      'worker-devflare-hono',
    ]);
    expect(groups.some((group) => group.slug === 'dev-auth-prod')).toBe(false);
    expect(groups.some((group) => group.slug === 'worker-devflare-hono')).toBe(
      false,
    );
  });

  it('keeps verified route-only domains live and omits empty placeholders', () => {
    const groups = groupDashboardProjects({
      saved: [],
      pages: [],
      workers: [],
    });

    expect(
      groups
        .filter((group) => group.verifiedUrls.length)
        .map((group) => ({ slug: group.slug, urls: group.verifiedUrls })),
    ).toEqual([
      {
        slug: 'volt-ui',
        urls: ['https://volt-ui.andersseen.dev'],
      },
      {
        slug: 'angular-movement',
        urls: ['https://angular-movement.andersseen.dev'],
      },
      {
        slug: 'lumen-icons',
        urls: ['https://lumen-icons.andersseen.dev'],
      },
    ]);
    expect(groups.some((group) => group.slug === 'portfolio')).toBe(false);
    expect(groups.some((group) => group.slug === 'quartz')).toBe(false);
  });

  it('keeps saved metadata out unless it links to a live Cloudflare resource', () => {
    const portfolio = {
      ...baseProject,
      id: 'portfolio',
      name: 'Portfolio',
      repoUrl: 'https://github.com/andriipap/portfolio',
    };

    const groups = groupDashboardProjects({
      saved: [portfolio],
      pages: [],
      workers: [],
    });

    expect(groups.some((group) => group.name === 'Portfolio')).toBe(false);
  });

  it('integrates the andersseen.dev Pages project under Andersseen Dev', () => {
    const groups = groupDashboardProjects({
      saved: [],
      pages: [
        {
          ...pages('my-blog'),
          domains: ['my-blog-6vo.pages.dev', 'andersseen.dev'],
        },
      ],
      workers: [],
    });

    expect(
      groups.find((group) => group.slug === 'andersseen-dev'),
    ).toMatchObject({
      url: 'https://andersseen.dev',
      pages: [{ name: 'my-blog' }],
    });
    expect(groups.some((group) => group.slug === 'blog')).toBe(false);
  });

  it('includes every live Cloudflare resource exactly once', () => {
    const pageNames = [
      'and-web-components-storybook',
      'and-web-components-docs',
      'and-web-components-landing',
      'and-web-components-demo',
      'strata-www',
      'etyma-www',
      'etyma-playground',
      'my-blog',
      'forge-cms',
      'forge-cms-demo',
    ];
    const workerNames = [
      'ally-audit-worker',
      'andersend-web',
      'buck-auth',
      'control-bucket',
      'cv-builder',
      'cv-builder-pdf',
      'dev-auth-prod',
      'dev-auth-staging',
      'devflare',
      'devflare-worker',
      'imageryx-api-worker',
      'imageryx-delivery-worker',
      'imageryx-processing-worker',
      'mrg-contact',
      'todo-reminder-cron',
      'worker-devflare-hono',
    ];

    const groups = groupDashboardProjects({
      saved: [
        {
          ...baseProject,
          id: 'saved-cv-builder',
          name: 'CV Builder metadata',
          cfType: 'worker',
          cfName: 'cv-builder',
        },
        {
          ...baseProject,
          id: 'saved-devflare-alias',
          name: 'Production app',
          cfType: 'worker',
          cfName: 'devflare',
        },
      ],
      pages: pageNames.map(pages),
      workers: workerNames.map(worker),
    });
    const groupedPages = groups.flatMap((group) =>
      group.pages.map((project) => project.name),
    );
    const groupedWorkers = groups.flatMap((group) =>
      group.workers.map((project) => project.name),
    );

    expect(groupedPages.sort()).toEqual([...pageNames].sort());
    expect(new Set(groupedPages).size).toBe(pageNames.length);
    expect(groupedWorkers.sort()).toEqual([...workerNames].sort());
    expect(new Set(groupedWorkers).size).toBe(workerNames.length);
  });
});

describe('resource URLs', () => {
  it('prefers a Pages custom domain but retains the Pages fallback', () => {
    const project = {
      ...pages('my-blog'),
      domains: ['my-blog.pages.dev', 'andersseen.dev'],
    };

    expect(resourceUrls(project, null)).toEqual([
      'https://andersseen.dev',
      'https://my-blog.pages.dev',
    ]);
    expect(resourceUrl(project, null)).toBe('https://andersseen.dev');
  });

  it('removes repeated domains and preserves a default-only Pages URL', () => {
    const project = {
      ...pages('demo'),
      domains: ['demo.pages.dev', 'demo.pages.dev'],
    };

    expect(resourceUrls(project, null)).toEqual(['https://demo.pages.dev']);
  });

  it('falls back to the explicit Pages subdomain when domains is empty', () => {
    const project = pages('empty-domains');

    expect(resourceUrls(project, null)).toEqual([
      'https://empty-domains.pages.dev',
    ]);
    expect(resourceUrl(project, null)).toBe('https://empty-domains.pages.dev');
  });
});
