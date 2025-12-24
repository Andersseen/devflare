import { Routes } from '@angular/router';
import { DashboardLayoutComponent } from './layout/dashboard-layout.component';
import { AuthLayoutComponent } from './layout/auth-layout.component';
import { ToolsCompressorComponent } from './features/tools/compressor/tools-compressor.component';
import { StorageExplorerComponent } from './features/storage/explorer/storage-explorer.component';
import { SignInComponent } from './features/auth/sign-in/sign-in.component';
import { SignUpComponent } from './features/auth/sign-up/sign-up.component';
import { SettingsComponent } from './features/settings/settings.component';
import { DeployComponent } from './features/deploy/deploy.component';
import { HomeComponent } from './features/home/home.component';

export const routes: Routes = [
  {
    path: 'auth',
    component: AuthLayoutComponent,
    children: [
      { path: 'sign-in', component: SignInComponent, title: 'Sign In | DevFlare' },
      { path: 'sign-up', component: SignUpComponent, title: 'Sign Up | DevFlare' },
      { path: '', redirectTo: 'sign-in', pathMatch: 'full' },
    ],
  },
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      { path: '', component: HomeComponent, title: 'Home | DevFlare' },
      {
        path: 'tools/compressor',
        component: ToolsCompressorComponent,
        title: 'Image Tools | DevFlare',
      },
      {
        path: 'tools/og-generator',
        loadComponent: () =>
          import('./features/tools/og-generator/og-generator.component').then(
            (m) => m.OgGeneratorComponent
          ),
        title: 'Social Card Designer | DevFlare',
      },
      {
        path: 'tools/seo-simulator',
        loadComponent: () =>
          import('./features/tools/seo-simulator/seo-simulator.component').then(
            (m) => m.SeoSimulatorComponent
          ),
        title: 'SEO Simulator | DevFlare',
      },
      {
        path: 'tools/svg-optimizer',
        loadComponent: () =>
          import('./features/tools/svg-optimizer/svg-optimizer.component').then(
            (m) => m.SvgOptimizerComponent
          ),
        title: 'SVG Optimizer | DevFlare',
      },
      {
        path: 'tools/bg-remover',
        loadComponent: () =>
          import('./features/tools/bg-remover/bg-remover.component').then(
            (m) => m.BgRemoverComponent
          ),
        title: 'Background Remover | DevFlare',
      },
      {
        path: 'tools/palette',
        loadComponent: () =>
          import('./features/tools/palette/palette-generator.component').then(
            (m) => m.PaletteGeneratorComponent
          ),
        title: 'Cinematic Palette | DevFlare',
      },
      {
        path: 'tools/shortener',
        loadComponent: () =>
          import('./features/tools/shortener/shortener.component').then(
            (m) => m.ShortenerComponent
          ),
        title: 'URL Shortener | DevFlare',
      },
      {
        path: 'tools/qr-generator',
        loadComponent: () =>
          import('./features/tools/qr-generator/qr-studio.component').then(
            (m) => m.QrStudioComponent
          ),
        title: 'QR Studio | DevFlare',
      },
      {
        path: 'tools/converter',
        loadComponent: () =>
          import('./features/tools/converter/data-converter.component').then(
            (m) => m.DataConverterComponent
          ),
        title: 'Data Converter | DevFlare',
      },
      {
        path: 'tools/recorder',
        loadComponent: () =>
          import('./features/tools/recorder/screen-recorder.component').then(
            (m) => m.ScreenRecorderComponent
          ),
        title: 'Screen Recorder | DevFlare',
      },
      {
        path: 'storage/explorer',
        component: StorageExplorerComponent,
        title: 'Cloud Storage | DevFlare',
      },
      {
        path: 'deploy',
        component: DeployComponent,
        title: 'Deploy | DevFlare',
      },
      {
        path: 'deploy/dashboard',
        loadComponent: () =>
          import('./features/deploy/dashboard/deployment-dashboard.component').then(
            (m) => m.DeploymentDashboardComponent
          ),
        title: 'Dashboard | DevFlare',
      },
      {
        path: 'settings',
        component: SettingsComponent,
        title: 'Settings | DevFlare',
      },
      {
        path: 'settings/cloud',
        loadComponent: () =>
          import('./features/settings/cloud-credentials.component').then(
            (m) => m.CloudCredentialsComponent
          ),
        title: 'Cloud Credentials | DevFlare',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
