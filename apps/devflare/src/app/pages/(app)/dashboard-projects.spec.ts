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
