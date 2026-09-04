import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  LoaderCircle,
  LogOut,
  LucideAngularModule,
  UserRound,
} from 'lucide-angular';
import { DevAuth } from '@org/auth';
import { OverlayTriggerDirective } from 'quartz-headless';

const MENU_ITEM_SELECTOR =
  '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])';

@Component({
  selector: 'dev-auth-user-button',
  imports: [LucideAngularModule, OverlayTriggerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isPending()) {
      <span
        class="avatar placeholder"
        role="status"
        aria-label="Loading account"
      >
        <lucide-icon [img]="loaderIcon" aria-hidden="true" />
      </span>
    } @else if (auth.user(); as user) {
      <button
        #trigger
        #overlay="qzOverlay"
        type="button"
        class="trigger"
        qzOverlayTrigger
        [overlayTemplate]="menu"
        placement="bottom-end"
        [offset]="8"
        aria-haspopup="menu"
        [attr.aria-expanded]="overlay.isOpen()"
        [attr.aria-label]="'Account menu for ' + displayIdentity()"
        (opened)="onMenuOpened()"
        (closed)="onMenuClosed()"
      >
        <span class="avatar">
          @if (user.image) {
            <img [src]="user.image" alt="" />
          } @else if (initials(); as value) {
            <span aria-hidden="true">{{ value }}</span>
          } @else {
            <lucide-icon [img]="userIcon" aria-hidden="true" />
          }
        </span>
      </button>

      <ng-template #menu>
        <div
          #menuPanel
          class="menu"
          role="menu"
          tabindex="-1"
          aria-label="Account"
          (keydown)="onMenuKeydown($event)"
          (click)="onMenuClick($event)"
        >
          <div class="identity" role="presentation">
            @if (cleanName(); as name) {
              <strong>{{ name }}</strong>
            }
            @if (cleanEmail(); as email) {
              <span>{{ email }}</span>
            }
            @if (!cleanName() && !cleanEmail()) {
              <strong>Signed-in account</strong>
            }
          </div>

          <ng-content select="[devAuthUserMenuActions]" />

          <div class="separator" role="separator"></div>
          <button
            type="button"
            class="menu-item"
            role="menuitem"
            [disabled]="signingOut()"
            [attr.aria-busy]="signingOut()"
            (click)="signOut($event)"
          >
            <lucide-icon
              [img]="signingOut() ? loaderIcon : logoutIcon"
              aria-hidden="true"
            />
            {{ signingOut() ? 'Signing out...' : 'Sign out' }}
          </button>
          @if (logoutError()) {
            <p class="error" role="alert">
              Unable to sign out. Please try again.
            </p>
          }
        </div>
      </ng-template>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      color: var(--dev-auth-foreground, inherit);
      font: inherit;
    }
    .trigger {
      width: 2.75rem;
      height: 2.75rem;
      display: inline-grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .trigger:focus-visible {
      outline: 3px solid var(--dev-auth-focus, #60a5fa);
      outline-offset: 2px;
    }
    .avatar {
      box-sizing: border-box;
      width: 2.25rem;
      height: 2.25rem;
      display: grid;
      place-items: center;
      overflow: hidden;
      border: 1px solid
        var(
          --dev-auth-border,
          color-mix(in srgb, currentColor 18%, transparent)
        );
      border-radius: 50%;
      background: var(
        --dev-auth-avatar-surface,
        color-mix(in srgb, currentColor 10%, transparent)
      );
      color: var(--dev-auth-avatar-foreground, inherit);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .avatar lucide-icon {
      width: 1rem;
      height: 1rem;
    }
    .placeholder {
      width: 2.75rem;
      height: 2.75rem;
      border-color: transparent;
    }
    .placeholder lucide-icon {
      animation: dev-auth-spin 900ms linear infinite;
    }
    .menu {
      box-sizing: border-box;
      width: min(18rem, calc(100vw - 1rem));
      padding: 0.375rem;
      border: 1px solid
        var(--dev-auth-border, color-mix(in srgb, CanvasText 18%, transparent));
      border-radius: var(--dev-auth-radius, 0.5rem);
      background: var(--dev-auth-surface, Canvas);
      color: var(--dev-auth-foreground, CanvasText);
      box-shadow: var(--dev-auth-shadow, 0 12px 32px rgb(0 0 0 / 16%));
      font: inherit;
    }
    .identity {
      display: grid;
      gap: 0.1875rem;
      min-width: 0;
      padding: 0.75rem;
    }
    .identity strong,
    .identity span {
      overflow-wrap: anywhere;
      letter-spacing: 0;
    }
    .identity strong {
      font-size: 0.875rem;
      line-height: 1.35;
    }
    .identity span {
      color: var(
        --dev-auth-muted,
        color-mix(in srgb, currentColor 68%, transparent)
      );
      font-size: 0.8125rem;
      line-height: 1.35;
    }
    .separator {
      height: 1px;
      margin: 0.25rem 0;
      background: var(
        --dev-auth-border,
        color-mix(in srgb, currentColor 18%, transparent)
      );
    }
    .menu-item {
      box-sizing: border-box;
      min-height: 2.75rem;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.75rem;
      border: 0;
      border-radius: calc(var(--dev-auth-radius, 0.5rem) - 2px);
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.875rem;
      text-align: left;
      cursor: pointer;
    }
    .menu-item:hover:not(:disabled),
    .menu-item:focus-visible {
      background: var(
        --dev-auth-hover,
        color-mix(in srgb, currentColor 9%, transparent)
      );
    }
    .menu-item:focus-visible {
      outline: 2px solid var(--dev-auth-focus, #60a5fa);
      outline-offset: -2px;
    }
    .menu-item:disabled {
      cursor: wait;
      opacity: 0.7;
    }
    .menu-item lucide-icon {
      width: 1rem;
      height: 1rem;
      flex: none;
    }
    .error {
      margin: 0;
      padding: 0.5rem 0.75rem;
      color: var(--dev-auth-error, #b91c1c);
      font-size: 0.8125rem;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    @keyframes dev-auth-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .placeholder lucide-icon {
        animation-duration: 1.8s;
      }
    }
  `,
})
export class DevAuthUserButton {
  protected readonly auth = inject(DevAuth);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #document = inject(DOCUMENT);
  private readonly overlay = viewChild(OverlayTriggerDirective);
  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menuPanel = viewChild<ElementRef<HTMLElement>>('menuPanel');

  protected readonly signingOut = signal(false);
  protected readonly logoutError = signal(false);
  protected readonly isPending = computed(
    () => !this.#isBrowser || this.auth.isLoading(),
  );
  protected readonly cleanName = computed(() => clean(this.auth.user()?.name));
  protected readonly cleanEmail = computed(() =>
    clean(this.auth.user()?.email),
  );
  protected readonly displayIdentity = computed(
    () => this.cleanName() || this.cleanEmail() || 'signed-in account',
  );
  protected readonly initials = computed(() =>
    makeInitials(this.cleanName(), this.cleanEmail()),
  );
  protected readonly userIcon = UserRound;
  protected readonly logoutIcon = LogOut;
  protected readonly loaderIcon = LoaderCircle;

  protected onMenuOpened(): void {
    this.logoutError.set(false);
    if (!this.#isBrowser) return;
    queueMicrotask(() => this.menuItems()[0]?.focus());
  }

  protected onMenuClosed(): void {
    if (!this.#isBrowser) return;
    this.trigger()?.nativeElement.focus();
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.overlay()?.close();
      return;
    }

    const items = this.menuItems();
    if (!items.length) return;
    const index = Math.max(
      0,
      items.indexOf(this.#document.activeElement as HTMLElement),
    );
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    if (event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    }
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  }

  protected onMenuClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[role="menuitem"]',
    );
    if (target && !target.classList.contains('menu-item')) {
      this.overlay()?.close();
    }
  }

  protected async signOut(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.logoutError.set(false);
    try {
      await this.auth.logout();
      this.overlay()?.close();
    } catch {
      this.logoutError.set(true);
    } finally {
      this.signingOut.set(false);
    }
  }

  private menuItems(): HTMLElement[] {
    return Array.from(
      this.menuPanel()?.nativeElement.querySelectorAll<HTMLElement>(
        MENU_ITEM_SELECTOR,
      ) ?? [],
    );
  }
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function makeInitials(name: string, email: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}`.toUpperCase();
  }
  return (words[0] || email).charAt(0).toUpperCase();
}
