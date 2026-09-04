import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  ExternalLink,
  LoaderCircle,
  LucideAngularModule,
} from 'lucide-angular';
import { DevAuth } from '@org/auth';

@Component({
  selector: 'dev-auth-sign-in',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="surface" [attr.aria-busy]="isPending()">
      @if (isPending()) {
        <div class="status" role="status" aria-live="polite">
          <lucide-icon [img]="loaderIcon" aria-hidden="true" />
          <span>Checking your session...</span>
        </div>
      } @else if (auth.user(); as user) {
        <div class="content signed-in">
          <div class="avatar" aria-hidden="true">
            {{ identityInitial(user.name, user.email) }}
          </div>
          <div>
            <p class="eyebrow">Already signed in</p>
            <h2>{{ displayIdentity(user.name, user.email) }}</h2>
          </div>
        </div>
      } @else {
        <div class="content">
          <div>
            <h2>{{ title() }}</h2>
            <p class="description">{{ description() }}</p>
          </div>

          @if (visibleError(); as message) {
            <p class="error" role="alert">{{ message }}</p>
          }

          <button
            type="button"
            class="action"
            [disabled]="redirecting()"
            [attr.aria-busy]="redirecting()"
            (click)="signIn()"
          >
            @if (redirecting()) {
              <lucide-icon
                class="spinner"
                [img]="loaderIcon"
                aria-hidden="true"
              />
              Redirecting...
            } @else {
              {{ actionLabel() }}
              <lucide-icon [img]="externalLinkIcon" aria-hidden="true" />
            }
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      color: var(--dev-auth-foreground, inherit);
      font: inherit;
    }
    .surface {
      box-sizing: border-box;
      width: min(100%, var(--dev-auth-sign-in-width, 26rem));
      padding: var(--dev-auth-space-lg, 1.5rem);
      border: 1px solid
        var(
          --dev-auth-border,
          color-mix(in srgb, currentColor 18%, transparent)
        );
      border-radius: var(--dev-auth-radius, 0.5rem);
      background: var(--dev-auth-surface, Canvas);
      color: var(--dev-auth-foreground, CanvasText);
      box-shadow: var(--dev-auth-shadow, 0 12px 32px rgb(0 0 0 / 10%));
    }
    .content {
      display: grid;
      gap: var(--dev-auth-space-lg, 1.5rem);
    }
    .signed-in {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
    }
    h2,
    p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    h2 {
      font-size: 1.25rem;
      line-height: 1.3;
      letter-spacing: 0;
    }
    .description {
      margin-top: 0.5rem;
      color: var(
        --dev-auth-muted,
        color-mix(in srgb, currentColor 68%, transparent)
      );
      line-height: 1.5;
    }
    .eyebrow {
      margin-bottom: 0.25rem;
      color: var(
        --dev-auth-muted,
        color-mix(in srgb, currentColor 68%, transparent)
      );
      font-size: 0.8125rem;
    }
    .status {
      min-height: 7rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
      color: var(
        --dev-auth-muted,
        color-mix(in srgb, currentColor 68%, transparent)
      );
    }
    .status lucide-icon,
    .spinner {
      width: 1.125rem;
      height: 1.125rem;
      animation: dev-auth-spin 900ms linear infinite;
    }
    .error {
      padding: 0.75rem;
      border-radius: calc(var(--dev-auth-radius, 0.5rem) - 2px);
      background: var(
        --dev-auth-error-surface,
        color-mix(in srgb, #dc2626 10%, transparent)
      );
      color: var(--dev-auth-error, #b91c1c);
      font-size: 0.875rem;
      line-height: 1.4;
    }
    .action {
      min-height: 2.75rem;
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
      padding: 0.625rem 1rem;
      border: 1px solid var(--dev-auth-primary, #2563eb);
      border-radius: calc(var(--dev-auth-radius, 0.5rem) - 2px);
      background: var(--dev-auth-primary, #2563eb);
      color: var(--dev-auth-primary-foreground, #fff);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      transition:
        filter 140ms ease,
        transform 140ms ease;
    }
    .action lucide-icon {
      width: 1rem;
      height: 1rem;
    }
    .action:hover:not(:disabled) {
      filter: brightness(0.94);
    }
    .action:active:not(:disabled) {
      transform: translateY(1px);
    }
    .action:disabled {
      cursor: wait;
      opacity: 0.72;
    }
    .action:focus-visible {
      outline: 3px solid var(--dev-auth-focus, #60a5fa);
      outline-offset: 2px;
    }
    .avatar {
      width: 2.75rem;
      height: 2.75rem;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(
        --dev-auth-avatar-surface,
        color-mix(in srgb, currentColor 10%, transparent)
      );
      font-size: 0.875rem;
      font-weight: 700;
    }
    @keyframes dev-auth-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .action {
        transition: none;
      }
      .status lucide-icon,
      .spinner {
        animation-duration: 1.8s;
      }
    }
  `,
})
export class DevAuthSignIn {
  protected readonly auth = inject(DevAuth);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly title = input('Sign in');
  readonly description = input('Continue with your DevAuth account.');
  readonly actionLabel = input('Continue with DevAuth');
  readonly returnTo = input('/');
  readonly errorMessage = input('');

  protected readonly redirecting = signal(false);
  protected readonly actionError = signal('');
  protected readonly visibleError = computed(
    () => this.actionError() || this.errorMessage(),
  );
  protected readonly isPending = computed(
    () => !this.#isBrowser || this.auth.isLoading(),
  );
  protected readonly externalLinkIcon = ExternalLink;
  protected readonly loaderIcon = LoaderCircle;

  protected signIn(): void {
    if (this.redirecting()) return;
    this.actionError.set('');
    this.redirecting.set(true);
    try {
      this.auth.login(this.returnTo());
    } catch {
      this.redirecting.set(false);
      this.actionError.set('Unable to start sign-in. Please try again.');
    }
  }

  protected displayIdentity(
    name: string | null | undefined,
    email: string | null | undefined,
  ): string {
    return clean(name) || clean(email) || 'Your account';
  }

  protected identityInitial(
    name: string | null | undefined,
    email: string | null | undefined,
  ): string {
    return (clean(name) || clean(email) || '?').charAt(0).toUpperCase();
  }
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? '';
}
