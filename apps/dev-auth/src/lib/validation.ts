/**
 * Validates an email address format.
 */
export function isValidEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Validates password strength.
 * Minimum 8 characters, at least one letter and one number.
 */
export function isValidPassword(password: string): boolean {
  if (password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

/**
 * Returns a user-friendly password strength message.
 */
export function getPasswordStrength(password: string): {
  valid: boolean;
  message?: string;
} {
  if (password.length < 8) {
    return {
      valid: false,
      message: 'Password must be at least 8 characters long',
    };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one letter',
    };
  }
  if (!/\d/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one number',
    };
  }
  return { valid: true };
}
