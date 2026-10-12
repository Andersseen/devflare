import {
  ApplicationConfig,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import { provideFileRouter } from '@analogjs/router';
import {
  Activity,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Clock,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Info,
  LayoutDashboard,
  Loader,
  Lock,
  LucideAngularModule,
  Package,
  Radar,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  Tag,
  TriangleAlert,
} from 'lucide-angular';

/**
 * Deliberately small: no HTTP client and no error reporting. DevAuth is used
 * only through RadarAccess (src/app/radar/), which the shell injects — the
 * whole app is behind sign-in, and every request goes to DevRadar's own API.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(withComponentInputBinding()),
    importProvidersFrom(
      LucideAngularModule.pick({
        Activity,
        CircleCheck,
        CircleDashed,
        CircleMinus,
        CircleX,
        Clock,
        ExternalLink,
        FolderGit2,
        GitBranch,
        GitMerge,
        GitPullRequest,
        Info,
        LayoutDashboard,
        Loader,
        Lock,
        Package,
        Radar,
        RefreshCw,
        Rocket,
        Search,
        Settings,
        Tag,
        TriangleAlert,
      }),
    ),
  ],
};
