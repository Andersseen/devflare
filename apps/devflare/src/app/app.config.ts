import {
  ApplicationConfig,
  provideZonelessChangeDetection,
  provideBrowserGlobalErrorListeners,
  ErrorHandler,
} from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import { provideFileRouter } from '@analogjs/router';
import { provideHttpClient } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { provideMovement } from 'angular-movement';
import { provideDevAuth } from '@org/auth';
import {
  createAuthController,
  defineDevAuthElements,
  provideDevAuthElements,
} from '@org/dev-auth-elements';
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
  Cloud,
  RefreshCw,
  GitBranch,
  HardDrive,
  Boxes,
  RotateCcw,
  Rocket,
  Activity,
  TerminalSquare,
  ChevronRight,
} from 'lucide-angular';

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

// One AuthController shared between `<dev-auth-sign-in>`/`<dev-auth-user-button>`
// and @org/auth's Angular signals (via provideDevAuth({ controller }) below),
// so the app runs a single /api/auth/session fetch loop, not two independent
// ones. Built (and the elements registered) here, at module scope, so it
// exists before Angular's router runs the initial navigation's guards —
// `typeof window` also doubles as this file's own SSR guard, matching the
// Sentry init above; on the server, provideDevAuth() falls back to building
// its own default controller exactly as it always has.
const devAuthController =
  typeof window !== 'undefined' ? createAuthController() : undefined;

if (devAuthController) {
  provideDevAuthElements(devAuthController);
  defineDevAuthElements();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(withComponentInputBinding()),
    provideHttpClient(),
    provideDevAuth(devAuthController ? { controller: devAuthController } : {}),
    provideMovement({
      duration: 220,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    }),
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
        Cloud,
        RefreshCw,
        GitBranch,
        HardDrive,
        Boxes,
        RotateCcw,
        Rocket,
        Activity,
        TerminalSquare,
        ChevronRight,
      }),
    ),
  ],
};
