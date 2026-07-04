import {
  ApplicationConfig,
  provideZonelessChangeDetection,
  provideBrowserGlobalErrorListeners,
  ErrorHandler,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import * as Sentry from '@sentry/angular';
import {
  LucideAngularModule,
  LayoutDashboard,
  Zap,
  FolderOpen,
  Image,
  QrCode,
  PanelLeftOpen,
  PanelLeftClose,
  Menu,
  Wrench,
  Upload,
  Download,
  Check,
  Loader,
  Plus,
  LogOut,
  User,
  Scissors,
  Search,
  Copy,
  Globe,
  Monitor,
  Video,
  FileJson,
  ArrowRightLeft,
  Brush,
  PaintBucket,
  PaintRoller,
  AlertCircle,
  ArrowLeft,
  Circle,
  Database,
  Github,
  Link,
  ExternalLink,
  Palette,
  Square,
  X,
  Settings,
} from 'lucide-angular';
import { appRoutes } from './app.routes';

// Initialize Sentry in browser
if (typeof window !== 'undefined') {
  const dsn = (import.meta as unknown as { env?: { VITE_SENTRY_DSN?: string } })
    .env?.VITE_SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: import.meta.env.PROD ? 'production' : 'development',
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      integrations: [Sentry.browserTracingIntegration()],
    });
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(),
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler({ showDialog: false }),
    },
    importProvidersFrom(
      LucideAngularModule.pick({
        LayoutDashboard,
        Zap,
        FolderOpen,
        Image,
        QrCode,
        PanelLeftOpen,
        PanelLeftClose,
        Menu,
        Wrench,
        Upload,
        Download,
        Check,
        Loader,
        Plus,
        LogOut,
        User,
        Scissors,
        Search,
        Copy,
        Globe,
        Monitor,
        Video,
        FileJson,
        ArrowRightLeft,
        Brush,
        PaintBucket,
        PaintRoller,
        AlertCircle,
        ArrowLeft,
        Circle,
        Database,
        Github,
        Link,
        ExternalLink,
        Palette,
        Square,
        X,
        Settings,
      }),
    ),
  ],
};
