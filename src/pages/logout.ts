import type { APIRoute } from 'astro';
import { ownerSignOut } from '../lib/owner-auth';

/** POST only, so a link on another site cannot sign the owner out. */
export const POST: APIRoute = async ({ cookies, redirect }) => {
  await ownerSignOut(cookies);
  return redirect('/login');
};
