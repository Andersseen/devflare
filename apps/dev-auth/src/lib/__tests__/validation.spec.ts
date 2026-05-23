import { describe, it, expect } from 'vitest';
import { isValidEmail, isValidPassword, getPasswordStrength } from '../validation';

describe('validation', () => {
  describe('isValidEmail', () => {
    it('returns true for valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.io')).toBe(true);
    });

    it('returns false for invalid emails', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('test@.com')).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    it('returns true for strong passwords', () => {
      expect(isValidPassword('Password123')).toBe(true);
      expect(isValidPassword('MyS3cureP@ss')).toBe(true);
    });

    it('returns false for weak passwords', () => {
      expect(isValidPassword('')).toBe(false);
      expect(isValidPassword('short1')).toBe(false);
      expect(isValidPassword('onlyletters')).toBe(false);
      expect(isValidPassword('12345678')).toBe(false);
      expect(isValidPassword('pass')).toBe(false);
    });
  });

  describe('getPasswordStrength', () => {
    it('returns valid for strong passwords', () => {
      expect(getPasswordStrength('Password123')).toEqual({ valid: true });
    });

    it('returns error for short passwords', () => {
      expect(getPasswordStrength('short1')).toEqual({
        valid: false,
        message: 'Password must be at least 8 characters long',
      });
    });

    it('returns error for passwords without letters', () => {
      expect(getPasswordStrength('12345678')).toEqual({
        valid: false,
        message: 'Password must contain at least one letter',
      });
    });

    it('returns error for passwords without numbers', () => {
      expect(getPasswordStrength('password')).toEqual({
        valid: false,
        message: 'Password must contain at least one number',
      });
    });
  });
});
