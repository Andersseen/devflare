import {
  ApplicationConfig,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import { provideFileRouter } from '@analogjs/router';
import {
  LucideAngularModule,
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  Brush,
  Check,
  Circle,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Image,
  Link,
  Loader,
  Monitor,
  PaintBucket,
  Palette,
  QrCode,
  Search,
  ShieldCheck,
  Square,
  Upload,
  Video,
  X,
} from 'lucide-angular';

/**
 * Deliberately small. DevTools has no identity provider, no HTTP client, no
 * error reporting and no animation runtime: every tool works anonymously and
 * offline after the first load, and nothing here should change that without a
 * reason recorded in apps/devtools/README.md.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(withComponentInputBinding()),
    importProvidersFrom(
      LucideAngularModule.pick({
        AlertCircle,
        ArrowLeft,
        ArrowRightLeft,
        Brush,
        Check,
        Circle,
        Copy,
        Download,
        ExternalLink,
        Globe,
        Image,
        Link,
        Loader,
        Monitor,
        PaintBucket,
        Palette,
        QrCode,
        Search,
        ShieldCheck,
        Square,
        Upload,
        Video,
        X,
      }),
    ),
  ],
};
