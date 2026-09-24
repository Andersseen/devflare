import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ConnectedAccess } from '../connected/connected-access.service';

const AUTH_ERRORS: Record<string, string> = {
  invalid_state:
    'That sign-in link expired before it could be used. Please try again.',
  access_denied: 'Sign-in was cancelled.',
  provider_error: 'DevAuth could not complete the sign-in. Please try again.',
};

/**
 * Frame for a connected tool: a small account bar, then either the tool
 * (signed in and allowed) or the right explanation — sign in, access denied,
 * or an error. Authorization itself is enforced by the server; this only
 * decides what to show.
 */
@Component({
  selector: 'app-connected-gate',
  imports: [LucideAngularModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="space-y-6">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm"
      >
        <span class="inline-flex items-center gap-2 text-muted-foreground">
          <lucide-icon name="cloud" class="h-4 w-4 text-primary" />
          Connected tool — runs on the DevTools server, sign-in required.
        </span>
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

      @switch (access.state()) {
        @case ('loading') {
          <p class="text-sm text-muted-foreground" role="status">
            Checking your session…
          </p>
        }
        @case ('anonymous') {
          <div class="mx-auto max-w-md space-y-3">
            <dev-auth-sign-in
              [attr.heading]="'Sign in to use ' + toolName()"
              description="Connected tools keep data on the DevTools server, so they need an account. Local tools never do."
              [attr.return-to]="returnTo()"
              [attr.error-message]="authError()"
            ></dev-auth-sign-in>
          </div>
        }
        @case ('denied') {
          <div
            class="mx-auto max-w-md space-y-2 rounded-lg border border-border p-6 text-center"
            role="alert"
          >
            <lucide-icon
              name="lock"
              class="mx-auto h-6 w-6 text-muted-foreground"
            />
            <h2 class="text-lg font-semibold">No access to connected tools</h2>
            <p class="text-sm text-muted-foreground">
              You are signed in as {{ access.user()?.email }}, but this DevTools
              deployment only allows specific accounts to use {{ toolName() }}.
              Local tools stay available to everyone.
            </p>
          </div>
        }
        @case ('error') {
          <div class="mx-auto max-w-md space-y-3 text-center" role="alert">
            <p class="text-sm text-muted-foreground">
              Could not check your access. DevTools’ server may be unavailable.
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
        @case ('allowed') {
          <ng-content />
        }
      }
    </div>
  `,
})
export class ConnectedGateComponent {
  readonly toolName = input.required<string>();

  protected readonly access = inject(ConnectedAccess);
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);

  /** Back to this tool after DevAuth. The router's URL, not the (unrouted)
   * component's ActivatedRoute, which has no path segments of its own. */
  protected readonly returnTo = computed(
    () => this.#router.url.split(/[?#]/)[0] || '/',
  );

  protected readonly authError = computed(() => {
    const code = this.#route.snapshot.queryParamMap.get('auth_error');
    if (!code) return '';
    return AUTH_ERRORS[code] ?? `Sign-in failed (${code}).`;
  });

  constructor() {
    void this.access.refresh();
  }
}
