import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DropdownComponent } from './dropdown.component';
import { LucideAngularModule } from 'lucide-angular';

export type NavSection = 'deployment' | 'tools';

@Component({
  selector: 'ui-navbar',
  imports: [RouterLink, DropdownComponent, LucideAngularModule],
  template: `
    <header
      class="h-16 bg-surface border-b border-border flex items-center px-4 md:px-6 shrink-0 z-20 justify-between gap-3"
    >
      <div class="flex items-center gap-4">
        <button
          class="md:hidden -ml-2 p-2 text-text-muted hover:bg-secondary rounded-lg"
          (click)="menuClick.emit()"
        >
          <lucide-icon name="menu" [size]="24"></lucide-icon>
        </button>

        <div class="flex items-center gap-3 cursor-pointer" routerLink="/">
          <div
            class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-indigo-500/30"
          >
            DF
          </div>
          <h1
            class="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-text to-text-muted hidden sm:block"
          >
            DevFlare
          </h1>
        </div>

        <!-- Navbar Links (Standard Style) -->
        <div class="hidden md:flex ml-8 items-center gap-1">
          <button
            (click)="setSection('deployment')"
            class="px-3 py-2 text-sm font-medium rounded-md transition-all relative"
            [class.text-primary]="activeSection === 'deployment'"
            [class.text-text-muted]="activeSection !== 'deployment'"
            [class.hover:text-text]="activeSection !== 'deployment'"
          >
            Deployment @if (activeSection === 'deployment') {
            <span
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full mx-3"
            ></span>
            }
          </button>
          <button
            (click)="setSection('tools')"
            class="px-3 py-2 text-sm font-medium rounded-md transition-all relative"
            [class.text-primary]="activeSection === 'tools'"
            [class.text-text-muted]="activeSection !== 'tools'"
            [class.hover:text-text]="activeSection !== 'tools'"
          >
            DevTools @if (activeSection === 'tools') {
            <span
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full mx-3"
            ></span>
            }
          </button>
        </div>
      </div>

      <div class="flex items-center gap-4">
        @if (currentUser) {
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-text hidden md:block">{{ currentUser.name }}</span>

          <ui-dropdown>
            <button
              trigger
              class="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium text-text-muted ring-2 ring-surface hover:ring-primary transition-all focus:outline-none cursor-pointer"
            >
              {{ currentUser.avatar || 'U' }}
            </button>

            <div menu class="w-48">
              <div class="px-4 py-3 border-b border-border">
                <p class="text-sm">Signed in as</p>
                <p class="text-sm font-medium text-text truncate">{{ currentUser.email }}</p>
              </div>

              <!-- Mobile Switcher in Dropdown -->
              <div class="md:hidden px-2 py-2 border-b border-border space-y-1">
                <p class="px-2 text-xs text-text-muted mb-1 uppercase tracking-wider font-semibold">
                  Switch View
                </p>
                <button
                  (click)="setSection('deployment')"
                  class="w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors"
                  [class.bg-primary]="activeSection === 'deployment'"
                  [class.text-primary-foreground]="activeSection === 'deployment'"
                  [class.hover:bg-secondary]="activeSection !== 'deployment'"
                >
                  Deployment
                </button>
                <button
                  (click)="setSection('tools')"
                  class="w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors"
                  [class.bg-primary]="activeSection === 'tools'"
                  [class.text-primary-foreground]="activeSection === 'tools'"
                  [class.hover:bg-secondary]="activeSection !== 'tools'"
                >
                  DevTools
                </button>
              </div>

              <div class="py-1">
                <a
                  routerLink="/settings"
                  class="block px-4 py-2 text-sm text-text hover:bg-secondary cursor-pointer"
                  >Settings</a
                >
                <button
                  (click)="logout.emit()"
                  class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          </ui-dropdown>
        </div>
        } @else {
        <a
          routerLink="/auth/sign-in"
          class="text-sm font-medium text-primary hover:text-primary/80 hover:bg-accent px-4 py-2 rounded-lg transition-colors"
        >
          Sign In
        </a>
        }
      </div>
    </header>
  `,
})
export class NavbarComponent {
  @Input() currentUser: any;
  @Input() activeSection: NavSection = 'deployment';
  @Output() sectionChange = new EventEmitter<NavSection>();
  @Output() menuClick = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  setSection(section: NavSection) {
    this.sectionChange.emit(section);
  }
}
