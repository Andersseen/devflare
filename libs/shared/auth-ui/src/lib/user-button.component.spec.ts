import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AuthUser } from '@org/auth';
import { DevAuth } from '@org/auth';
import { DevAuthUserButton } from './user-button.component';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    name: 'Andrii Pap',
    email: 'andrii@example.com',
    emailVerified: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function setup(options: { loading?: boolean; user?: AuthUser | null } = {}) {
  const currentUser = signal<AuthUser | null>(
    options.user === undefined ? user() : options.user,
  );
  const loading = signal(options.loading ?? false);
  const auth = {
    user: currentUser.asReadonly(),
    isLoading: loading.asReadonly(),
    logout: vi.fn().mockResolvedValue(undefined),
  };

  TestBed.configureTestingModule({
    imports: [DevAuthUserButton],
    providers: [{ provide: DevAuth, useValue: auth }],
  });
  const fixture = TestBed.createComponent(DevAuthUserButton);
  fixture.detectChanges();
  return { fixture, auth, currentUser };
}

async function openMenu(fixture: ReturnType<typeof setup>['fixture']) {
  const trigger = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  trigger.click();
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();
  return {
    trigger,
    menu: document.body.querySelector('[role="menu"]') as HTMLElement,
  };
}

describe('DevAuthUserButton', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    document.body
      .querySelectorAll('[role="menu"]')
      .forEach((node) => node.parentElement?.remove());
  });

  it('renders loading and anonymous states safely', () => {
    const loadingCase = setup({ loading: true });
    expect(
      loadingCase.fixture.nativeElement.querySelector('[role="status"]'),
    ).not.toBeNull();
    loadingCase.fixture.destroy();
    TestBed.resetTestingModule();

    const anonymousCase = setup({ user: null });
    expect(
      anonymousCase.fixture.nativeElement.querySelector('button'),
    ).toBeNull();
  });

  it('renders a labelled image avatar', () => {
    const { fixture } = setup({ user: user({ image: '/avatar.png' }) });
    const button = fixture.nativeElement.querySelector('button');

    expect(button.getAttribute('aria-label')).toContain('Andrii Pap');
    expect(button.querySelector('img')?.getAttribute('src')).toBe(
      '/avatar.png',
    );
    expect(button.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('uses initials, email, then a generic icon as identity fallbacks', () => {
    const named = setup();
    expect(named.fixture.nativeElement.textContent).toContain('AP');
    named.fixture.destroy();
    TestBed.resetTestingModule();

    const emailed = setup({ user: user({ name: '' }) });
    expect(emailed.fixture.nativeElement.textContent).toContain('A');
    emailed.fixture.destroy();
    TestBed.resetTestingModule();

    const generic = setup({ user: user({ name: '', email: '' }) });
    expect(
      generic.fixture.nativeElement.querySelector('lucide-icon'),
    ).not.toBeNull();
  });

  it('opens an accessible menu and focuses its first item', async () => {
    const { fixture } = setup();
    const { trigger, menu } = await openMenu(fixture);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu).not.toBeNull();
    expect(menu.textContent).toContain('Andrii Pap');
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const { fixture } = setup();
    const { trigger } = await openMenu(fixture);

    const menu = document.body.querySelector('[role="menu"]') as HTMLElement;
    menu.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    await Promise.resolve();

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('supports Arrow, Home and End menu navigation', async () => {
    const { fixture } = setup();
    const { menu } = await openMenu(fixture);
    const item = menu.querySelector('[role="menuitem"]') as HTMLButtonElement;

    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      item.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(document.activeElement).toBe(item);
    }
  });

  it('delegates logout once, closes, and clears the user through the adapter', async () => {
    const { fixture, auth, currentUser } = setup();
    auth.logout.mockImplementation(async () => currentUser.set(null));
    const { menu } = await openMenu(fixture);
    const logout = menu.querySelector('[role="menuitem"]') as HTMLButtonElement;

    logout.click();
    logout.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(auth.logout).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('keeps the menu open and announces logout failures', async () => {
    const { fixture, auth } = setup();
    auth.logout.mockRejectedValue(new Error('network'));
    const { menu } = await openMenu(fixture);

    (menu.querySelector('[role="menuitem"]') as HTMLButtonElement).click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(
      document.body.querySelector('[role="alert"]')?.textContent,
    ).toContain('Unable to sign out');
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('uses the loading branch during server rendering', () => {
    const currentUser = signal<AuthUser | null>(null);
    TestBed.configureTestingModule({
      imports: [DevAuthUserButton],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: DevAuth,
          useValue: {
            user: currentUser.asReadonly(),
            isLoading: () => false,
            logout: vi.fn(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DevAuthUserButton);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[role="status"]'),
    ).not.toBeNull();
  });
});
