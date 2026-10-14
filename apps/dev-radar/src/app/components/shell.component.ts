import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { RadarAccess } from '../radar/radar-access.service';

const AUTH_ERRORS: Record<string, string> = {
  invalid_state:
    'That sign-in link expired before it could be used. Please try again.',
  access_denied: 'Sign-in was cancelled.',
  provider_error: 'DevAuth could not complete the sign-in. Please try again.',
};

interface NavItem {
  label: string;
  path: string;
  icon: string;
  exact: boolean;
}

export const NAV: readonly NavItem[] = [
  { label: 'Overview', path: '/', icon: 'layout-dashboard', exact: true },
  {
    label: 'Repositories',
    path: '/repositories',
    icon: 'folder-git-2',
    exact: false,
  },
  {
    label: 'Pull Requests',
    path: '/pull-requests',
    icon: 'git-pull-request',
    exact: false,
  },
  { label: 'Activity', path: '/activity', icon: 'activity', exact: false },
  { label: 'Automations', path: '/automations', icon: 'bot', exact: false },
  { label: 'Prompt Inbox', path: '/prompts', icon: 'inbox', exact: false },
  { label: 'Settings', path: '/settings', icon: 'settings', exact: false },
];

/**
 * DevRadar's chrome and its one gate. The entire app is behind DevAuth and the
 * server-side allowlist, so the shell renders the page only when access is
 * `allowed`; every other state gets its own explanation. Authorization is
 * enforced by the server on every request — this only chooses what to show.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="flex min-h-screen flex-col bg-background">
      <header
        class="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur"
      >
        <div
          class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6"
        >
          <a
            routerLink="/"
            class="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <lucide-icon name="radar" class="h-5 w-5" />
            </span>
            <span class="text-lg font-bold tracking-tight">DevRadar</span>
          </a>
          <span class="hidden text-sm text-muted-foreground md:inline">
            Your development command center.
          </span>

          <div class="ml-auto">
            @if (access.state() === 'allowed' || access.state() === 'denied') {
              <dev-auth-user-button
                [style.--dev-auth-surface]="'var(--popover, var(--background))'"
                [style.--dev-auth-foreground]="'var(--foreground)'"
                [style.--dev-auth-muted]="'var(--muted-foreground)'"
                [style.--dev-auth-border]="'var(--border)'"
                [style.--dev-auth-focus]="'var(--ring)'"
              ></dev-auth-user-button>
            }
          </div>
        </div>
      </header>

      @if (access.state() === 'allowed') {
        <div
          class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row"
        >
          <nav
            class="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible"
            aria-label="Primary"
          >
            @for (item of nav; track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive="bg-primary/10 text-primary"
                [routerLinkActiveOptions]="{ exact: item.exact }"
                ariaCurrentWhenActive="page"
                class="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <lucide-icon
                  [name]="item.icon"
                  class="h-4 w-4"
                  aria-hidden="true"
                />
                {{ item.label }}
              </a>
            }
          </nav>
          <main class="min-w-0 flex-1" id="main">
            <ng-content />
          </main>
        </div>
      } @else {
        <main
          class="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6"
          id="main"
        >
          <h1 class="sr-only">DevRadar</h1>
          @switch (access.state()) {
            @case ('anonymous') {
              <div class="mx-auto max-w-md space-y-3" data-testid="sign-in">
                <dev-auth-sign-in
                  heading="Sign in to DevRadar"
                  description="DevRadar shows the state of your GitHub repositories. Sign in with DevAuth to continue."
                  [attr.return-to]="returnTo()"
                  [attr.error-message]="authError()"
                ></dev-auth-sign-in>
              </div>
            }
            @case ('denied') {
              <div
                class="mx-auto max-w-md space-y-2 rounded-lg border border-border p-6 text-center"
                role="alert"
                data-testid="access-denied"
              >
                <lucide-icon
                  name="lock"
                  class="mx-auto h-6 w-6 text-muted-foreground"
                />
                <h2 class="text-lg font-semibold">No access to DevRadar</h2>
                <p class="text-sm text-muted-foreground">
                  You are signed in as {{ access.user()?.email }}, but this
                  DevRadar deployment only allows specific accounts.
                </p>
              </div>
            }
            @case ('error') {
              <div class="mx-auto max-w-md space-y-3 text-center" role="alert">
                <p class="text-sm text-muted-foreground">
                  Could not check your access. DevRadar’s server may be
                  unavailable.
                </p>
                <button
                  type="button"
                  class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
                  (click)="access.refresh()"
                >
                  Try again
                </button>
              </div>
            }
            @default {
              <p
                class="text-center text-sm text-muted-foreground"
                role="status"
              >
                Checking your session…
              </p>
            }
          }
        </main>
      }
    </div>
  `,
})
export class ShellComponent {
  protected readonly access = inject(RadarAccess);
  readonly #router = inject(Router);
  protected readonly nav = NAV;

  /** Back to where the visitor was after DevAuth. Never includes the query. */
  protected readonly returnTo = computed(
    () => this.#router.url.split(/[?#]/)[0] || '/',
  );

  protected readonly authError = computed(() => {
    const code = new URLSearchParams(this.#router.url.split('?')[1] ?? '').get(
      'auth_error',
    );
    if (!code) return '';
    return AUTH_ERRORS[code] ?? `Sign-in failed (${code}).`;
  });

  constructor() {
    void this.access.refresh();
  }
}
