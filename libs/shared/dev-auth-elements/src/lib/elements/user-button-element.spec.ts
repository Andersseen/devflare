import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineDevAuthUserButton } from '../register';
import { provideDevAuthElements } from '../registry';
import { createFakeController, TEST_USER } from '../test-utils/fake-controller';
import type { AuthController } from '../controller/auth-controller';

defineDevAuthUserButton();

type Host = HTMLElement & { controller?: AuthController };

function mount(controller: AuthController): Host {
  const el = document.createElement('dev-auth-user-button') as Host;
  el.controller = controller;
  document.body.appendChild(el);
  return el;
}

describe('<dev-auth-user-button>', () => {
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
  });

  it('renders nothing when anonymous, leaving the decision to the consumer', () => {
    const { controller } = createFakeController({
      status: 'anonymous',
      user: null,
    });
    const el = mount(controller);

    expect(el.innerHTML.trim()).toBe('');
  });

  it('shows a labelled image avatar with a decorative alt', () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: { ...TEST_USER, image: 'https://example.com/a.png' },
    });
    const el = mount(controller);

    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(img?.getAttribute('alt')).toBe('');
    expect(
      el.querySelector('#dev-auth-trigger')?.getAttribute('aria-label'),
    ).toContain('Andrii Pap');
  });

  it('falls back to initials when there is no image', () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: { ...TEST_USER, image: null, name: 'Andrii Pap' },
    });
    const el = mount(controller);

    expect(el.querySelector('.dev-auth-avatar')?.textContent?.trim()).toBe(
      'AP',
    );
  });

  it('falls back to an email initial when there is no name', () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: { ...TEST_USER, image: null, name: '' },
    });
    const el = mount(controller);

    expect(el.querySelector('.dev-auth-avatar')?.textContent?.trim()).toBe('A');
  });

  it('falls back to a generic icon when neither name nor email is present', () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: { ...TEST_USER, image: null, name: '', email: '' },
    });
    const el = mount(controller);

    expect(el.querySelector('and-icon')).toBeTruthy();
  });

  it('opens an accessible menu and focuses its first item', async () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    const el = mount(controller);
    const trigger = el.querySelector('#dev-auth-trigger') as HTMLElement;

    trigger.click();
    await Promise.resolve();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    const el = mount(controller);
    const trigger = el.querySelector('#dev-auth-trigger') as HTMLElement;

    trigger.click();
    await Promise.resolve();
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('supports Arrow, Home and End menu navigation with wrapping', async () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    const el = document.createElement('dev-auth-user-button') as Host;
    const action = document.createElement('a');
    action.setAttribute('slot', 'menu-actions');
    action.setAttribute('role', 'menuitem');
    action.textContent = 'Settings';
    el.appendChild(action);
    el.controller = controller;
    document.body.appendChild(el);

    el.querySelector<HTMLElement>('#dev-auth-trigger')?.click();
    await Promise.resolve();

    const items = () => Array.from(el.querySelectorAll('[role="menuitem"]'));
    expect(items()).toHaveLength(2); // Settings + Sign out

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement).toBe(items()[1]);

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement).toBe(items()[0]); // wraps

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    );
    expect(document.activeElement).toBe(items()[1]);

    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
    expect(document.activeElement).toBe(items()[0]);
  });

  it('projects a consumer-supplied menu action and closes the menu when it is chosen', async () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    const clicked = vi.fn();
    const el = document.createElement('dev-auth-user-button') as Host;
    const action = document.createElement('a');
    action.setAttribute('slot', 'menu-actions');
    action.setAttribute('role', 'menuitem');
    action.textContent = 'Settings';
    action.addEventListener('click', clicked);
    el.appendChild(action);
    el.controller = controller;
    document.body.appendChild(el);

    el.querySelector<HTMLElement>('#dev-auth-trigger')?.click();
    await Promise.resolve();

    const settingsLink = el.querySelector('a[role="menuitem"]');
    expect(settingsLink?.textContent).toBe('Settings');
    settingsLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(
      el
        .querySelector<HTMLElement>('#dev-auth-trigger')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('delegates logout once, closes the menu, and clears through the controller', async () => {
    const { controller, setState } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    vi.mocked(controller.logout).mockImplementation(async () => {
      setState({ status: 'anonymous', user: null });
    });
    const el = mount(controller);
    const handler = vi.fn();
    el.addEventListener('dev-auth-logout', handler);

    el.querySelector<HTMLElement>('#dev-auth-trigger')?.click();
    await Promise.resolve();
    const signOut = el.querySelector('#dev-auth-signout') as HTMLElement;
    signOut.click();
    signOut.click(); // double-click guard
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.logout).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(el.innerHTML.trim()).toBe(''); // anonymous now renders nothing
  });

  it('keeps the menu open and announces a logout failure', async () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    vi.mocked(controller.logout).mockRejectedValueOnce(new Error('network'));
    const el = mount(controller);

    el.querySelector<HTMLElement>('#dev-auth-trigger')?.click();
    await Promise.resolve();
    el.querySelector<HTMLElement>('#dev-auth-signout')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(
      el
        .querySelector<HTMLElement>('#dev-auth-trigger')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      el.querySelector('#dev-auth-logout-error')?.hasAttribute('hidden'),
    ).toBe(false);
  });

  it('closes when a click lands outside the widget', async () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    const el = mount(controller);
    el.querySelector<HTMLElement>('#dev-auth-trigger')?.click();
    await Promise.resolve();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(
      el
        .querySelector<HTMLElement>('#dev-auth-trigger')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('falls back to the shared default controller when none is set explicitly', () => {
    const { controller } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    provideDevAuthElements(controller);

    const el = document.createElement('dev-auth-user-button');
    document.body.appendChild(el);

    expect(el.querySelector('#dev-auth-trigger')).toBeTruthy();
  });

  it('stops listening once disconnected, and resumes on reconnect', () => {
    const { controller, setState } = createFakeController({
      status: 'authenticated',
      user: TEST_USER,
    });
    const el = mount(controller);
    document.body.removeChild(el);

    expect(() => setState({ status: 'anonymous', user: null })).not.toThrow();

    document.body.appendChild(el);
    setState({ status: 'authenticated', user: TEST_USER });

    expect(el.querySelector('#dev-auth-trigger')).toBeTruthy();
  });
});
