import { Route } from '@angular/router';
import { LayoutComponent } from './components/layout.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/(home).page'),
      },
      {
        path: 'deploy',
        loadComponent: () => import('./pages/deploy.page'),
      },
      {
        path: 'projects',
        loadComponent: () => import('./pages/projects.page'),
      },
      {
        path: 'tools/image-compressor',
        loadComponent: () => import('./pages/tools/image-compressor.page'),
      },
      {
        path: 'tools/qr-generator',
        loadComponent: () => import('./pages/tools/qr-generator.page'),
      },
      {
        path: 'tools/svg-optimizer',
        loadComponent: () => import('./pages/tools/svg-optimizer.page'),
      },
      {
        path: 'tools/seo-simulator',
        loadComponent: () => import('./pages/tools/seo-simulator.page'),
      },
      {
        path: 'tools/converter',
        loadComponent: () => import('./pages/tools/data-converter.page'),
      },
      {
        path: 'tools/recorder',
        loadComponent: () => import('./pages/tools/screen-recorder.page'),
      },
      {
        path: 'tools/og-generator',
        loadComponent: () => import('./pages/tools/og-generator.page'),
      },
      {
        path: 'tools/palette',
        loadComponent: () => import('./pages/tools/palette.page'),
      },
      {
        path: 'tools/bg-remover',
        loadComponent: () => import('./pages/tools/bg-remover.page'),
      },
      {
        path: 'tools/shortener',
        loadComponent: () => import('./pages/tools/url-shortener.page'),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings.page'),
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/auth/login.page'),
  },
  {
    path: 'sign-up',
    loadComponent: () => import('./pages/auth/sign-up.page'),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
