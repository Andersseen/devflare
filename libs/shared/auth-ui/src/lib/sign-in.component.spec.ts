import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AuthUser } from '@org/auth';
import { DevAuth } from '@org/auth';
import { DevAuthSignIn } from './sign-in.component';

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
  const currentUser = signal<AuthUser | null>(options.user ?? null);
  const loading = signal(options.loading ?? false);
  const auth = {
    user: currentUser.asReadonly(),
    isLoading: loading.asReadonly(),
    isAuthenticated: () => !!currentUser(),
    login: vi.fn(),
    logout: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [DevAuthSignIn],
    providers: [{ provide: DevAuth, useValue: auth }],
  });
  const fixture = TestBed.createComponent(DevAuthSignIn);
  fixture.detectChanges();
  return { fixture, auth, currentUser, loading };
}

describe('DevAuthSignIn', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders an anonymous sign-in action without credential fields', () => {
    const { fixture } = setup();

    expect(fixture.nativeElement.textContent).toContain('Sign in');
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });

  it('renders a stable loading state and no action', () => {
    const { fixture } = setup({ loading: true });

    expect(
      fixture.nativeElement.querySelector('[role="status"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('renders the current identity instead of a misleading action', () => {
    const { fixture } = setup({ user: user() });

    expect(fixture.nativeElement.textContent).toContain('Already signed in');
    expect(fixture.nativeElement.textContent).toContain('Andrii Pap');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('uses an email fallback for an incomplete identity', () => {
    const { fixture } = setup({ user: user({ name: '' }) });

    expect(fixture.nativeElement.textContent).toContain('andrii@example.com');
  });

  it('passes returnTo once and disables while navigation starts', () => {
    const { fixture, auth } = setup();
    fixture.componentRef.setInput('returnTo', '/projects');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    button.click();
    button.click();
    fixture.detectChanges();

    expect(auth.login).toHaveBeenCalledOnce();
    expect(auth.login).toHaveBeenCalledWith('/projects');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('supports concise consumer copy and callback errors', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('title', 'Welcome back');
    fixture.componentRef.setInput('description', 'Use your team identity.');
    fixture.componentRef.setInput('actionLabel', 'Continue');
    fixture.componentRef.setInput('errorMessage', 'That sign-in link expired.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Welcome back');
    expect(fixture.nativeElement.textContent).toContain(
      'Use your team identity.',
    );
    expect(fixture.nativeElement.textContent).toContain('Continue');
    expect(
      fixture.nativeElement.querySelector('[role="alert"]')?.textContent,
    ).toContain('expired');
  });

  it('surfaces a synchronous failure and allows retry', () => {
    const { fixture, auth } = setup();
    auth.login.mockImplementationOnce(() => {
      throw new Error('navigation unavailable');
    });

    const button = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(button.disabled).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[role="alert"]')?.textContent,
    ).toContain('Unable to start sign-in');
    button.click();
    expect(auth.login).toHaveBeenCalledTimes(2);
  });

  it('uses the loading branch during server rendering', () => {
    const currentUser = signal<AuthUser | null>(null);
    TestBed.configureTestingModule({
      imports: [DevAuthSignIn],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: DevAuth,
          useValue: {
            user: currentUser.asReadonly(),
            isLoading: () => false,
            login: vi.fn(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DevAuthSignIn);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[role="status"]'),
    ).not.toBeNull();
  });
});
