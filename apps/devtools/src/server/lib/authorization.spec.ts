import { isAllowed, parseAllowedUsers } from './authorization';

describe('DevTools authorization policy', () => {
  it('fails closed when unset or empty', () => {
    for (const raw of [undefined, '', ' , ']) {
      expect(
        isAllowed(parseAllowedUsers(raw), { id: 'u1', email: 'a@b.c' }),
      ).toBe(false);
    }
  });

  it('matches user ids exactly and emails case-insensitively', () => {
    const policy = parseAllowedUsers(' user-123 , Owner@Example.com ');
    expect(isAllowed(policy, { id: 'user-123', email: '' })).toBe(true);
    expect(isAllowed(policy, { id: 'USER-123', email: '' })).toBe(false);
    expect(isAllowed(policy, { id: 'x', email: 'owner@example.COM' })).toBe(
      true,
    );
  });

  it('does not grant access for merely being authenticated', () => {
    const policy = parseAllowedUsers('owner@example.com');
    expect(
      isAllowed(policy, { id: 'someone', email: 'someone@example.com' }),
    ).toBe(false);
  });

  it('never matches an empty email against the list', () => {
    expect(
      isAllowed(parseAllowedUsers('owner@example.com'), {
        id: 'x',
        email: ' ',
      }),
    ).toBe(false);
  });
});
