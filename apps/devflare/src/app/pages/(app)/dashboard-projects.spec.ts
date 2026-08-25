import { describe, expect, it } from 'vitest';
import type { CloudPagesProject, CloudWorker, Project } from '@org/core';
import { groupDashboardProjects } from './dashboard-projects';

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
