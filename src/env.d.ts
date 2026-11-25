/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  readonly PLATFORM_URL?: string;
  readonly INTERNAL_API_SECRET?: string;
}

declare namespace App {
  interface Locals {
    /** Set by the middleware on every page except the sign-in page. */
    owner: import('./lib/owner-auth').Owner;
  }
}
