import { Component, signal } from '@angular/core';
import { VoltButton } from '@voltui/components';
import { ApplicationsPanel } from './applications-panel';
import { UsersPanel } from './users-panel';
import { SessionsPanel } from './sessions-panel';
import { ProvidersPanel } from './providers-panel';

type IdentityTab = 'applications' | 'users' | 'sessions' | 'providers';

/**
 * The dev-auth control plane, from DevFlare's Settings → Identity tab.
 *
 * Four areas, matching what dev-auth actually is:
 *
 *   Applications — OAuth consumer apps trusted to use this SSO.
 *   Users        — identities dev-auth knows about.
 *   Sessions     — their live sessions.
 *   Providers    — how someone proves who they are (GitHub, email/password),
 *                  kept separate from Applications on purpose — a provider is
 *                  not a consumer, and conflating the two was the thing this
 *                  tab existed to fix.
 *
 * A plain button row + `@switch`, not a nested `<volt-tabs>` — this section
 * already lives inside the Settings page's own `<volt-tabs-content
 * value="identity">`, and ng-primitives 0.110.2's tab panel does not resolve
 * the *inner* tabset's selection when nested one level down: its
 * `data-state`/visibility ends up computed against the *outer* Settings
 * tabset instead (every inner panel showed `display: none`, confirmed by
 * inspecting the rendered DOM, even though the inner trigger row correctly
 * showed the right tab as active). Filed as a known quirk rather than a
 * repo-specific bug — this repo's STATE.md already tracks an unrelated
 * ng-primitives 0.110.2 issue (a harmless `NgpLabel` SSR warning), so this is
 * the second. Worth revisiting if VoltTabs/ng-primitives ships a fix.
 *
 * Everything here goes through DevFlare's own server (server/routes/api/admin),
 * which forwards to dev-auth with a service token. Nothing in this tree holds
 * a credential for dev-auth, and none of it renders a credential form for
 * *end users* — sign-in itself stays hosted on the provider.
 */
@Component({
  selector: 'app-identity-section',
  imports: [
    VoltButton,
    ApplicationsPanel,
    UsersPanel,
    SessionsPanel,
    ProvidersPanel,
  ],
  template: `
    <div
      class="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground mb-4"
    >
      @for (tab of tabs; track tab.value) {
        <volt-button
          variant="ghost"
          size="sm"
          class="rounded-sm"
          [class.bg-background]="activeTab() === tab.value"
          [class.text-foreground]="activeTab() === tab.value"
          [class.shadow-sm]="activeTab() === tab.value"
          (click)="activeTab.set(tab.value)"
        >
          {{ tab.label }}
        </volt-button>
      }
    </div>

    @switch (activeTab()) {
      @case ('applications') {
        <app-identity-applications-panel />
      }
      @case ('users') {
        <app-identity-users-panel />
      }
      @case ('sessions') {
        <app-identity-sessions-panel />
      }
      @case ('providers') {
        <app-identity-providers-panel />
      }
    }
  `,
})
export class IdentitySection {
  readonly tabs: { value: IdentityTab; label: string }[] = [
    { value: 'applications', label: 'Applications' },
    { value: 'users', label: 'Users' },
    { value: 'sessions', label: 'Sessions' },
    { value: 'providers', label: 'Providers' },
  ];

  activeTab = signal<IdentityTab>('applications');
}
