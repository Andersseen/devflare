import { describe, it, expect } from 'vitest';
import { createClient } from './auth-client';

describe('auth-client', () => {
  it('should create an auth client', () => {
    const client = createClient();
    expect(client).toBeDefined();
    expect(client.signIn).toBeDefined();
    expect(client.signUp).toBeDefined();
    expect(client.signOut).toBeDefined();
    expect(client.getSession).toBeDefined();
  });
});
