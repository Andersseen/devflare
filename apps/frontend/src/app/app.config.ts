import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  importProvidersFrom,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Database,
  FileJson,
  LayoutDashboard,
  Link2,
  LucideAngularModule,
  Menu,
  Palette,
  Plus,
  QrCode,
  Receipt,
  Scissors,
  Search,
  Settings,
  Upload,
  Video,
  Wand2,
  X,
  Image,
  AppWindow,
  Github,
} from 'lucide-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    importProvidersFrom(
      LucideAngularModule.pick({
        LayoutDashboard,
        AppWindow,
        Database,
        Image,
        Receipt,
        Search,
        Palette,
        Wand2,
        Scissors,
        Video,
        QrCode,
        FileJson,
        Link2,
        Menu,
        Settings,
        Plus,
        Activity,
        ChevronRight,
        ChevronLeft,
        Upload,
        X,
        Github,
      })
    ),
  ],
};
