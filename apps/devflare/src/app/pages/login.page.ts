import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * DevFlare no longer collects credentials. dev-auth is an OAuth 2.1 / OIDC
 * provider and owns email/password, GitHub and account linking, so this page's
 * only job is to hand the browser over and let it come back with an
 * authorization code (see the server's /api/auth/login and /api/auth/callback).
 *
 * The sign-in card itself is `<dev-auth-sign-in>` (@org/dev-auth-elements) —
 * it does no URL parsing of its own, so this page still owns mapping a
 * callback `?error=` to human copy.
 */
const ERRORS: Record<string, string> = {
  invalid_state:
    'That sign-in link expired before it could be used. Please try again.',
  access_denied: 'Sign-in was cancelled.',
};

@Component({
  selector: 'app-login-page',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
          heading="Welcome back"
          description="Sign in with your DevAuth account"
          [attr.return-to]="returnTo()"
          [attr.error-message]="error()"
        ></dev-auth-sign-in>

        <p class="mt-4 text-center text-sm text-muted-foreground">
          Email, password and GitHub sign-in all live in DevAuth — including
          creating an account.
        </p>
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
