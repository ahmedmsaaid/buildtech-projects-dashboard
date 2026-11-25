/**
 * Password and token hashing. Must stay identical to the platform project's
 * (src/lib/auth.ts there): both read and write the same password hashes.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

/** A random password to hand to a new account once; the user is told to keep it safe. */
export function generatePassword(): string {
  return randomBytes(9).toString('base64url');
}

export function passwordMatches(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
