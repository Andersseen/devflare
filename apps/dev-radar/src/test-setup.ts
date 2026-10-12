import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import '@analogjs/vitest-angular/setup-serializers';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed();

// jsdom 22 ships `crypto.getRandomValues` but not `crypto.subtle`, which
// browsers and Workers both have. The PKCE and session code needs SHA-256, so
// tests get Node's WebCrypto — the same standard API, not a mock.
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}
