import { describe, it, expect } from 'vitest';
import {
  defineDevAuthElements,
  defineDevAuthSignIn,
  defineDevAuthUserButton,
} from './register';

describe('registration', () => {
  it('registers both custom elements', () => {
    defineDevAuthElements();

    expect(customElements.get('dev-auth-sign-in')).toBeDefined();
    expect(customElements.get('dev-auth-user-button')).toBeDefined();
  });

  it('is idempotent: calling it repeatedly does not throw', () => {
    expect(() => {
      defineDevAuthElements();
      defineDevAuthElements();
      defineDevAuthSignIn();
      defineDevAuthUserButton();
    }).not.toThrow();
  });

  it('registers and-web-components primitives referenced by the templates', () => {
    defineDevAuthElements();

    for (const tag of [
      'and-button',
      'and-card',
      'and-card-header',
      'and-card-title',
      'and-card-description',
      'and-card-content',
      'and-icon',
      'and-menu-list',
      'and-skeleton',
    ]) {
      expect(customElements.get(tag), tag).toBeDefined();
    }
  });

  it('individual registration functions each register their own element', () => {
    defineDevAuthSignIn();
    expect(customElements.get('dev-auth-sign-in')).toBeDefined();

    defineDevAuthUserButton();
    expect(customElements.get('dev-auth-user-button')).toBeDefined();
  });
});
