import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineDevAuthSignIn } from '../register';
import { provideDevAuthElements } from '../registry';
import { createFakeController, TEST_USER } from '../test-utils/fake-controller';
import type { AuthController } from '../controller/auth-controller';

defineDevAuthSignIn();

function mount(controller: AuthController): HTMLElement {
  const el = document.createElement('dev-auth-sign-in') as HTMLElement & {
    controller?: AuthController;
  };
  el.controller = controller;
  document.body.appendChild(el);
  return el;
}

describe('<dev-auth-sign-in>', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders a loading placeholder while the session is pending', () => {
    const { controller } = createFakeController({
      status: 'loading',
      user: null,
    });
    const el = mount(controller);

    expect(el.querySelector('[role="status"]')).toBeTruthy();
    expect(el.querySelector('#dev-auth-action')).toBeNull();
  });

  it('renders an anonymous sign-in action with no credential fields', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = mount(controller);

    expect(el.querySelector('#dev-auth-action')).toBeTruthy();
    expect(el.querySelector('input')).toBeNull();
  });

  it('renders the current identity instead of a misleading action when already signed in', () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    const el = mount(controller);

    expect(el.textContent).toContain('Andrii Pap');
    expect(el.querySelector('#dev-auth-action')).toBeNull();
  });

  it('falls back to email when the authenticated user has no name', () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: { ...TEST_USER, name: '' },
    });
    const el = mount(controller);

    expect(el.textContent).toContain('andrii@example.com');
  });

  it('supports consumer-configured copy via attributes', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = document.createElement('dev-auth-sign-in') as HTMLElement & {
      controller?: AuthController;
    };
    el.setAttribute('heading', 'Welcome to Example');
    el.setAttribute('description', 'Continue to your workspace');
    el.setAttribute('action-label', 'Continue to Example');
    el.controller = controller;
    document.body.appendChild(el);

    expect(el.textContent).toContain('Welcome to Example');
    expect(el.textContent).toContain('Continue to your workspace');
    expect(el.textContent).toContain('Continue to Example');
  });

  it('surfaces a consumer-supplied error message via role=alert', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = document.createElement('dev-auth-sign-in') as HTMLElement & {
      controller?: AuthController;
    };
    el.setAttribute('error-message', 'That link has expired.');
    el.controller = controller;
    document.body.appendChild(el);

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('expired');
  });

  it('calls login() with a sanitized returnTo on click', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = document.createElement('dev-auth-sign-in') as HTMLElement & {
      controller?: AuthController;
    };
    el.setAttribute('return-to', '/projects');
    el.controller = controller;
    document.body.appendChild(el);

    el.querySelector<HTMLElement>('#dev-auth-action')?.click();

    expect(controller.login).toHaveBeenCalledWith('/projects');
  });

  it('rejects an absolute or protocol-relative returnTo as an open-redirect risk', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = document.createElement('dev-auth-sign-in') as HTMLElement & {
      controller?: AuthController;
    };
    el.setAttribute('return-to', '//evil.example.com');
    el.controller = controller;
    document.body.appendChild(el);

    el.querySelector<HTMLElement>('#dev-auth-action')?.click();

    expect(controller.login).toHaveBeenCalledWith('/');
  });

  it('defaults returnTo to / when not set', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = mount(controller);

    el.querySelector<HTMLElement>('#dev-auth-action')?.click();

    expect(controller.login).toHaveBeenCalledWith('/');
  });

  it('dispatches dev-auth-login before navigating away', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = mount(controller);
    const handler = vi.fn();
    el.addEventListener('dev-auth-login', handler);

    el.querySelector<HTMLElement>('#dev-auth-action')?.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('guards against a double click while redirecting', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = mount(controller);
    const button = el.querySelector('#dev-auth-action') as HTMLElement;

    button.click();
    button.click();

    expect(controller.login).toHaveBeenCalledTimes(1);
  });

  it('surfaces a synchronous login() failure and allows retry', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    vi.mocked(controller.login).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const el = mount(controller);
    const button = el.querySelector('#dev-auth-action') as HTMLElement;

    button.click();

    const error = el.querySelector('#dev-auth-action-error');
    expect(error?.hasAttribute('hidden')).toBe(false);

    button.click();
    expect(controller.login).toHaveBeenCalledTimes(2);
  });

  it('re-renders when the controller transitions from loading to anonymous', () => {
    const { controller, setState } = createFakeController({
      status: 'loading',
      user: null,
    });
    const el = mount(controller);
    expect(el.querySelector('#dev-auth-action')).toBeNull();

    setState({ status: 'anonymous', user: null });

    expect(el.querySelector('#dev-auth-action')).toBeTruthy();
  });

  it('falls back to the shared default controller when none is set explicitly', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    provideDevAuthElements(controller);

    const el = document.createElement('dev-auth-sign-in');
    document.body.appendChild(el);

    expect(el.querySelector('#dev-auth-action')).toBeTruthy();
  });

  it('stops listening to the controller once disconnected', () => {
    const { controller, setState } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = mount(controller);
    el.remove();

    expect(() =>
      setState({ status: 'authenticated', user: TEST_USER }),
    ).not.toThrow();
    expect(el.textContent).not.toContain('Andrii Pap');
  });
});
