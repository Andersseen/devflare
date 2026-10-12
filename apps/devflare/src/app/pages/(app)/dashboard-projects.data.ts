import type { WatchedProject } from './dashboard-projects.models';

/**
 * Known application identities used to group multiple Cloudflare resources.
 *
 * Keep aliases explicit: a broad prefix heuristic would eventually merge
 * unrelated applications that happen to share a name fragment.
 */
export const WATCHED_PROJECTS = [
  {
    name: 'Strata',
    slug: 'strata',
    aliases: ['strata-www', 'strata-sc-qualification'],
  },
  {
    name: 'CV Builder',
    slug: 'cv-builder',
    aliases: ['cv-builder', 'cv-builder-pdf'],
  },
  {
    name: 'DevFlare',
    slug: 'devflare',
    aliases: [
      'dev-auth',
      'dev-auth-prod',
      'dev-auth-staging',
      'auth-devflare',
      'worker-devflare-hono',
      'devflare-worker',
      'control-bucket',
    ],
  },
  {
    name: 'Volt UI',
    slug: 'volt-ui',
    aliases: ['voltui'],
    verifiedDomains: ['volt-ui.andersseen.dev'],
  },
  {
    name: 'Angular Movement',
    slug: 'angular-movement',
    aliases: ['angular movemnt'],
    verifiedDomains: ['angular-movement.andersseen.dev'],
  },
  {
    name: 'Lumen Icons',
    slug: 'lumen-icons',
    aliases: ['lumen iconos'],
    verifiedDomains: ['lumen-icons.andersseen.dev'],
  },
  { name: 'ForgeCMS', slug: 'forgecms', aliases: ['forge cms'] },
  { name: 'Etym', slug: 'etym', aliases: ['etyma'] },
  {
    name: 'Ally',
    slug: 'ally',
    verifiedDomains: ['ally.andersseen.dev'],
  },
  {
    name: 'Duplex',
    slug: 'duplex',
    aliases: ['duplex-web', 'duplex-worker'],
  },
  { name: 'ImageryX', slug: 'imageryx', aliases: ['imageryx'] },
  {
    name: 'Andersseen Dev',
    slug: 'andersseen-dev',
    aliases: ['andersseen-dev', 'andersseen dev', 'my-blog'],
  },
] satisfies readonly WatchedProject[];
