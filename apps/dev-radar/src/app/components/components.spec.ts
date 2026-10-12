import { must } from '../../server/testing/must';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Info,
  Loader,
  LucideAngularModule,
  TriangleAlert,
} from 'lucide-angular';
import type { CiState } from '../../shared/ci-state';
import type { ConnectionDto } from '../../shared/dto';
import { CiBadgeComponent } from './ci-badge.component';
import { DisconnectedNoticeComponent } from './disconnected-notice.component';
import { PageStateComponent } from './page-state.component';

const icons = importProvidersFrom(
  LucideAngularModule.pick({
    CircleCheck,
    CircleDashed,
    CircleMinus,
    CircleX,
    Info,
    Loader,
    TriangleAlert,
  }),
);

@Component({
  selector: 'app-host',
  imports: [CiBadgeComponent, DisconnectedNoticeComponent, PageStateComponent],
  template: `
    <app-ci-badge [state]="state" />
    <app-disconnected-notice [connection]="connection" [empty]="empty" />
    <app-page-state
      [kind]="kind"
      message="Server said no"
      title="Nothing"
      (retry)="retried = retried + 1"
      >empty body</app-page-state
    >
  `,
})
class HostComponent {
  state: CiState = 'success';
  connection: ConnectionDto = {
    configured: true,
    missing: [],
    installUrl: null,
    webhookConfigured: true,
  };
  empty = false;
  kind: 'loading' | 'error' | 'empty' = 'loading';
  retried = 0;
}

function render(patch: Partial<HostComponent>) {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [provideRouter([]), icons],
  });
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('CI badge', () => {
  it.each<[CiState, string]>([
    ['success', 'Passing'],
    ['failure', 'Failing'],
    ['pending', 'Running'],
    ['none', 'No CI'],
    ['unknown', 'Unknown'],
  ])('%s is labelled in words, not colour alone', (state, label) => {
    const { el } = render({ state });
    const badge = must(el.querySelector('app-ci-badge span'));
    expect(badge.textContent?.trim()).toBe(label);
    expect(badge.getAttribute('data-ci')).toBe(state);
  });

  it('"No CI" is never styled as success', () => {
    const { el } = render({ state: 'none' });
    const classes = must(el.querySelector('app-ci-badge span')).className;
    expect(classes).not.toMatch(/emerald/);
  });
});

describe('disconnected notice', () => {
  it('says plainly that GitHub is not connected, and that nothing is sample data', () => {
    const { el } = render({
      connection: {
        configured: false,
        missing: ['GITHUB_APP_ID'],
        installUrl: null,
        webhookConfigured: false,
      },
    });
    const notice = must(
      el.querySelector('[data-testid="disconnected-notice"]'),
    );
    expect(notice.textContent).toContain('GitHub is not connected');
    expect(notice.textContent).toContain('Nothing below is sample data');
  });

  it('is silent when connected with data', () => {
    const { el } = render({});
    expect(el.querySelector('[data-testid="disconnected-notice"]')).toBeNull();
    expect(
      el.querySelector('[data-testid="no-installation-notice"]'),
    ).toBeNull();
  });

  it('explains a connected-but-empty state differently', () => {
    const { el } = render({ empty: true });
    expect(el.querySelector('[data-testid="disconnected-notice"]')).toBeNull();
    expect(
      el.querySelector('[data-testid="no-installation-notice"]')?.textContent,
    ).toContain('no repositories are synced');
  });
});

describe('page state', () => {
  it('loading is announced to assistive tech', () => {
    const { el } = render({ kind: 'loading' });
    expect(el.querySelector('app-page-state [role="status"]')).not.toBeNull();
  });

  it('error shows the message and offers retry', () => {
    const { fixture, el } = render({ kind: 'error' });
    expect(
      el.querySelector('app-page-state [role="alert"]')?.textContent,
    ).toContain('Server said no');
    (el.querySelector('app-page-state button') as HTMLButtonElement).click();
    expect(fixture.componentInstance.retried).toBe(1);
  });

  it('empty shows projected guidance', () => {
    const { el } = render({ kind: 'empty' });
    expect(el.querySelector('app-page-state')?.textContent).toContain(
      'empty body',
    );
  });
});
