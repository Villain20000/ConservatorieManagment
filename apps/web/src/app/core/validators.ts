import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Minimum password length, shared by every screen that sets a password.
 * Mirrors the API's own minimum so a password accepted on one screen can
 * always be accepted on another.
 */
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/**
 * Group-level validator: the control named `passwordKey` must equal the one
 * named `confirmKey`. Attach it to the `FormGroup` that owns both controls.
 */
export function passwordsMatch(passwordKey: string, confirmKey: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.get(passwordKey)?.value;
    const confirmation = control.get(confirmKey)?.value;
    return password === confirmation ? null : { mismatch: true };
  };
}

/** How many of lowercase / uppercase / digit / symbol appear in the value. */
function characterClasses(value: string): number {
  let classes = 0;
  if (/[a-z]/.test(value)) classes += 1;
  if (/[A-Z]/.test(value)) classes += 1;
  if (/\d/.test(value)) classes += 1;
  if (/[^A-Za-z0-9]/.test(value)) classes += 1;
  return classes;
}

/**
 * Rough strength signal for the UI hint. Length carries the most weight: a
 * long passphrase outranks a short password with many character classes.
 */
export function passwordStrength(value: string | null | undefined): PasswordStrength {
  const password = value ?? '';
  const classes = characterClasses(password);

  if (password.length < 8) return 'weak';
  if (password.length < PASSWORD_MIN_LENGTH && classes < 3) return 'weak';
  if (password.length >= PASSWORD_MIN_LENGTH && classes >= 3) {
    return password.length >= 14 || classes === 4 ? 'strong' : 'fair';
  }
  return 'fair';
}
