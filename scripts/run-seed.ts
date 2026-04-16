/**
 * Standalone seed runner — used by Railway's startCommand before `strapi start`.
 *
 * Boots Strapi (runs RBAC setup via bootstrap), seeds the database, then
 * destroys the app and exits cleanly. The actual server is started separately
 * with SKIP_BOOTSTRAP_SYNC=true so RBAC and seed don't run again on every
 * restart.
 *
 * Usage (after build):  node dist/scripts/run-seed.js
 * Via npm:              npm run seed
 */

import strapi from '@strapi/strapi';
import seed from './seed';

async function main() {
  console.log('[run-seed] Booting Strapi for seeding...');

  // load() bootstraps the app (runs RBAC setup) without binding to a port.
  const app = await (strapi as any)({ distDir: './dist' }).load();

  console.log('[run-seed] Bootstrap complete. Running seed...');
  await seed(app);

  console.log('[run-seed] Seed complete. Shutting down.');
  await app.destroy();
  process.exit(0);
}

main().catch((err) => {
  // Log but still exit 0 — a seed failure must not block the server from starting.
  console.error('[run-seed] Unexpected error:', err?.message ?? err);
  process.exit(0);
});
