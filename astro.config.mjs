// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Every page is rendered on the server: the dashboard always shows live data.
export default defineConfig({
  output: 'server',
  // Making a customer's database and moving their records takes longer than a page.
  adapter: vercel({ maxDuration: 60 }),
});
