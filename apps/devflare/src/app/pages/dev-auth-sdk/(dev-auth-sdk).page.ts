import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { VoltBadge, VoltCard, VoltCardContent } from '@voltui/components';
import type {
  AuthController,
  AuthControllerState,
  AuthUser,
} from '@dev-auth/elements';

/**
 * Showcase page for @dev-auth/elements — not part of the SDK itself. Each
 * demo instance gets its own frozen AuthController (via the same
 * `.controller` property a real consumer uses for state-sharing) so every
 * state renders side by side without needing a real session per state.
 * The "Live" section instead lets the elements fall back to the app's own
 * shared controller, so it reflects whoever is actually signed in.
 */
function staticController(state: AuthControllerState): AuthController {
  return {
    getState: () => state,
    subscribe: () => () => undefined,
    ready: () => Promise.resolve(),
    login: () => undefined,
    logout: async () => undefined,
    updateProfile: async () => undefined,
    refresh: async () => undefined,
  };
}

const DEMO_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f59e0b"/><circle cx="32" cy="24" r="12" fill="#fff"/><path d="M12 58c0-12 9-22 20-22s20 10 20 22" fill="#fff"/></svg>`;
const DEMO_PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(DEMO_AVATAR_SVG)}`;

const NOW = new Date();

const USER_WITH_PHOTO: AuthUser = {
  id: 'demo-1',
  email: 'grace@example.com',
  name: 'Grace Hopper',
  image: DEMO_PHOTO,
  emailVerified: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const USER_INITIALS_ONLY: AuthUser = {
  id: 'demo-2',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  image: null,
  emailVerified: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const USER_NO_PROFILE: AuthUser = {
  id: 'demo-3',
  email: '',
  name: '',
  image: null,
  emailVerified: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const QUICK_START = `import {
  createAuthController,
  provideDevAuthElements,
  defineDevAuthElements,
} from '@dev-auth/elements';

