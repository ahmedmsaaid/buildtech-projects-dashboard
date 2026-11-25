/**
 * Sign-in for the people who run the platform. Kept apart from clinic staff
 * accounts: a different table and a different cookie, on a different
 * address, so a customer login can never reach these pages.
 */
import { randomBytes } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { hashToken, passwordMatches } from './passwords';
import { query } from './db';

const COOKIE = 'owner_session';
// Shorter than a clinic session: this account can reach every clinic.
const SESSION_DAYS = 7;

export interface Owner {
  id: string;
  email: string;
  name: string;
}

/** Signs in and sets the cookie. Returns false for a wrong email or password. */
export async function ownerSignIn(cookies: AstroCookies, email: string, password: string): Promise<boolean> {
  const [owner] = await query<{ id: string; password_hash: string }>('select id, password_hash from owners where email = $1', [
    email.trim().toLowerCase(),
  ]);
  if (!owner || !passwordMatches(password, owner.password_hash)) return false;

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query('insert into owner_sessions (token_hash, owner_id, expires_at) values ($1, $2, $3)', [hashToken(token), owner.id, expires.toISOString()]);
  cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: import.meta.env.PROD, path: '/', expires });
  return true;
}

/** The signed-in owner, or null. */
export async function currentOwner(cookies: AstroCookies): Promise<Owner | null> {
  const token = cookies.get(COOKIE)?.value;
  if (!token) return null;

  const [owner] = await query<Owner>(
    `select owners.id, owners.email, owners.name
     from owner_sessions join owners on owners.id = owner_sessions.owner_id
     where owner_sessions.token_hash = $1 and owner_sessions.expires_at > now()`,
    [hashToken(token)],
  );
  return owner ?? null;
}

export async function ownerSignOut(cookies: AstroCookies): Promise<void> {
  const token = cookies.get(COOKIE)?.value;
  if (token) await query('delete from owner_sessions where token_hash = $1', [hashToken(token)]);
  cookies.delete(COOKIE, { path: '/' });
}
