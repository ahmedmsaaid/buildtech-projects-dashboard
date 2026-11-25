/** Every page of the dashboard needs a signed-in owner, except the sign-in page itself. */
import { defineMiddleware } from 'astro:middleware';
import { currentOwner } from './lib/owner-auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const onSignIn = context.url.pathname === '/login';
  const owner = await currentOwner(context.cookies);

  if (!owner) return onSignIn ? next() : context.redirect('/login');
  if (onSignIn) return context.redirect('/');

  context.locals.owner = owner;
  return next();
});
