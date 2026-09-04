import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DevAuthSignIn } from '@org/auth-ui';

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
  imports: [DevAuthSignIn],
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

        <dev-auth-sign-in
          title="Welcome back"
          description="Sign in with your DevAuth account. Email, password and GitHub stay securely with DevAuth."
          [returnTo]="returnTo()"
          [errorMessage]="error()"
          class="[--dev-auth-surface:var(--card)] [--dev-auth-foreground:var(--card-foreground)] [--dev-auth-muted:var(--muted-foreground)] [--dev-auth-border:var(--border)] [--dev-auth-primary:var(--primary)] [--dev-auth-primary-foreground:var(--primary-foreground)] [--dev-auth-focus:var(--ring)]"
        />
      </div>
    </div>
  `,
})
export default class LoginPage {
  #route = inject(ActivatedRoute);

  returnTo = computed(
    () => this.#route.snapshot.queryParamMap.get('returnTo') ?? '/',
  );

  /** Set when the provider or the callback refused the flow. */
  error = computed(() => {
    const reason = this.#route.snapshot.queryParamMap.get('error');
    if (!reason) return '';
    return ERRORS[reason] ?? `Sign-in failed: ${reason}`;
  });
}
