import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  importProvidersFrom,
  ErrorHandler,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
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
import {
  GlobalErrorHandler,
  authInterceptor,
  errorInterceptor,
} from '@org/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
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
      }),
    ),
  ],
};
