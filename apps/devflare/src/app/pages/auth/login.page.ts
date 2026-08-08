import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardDescription,
  VoltCardContent,
  VoltButton,
  VoltError,
} from '@voltui/components';
import { Auth } from '@org/auth';

/**
 * DevFlare no longer collects credentials. dev-auth is an OAuth 2.1 / OIDC
 * provider and owns email/password, GitHub and account linking, so this page's
 * only job is to hand the browser over and let it come back with an
 * authorization code (see the server's /api/auth/login and /api/auth/callback).
 */
const ERRORS: Record<string, string> = {
  invalid_state:
    'That sign-in link expired before it could be used. Please try again.',
  access_denied: 'Sign-in was cancelled.',
};

@Component({
  selector: 'app-login-page',
  imports: [
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardDescription,
    VoltCardContent,
    VoltButton,
    VoltError,
  ],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <div class="w-full max-w-md">
        <!-- Logo -->
        <div class="flex items-center justify-center gap-2 mb-8">
          <div
            class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center"
          >
            <span class="text-primary-foreground font-bold text-xl">D</span>
          </div>
          <span class="text-2xl font-bold">DevFlare</span>
        </div>

        <volt-card>
          <volt-card-header>
            <volt-card-title>Welcome back</volt-card-title>
            <volt-card-description>
              Sign in with your DevAuth account
            </volt-card-description>
          </volt-card-header>
          <volt-card-content>
            @if (error(); as message) {
              <volt-error class="mb-4">{{ message }}</volt-error>
            }

            <volt-button
              variant="solid"
              class="w-full"
              [disabled]="isRedirecting()"
              (click)="signIn()"
            >
              @if (isRedirecting()) {
                <span class="flex items-center justify-center gap-2">
                  <lucide-icon name="loader" class="animate-spin w-4 h-4" />
                  Redirecting...
                </span>
              } @else {
                <span class="flex items-center justify-center gap-2">
                  Continue with DevAuth
                  <lucide-icon name="arrow-right" class="w-4 h-4" />
                </span>
              }
            </volt-button>

            <p class="mt-4 text-center text-sm text-muted-foreground">
              Email, password and GitHub sign-in all live in DevAuth — including
              creating an account.
            </p>
          </volt-card-content>
        </volt-card>
      </div>
    </div>
  `,
})
export default class LoginPage {
  #auth = inject(Auth);
  #route = inject(ActivatedRoute);

  isRedirecting = signal(false);

  /** Set when the provider or the callback refused the flow. */
  error = computed(() => {
    const reason = this.#route.snapshot.queryParamMap.get('error');
    if (!reason) return '';
    return ERRORS[reason] ?? `Sign-in failed: ${reason}`;
  });

  signIn(): void {
    this.isRedirecting.set(true);
    this.#auth.signIn(
      this.#route.snapshot.queryParamMap.get('returnTo') ?? '/',
    );
  }
}
