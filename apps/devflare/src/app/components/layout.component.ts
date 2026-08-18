import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VoltSidebarService } from '@voltui/components';
import {
  SplitterContainerDirective,
  SplitterHandleDirective,
} from 'quartz-headless';
import { NavbarComponent } from './navbar.component';
import { SidebarComponent } from './sidebar.component';

/** Where the remembered width lives. */
const WIDTH_KEY = 'devflare.sidebar.width';

/**
 * Percentage bounds handed to the splitter. Deliberately loose: the pixel
 * limits that actually matter (a sidebar that can neither vanish nor eat the
 * page) are in styles.css, because they have to be pixels — 15% is cramped on a
 * laptop and enormous on a wide monitor. These only stop the drag running away.
 */
const MIN_PERCENT = 8;
const MAX_PERCENT = 40;
const DEFAULT_PERCENT = 18;

@Component({
  selector: 'app-layout',
  imports: [
    RouterOutlet,
    NavbarComponent,
    SidebarComponent,
    SplitterContainerDirective,
    SplitterHandleDirective,
  ],
  template: `
    <!--
      App shell: the navbar and sidebar stay put, only <main> scrolls.
      h-screen + min-h-0 is what keeps the sidebar footer pinned to the bottom.
    -->
    <div class="flex h-screen flex-col overflow-hidden bg-background">
      <app-navbar />

      <div
        class="flex min-h-0 flex-1"
        qzSplitterContainer
        [minSize]="minPercent"
        [maxSize]="maxPercent"
        [defaultPosition]="position()"
        (positionChange)="onPositionChange($event)"
        (dragStart)="dragging.set(true)"
        (dragEnd)="onDragEnd()"
      >
        <!--
          The width is published as a custom property rather than as a plain
          style, so a media query decides whether it applies at all: below md
          the sidebar is a fixed slide-over and this panel must take no space.
        -->
        <div
          [class.app-sidebar-panel]="!collapsed()"
          [style.--sidebar-w]="widthValue()"
        >
          <app-sidebar />
        </div>

        @if (!collapsed()) {
          <div
            qzSplitterHandle
            aria-label="Resize sidebar"
            class="hidden w-1 shrink-0 bg-border transition-colors hover:bg-primary/50 focus-visible:bg-primary/50 focus-visible:outline-none md:block"
          ></div>
        }

        <main class="min-w-0 flex-1 overflow-y-auto p-6 md:p-8">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class LayoutComponent {
  protected readonly sidebarService = inject(VoltSidebarService);

  protected readonly minPercent = MIN_PERCENT;
  protected readonly maxPercent = MAX_PERCENT;

  /** Collapsed is Volt's own icon rail; there is nothing to resize then. */
  protected readonly collapsed = this.sidebarService.isCollapsed;

  protected readonly position = signal(readStoredWidth());
  protected readonly dragging = signal(false);

  protected readonly widthValue = computed(() => `${this.position()}%`);

  protected onPositionChange(position: number): void {
    this.position.set(position);
    // Mid-drag this fires per pointer move; writing to localStorage on each one
    // would be dozens of writes per second for a value only the last of which
    // matters. Keyboard changes arrive with no drag around them, so they save
    // immediately.
    if (!this.dragging()) storeWidth(position);
  }

  protected onDragEnd(): void {
    this.dragging.set(false);
    storeWidth(this.position());
  }
}

/**
 * Read synchronously, because the splitter takes its starting position once at
 * init and ignores later changes to the input. Under SSR there is no
 * localStorage, so the server renders the default and the browser corrects it
 * on hydration — a style attribute, which hydration does not validate.
 */
function readStoredWidth(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_PERCENT;

  const stored = Number(localStorage.getItem(WIDTH_KEY));
  if (!Number.isFinite(stored) || stored <= 0) return DEFAULT_PERCENT;

  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, stored));
}

function storeWidth(position: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(WIDTH_KEY, String(Math.round(position)));
}
