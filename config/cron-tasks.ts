/**
 * Background cron tasks.
 *
 * Enabled by `cron.enabled = true` in config/server.ts.
 */

// Thresholds for auto-releasing stale claims. Tuned for the Kampala delivery
// window: a shopper is expected to start shopping within ~15 minutes of
// claiming, a rider to move to in_transit within ~20 minutes of claiming.
const SHOPPER_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const RIDER_CLAIM_TIMEOUT_MS = 20 * 60 * 1000;

async function releaseStaleShopperClaims(strapi: any) {
  const cutoff = new Date(Date.now() - SHOPPER_CLAIM_TIMEOUT_MS);
  // Orders claimed but never moved past shopper_assigned before the cutoff.
  const stale: any[] = await strapi.db.query('api::order.order').findMany({
    where: {
      status: 'shopper_assigned',
      shopper_assigned_at: { $lt: cutoff.toISOString() },
    },
    limit: 50,
  });
  if (stale.length === 0) return;
  strapi.log.info(
    `[cron] Releasing ${stale.length} stale shopper claim(s) older than ${SHOPPER_CLAIM_TIMEOUT_MS / 60000}m`,
  );
  for (const order of stale) {
    try {
      await strapi.db.connection.transaction(async (trx: any) => {
        // Re-include the cutoff predicate inside the atomic UPDATE so that
        // if the order was unclaimed and re-claimed in the gap between
        // findMany and now (giving it a fresh shopper_assigned_at), we don't
        // clobber the new claim. 0 rows updated = harmless race, just skip.
        const updated = await trx('orders')
          .where({ id: order.id, status: 'shopper_assigned' })
          .where('shopper_assigned_at', '<', cutoff.toISOString())
          .update({
            status: 'payment_confirmed',
            shopper_assigned_at: null,
            updated_at: new Date().toISOString(),
          });
        if (updated > 0) {
          await trx('orders_shopper_lnk').where({ order_id: order.id }).delete();
        }
      });
    } catch (err: any) {
      strapi.log.warn(
        `[cron] Failed to release shopper claim on order ${order.id}: ${err?.message}`,
      );
    }
  }
}

async function releaseStaleRiderClaims(strapi: any) {
  const cutoff = new Date(Date.now() - RIDER_CLAIM_TIMEOUT_MS);
  const stale: any[] = await strapi.db.query('api::order.order').findMany({
    where: {
      status: 'rider_assigned',
      rider_assigned_at: { $lt: cutoff.toISOString() },
    },
    limit: 50,
  });
  if (stale.length === 0) return;
  strapi.log.info(
    `[cron] Releasing ${stale.length} stale rider claim(s) older than ${RIDER_CLAIM_TIMEOUT_MS / 60000}m`,
  );
  for (const order of stale) {
    try {
      await strapi.db.connection.transaction(async (trx: any) => {
        // Same race-tolerant guard as releaseStaleShopperClaims.
        const updated = await trx('orders')
          .where({ id: order.id, status: 'rider_assigned' })
          .where('rider_assigned_at', '<', cutoff.toISOString())
          .update({
            status: 'ready_for_pickup',
            rider_assigned_at: null,
            picked_up_at: null,
            updated_at: new Date().toISOString(),
          });
        if (updated > 0) {
          await trx('orders_rider_lnk').where({ order_id: order.id }).delete();
        }
      });
    } catch (err: any) {
      strapi.log.warn(`[cron] Failed to release rider claim on order ${order.id}: ${err?.message}`);
    }
  }
}

export default {
  /**
   * Every 5 minutes: auto-release stale shopper and rider claims so orders
   * don't get stuck forever when a shopper/rider walks away after claiming.
   */
  releaseStaleClaims: {
    task: async ({ strapi }: { strapi: any }) => {
      try {
        await releaseStaleShopperClaims(strapi);
        await releaseStaleRiderClaims(strapi);
      } catch (err: any) {
        strapi.log.error(`[cron] releaseStaleClaims failed: ${err?.message}`);
      }
    },
    options: {
      rule: '*/5 * * * *',
    },
  },
};