const auth = createAuthController({ basePath: '/api/auth' });
provideDevAuthElements(auth);
defineDevAuthElements();`;

@Component({
  selector: 'app-dev-auth-sdk-page',
  imports: [VoltBadge, VoltCard, VoltCardContent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="mx-auto max-w-5xl space-y-12">
      <div class="space-y-4 border-b border-border pb-8">
        <volt-badge variant="secondary" class="font-mono text-xs"
          >@dev-auth/elements</volt-badge
        >
        <h1 class="text-3xl font-bold tracking-tight">DevAuth SDK</h1>
        <p class="max-w-2xl text-muted-foreground">
          Live preview of
          <code class="rounded bg-muted px-1.5 py-0.5 text-foreground"
            >&lt;dev-auth-sign-in&gt;</code
          >
          and
          <code class="rounded bg-muted px-1.5 py-0.5 text-foreground"
            >&lt;dev-auth-user-button&gt;</code
          >
          — the framework-agnostic Custom Elements that power sign-in across
          every DevAuth consumer app, in every state they render. This page is
          a showcase, not part of the SDK.
        </p>
        <div class="flex flex-wrap gap-2">
          <volt-badge variant="outline">Framework-agnostic</volt-badge>
          <volt-badge variant="outline">Light DOM</volt-badge>
          <volt-badge variant="outline">No OAuth/token access</volt-badge>
          <volt-badge variant="outline">SSR-safe</volt-badge>
        </div>
      </div>

      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">Live — your actual session</h2>
          <p class="text-sm text-muted-foreground">
            These reflect whoever is really signed in right now — try signing
            in or out from the navbar and reload this page.
          </p>
        </div>
        <volt-card>
          <volt-card-content
            class="flex flex-wrap items-center justify-center gap-6 p-6"
          >
            <div
              class="flex flex-1 flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10"
            >
              <dev-auth-sign-in
                heading="Welcome back"
                description="Sign in with your DevAuth account"
              ></dev-auth-sign-in>
              <volt-badge variant="secondary" class="font-mono text-[0.65rem]"
                >&lt;dev-auth-sign-in&gt;</volt-badge
              >
            </div>
            <div
              class="flex flex-1 flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10"
            >
              <dev-auth-user-button></dev-auth-user-button>
              <volt-badge variant="secondary" class="font-mono text-[0.65rem]"
                >&lt;dev-auth-user-button&gt;</volt-badge
              >
            </div>
          </volt-card-content>
        </volt-card>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold">&lt;dev-auth-sign-in&gt; states</h2>
        <volt-card>
          <volt-card-content class="grid gap-4 p-6 sm:grid-cols-3">
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10"
            >
              <dev-auth-sign-in
                [controller]="loadingController"
              ></dev-auth-sign-in>
              <volt-badge variant="secondary">loading</volt-badge>
            </div>
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10"
            >
              <dev-auth-sign-in
                [controller]="anonymousController"
                heading="Welcome to Example"
                description="Continue to your workspace"
                action-label="Continue to Example"
              ></dev-auth-sign-in>
              <volt-badge variant="secondary">anonymous</volt-badge>
            </div>
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10"
            >
              <dev-auth-sign-in
                [controller]="authPhotoController"
              ></dev-auth-sign-in>
              <volt-badge variant="secondary">authenticated</volt-badge>
            </div>
          </volt-card-content>
        </volt-card>
      </section>

      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">
            &lt;dev-auth-user-button&gt; states
          </h2>
          <p class="text-sm text-muted-foreground">
            Identity fallback order: photo → initials → generic icon. Open a
            menu below to see focus-on-open and the slotted "Settings"
            action.
          </p>
        </div>
        <volt-card>
          <volt-card-content class="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10"
            >
              <dev-auth-user-button
                [controller]="loadingController"
              ></dev-auth-user-button>
              <volt-badge variant="secondary">loading</volt-badge>
            </div>
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10"
            >
              <dev-auth-user-button [controller]="authPhotoController">
                <a slot="menu-actions" role="menuitem" href="#demo"
                  >Settings</a
                >
              </dev-auth-user-button>
              <volt-badge variant="secondary">photo avatar</volt-badge>
            </div>
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10"
            >
              <dev-auth-user-button [controller]="authInitialsController">
                <a slot="menu-actions" role="menuitem" href="#demo"
                  >Settings</a
                >
              </dev-auth-user-button>
              <volt-badge variant="secondary">initials fallback</volt-badge>
            </div>
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10"
            >
              <dev-auth-user-button
                [controller]="authFallbackController"
              ></dev-auth-user-button>
              <volt-badge variant="secondary">generic fallback</volt-badge>
            </div>
          </volt-card-content>
        </volt-card>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold">Quick start</h2>
        <p class="text-sm text-muted-foreground">
          Register the elements once, anywhere — plain HTML, Astro, React,
          Vue, Svelte, or Angular.
        </p>
        <volt-card>
          <volt-card-content class="p-0">
            <pre
              class="overflow-x-auto rounded-md bg-[#0d1117] p-5 text-[0.8rem] leading-relaxed text-[#c9d1d9]"
            ><code>{{ quickStart }}</code></pre>
          </volt-card-content>
        </volt-card>
      </section>
    </div>
  `,
})
export default class DevAuthSdkPage {
  protected readonly quickStart = QUICK_START;

  protected readonly loadingController = staticController({
    status: 'loading',
    user: null,
  });
  protected readonly anonymousController = staticController({
    status: 'anonymous',
    user: null,
  });
  protected readonly authPhotoController = staticController({
    status: 'authenticated',
    user: USER_WITH_PHOTO,
  });
  protected readonly authInitialsController = staticController({
    status: 'authenticated',
    user: USER_INITIALS_ONLY,
  });
  protected readonly authFallbackController = staticController({
    status: 'authenticated',
    user: USER_NO_PROFILE,
  });
}
