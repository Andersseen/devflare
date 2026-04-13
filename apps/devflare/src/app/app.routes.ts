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
    ],
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/auth/login.page'),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
