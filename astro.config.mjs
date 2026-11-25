// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Every page is rendered on the server: the dashboard always shows live data.
export default defineConfig({
  output: 'server',
  adapter: vercel(),
});
