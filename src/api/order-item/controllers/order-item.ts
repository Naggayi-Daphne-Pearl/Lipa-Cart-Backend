import { factories } from '@strapi/strapi';
import { sendPush, saveNotification, isFirebaseReady } from '../../../services/notification';

export default factories.createCoreController('api::order-item.order-item', ({ strapi }) => ({
  async create(ctx: any) {
    try {
      const result = await super.create(ctx);
      return result;
    } catch (error) {
      console.error('ERROR: Failed to create order item:', error);
      throw error;
    }
  },

  /**
   * Shopper updates an order item (mark found, set actual price)
   * PATCH /api/order-items/:id/shopper-update
   */
  async shopperUpdate(ctx: any) {
    try {
      // Manual JWT verification (auth: false on route)
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      try {
        const payload = await strapi.plugins['users-permissions'].services.jwt.verify(token);
        const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id: payload.id } });
        if (!user) return ctx.unauthorized('User not found');
      } catch {
        return ctx.unauthorized('Invalid token');
      }

      const { id } = ctx.params; // documentId of the order item
      const { found, actual_price } = ctx.request.body;

      // Find the order item
      const item: any = await strapi.db.query('api::order-item.order-item').findOne({
        where: { documentId: id },
        populate: ['order', 'order.shopper'],
      });

      if (!item) return ctx.notFound('Order item not found');

      // Build update data
      const updateData: any = {};
      if (typeof found === 'boolean') updateData.found = found;
      if (actual_price !== undefined) updateData.actual_price = actual_price;

      const updated = await strapi.entityService.update('api::order-item.order-item', item.id, {
        data: updateData,
        populate: { product: true, order: true },
      });

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Shopper update item error:', error);
      ctx.throw(500, 'Failed to update order item');
    }
  },

  /**
   * Shopper batch-updates multiple order items at once
   * PATCH /api/order-items/batch-update
   */
  async batchUpdate(ctx: any) {
    try {
      // Manual JWT verification (auth: false on route)
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      try {
        const payload = await strapi.plugins['users-permissions'].services.jwt.verify(token);
        const user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id: payload.id } });
        if (!user) return ctx.unauthorized('User not found');
      } catch {
        return ctx.unauthorized('Invalid token');
      }

      const { items } = ctx.request.body;
      if (!items || !Array.isArray(items)) {
        return ctx.badRequest('items array is required');
      }

      const results = [];
      const failed = [];

      for (const itemUpdate of items) {
        try {
          const { documentId, found, actual_price, shopper_notes } = itemUpdate;

          // Support both documentId (string) and numeric id lookups
          let item: any = null;
          const isNumericId = /^\d+$/.test(String(documentId));
          if (isNumericId) {
            item = await strapi.db.query('api::order-item.order-item').findOne({
              where: { id: Number(documentId) },
            });
          }
          if (!item) {
            item = await strapi.db.query('api::order-item.order-item').findOne({
              where: { documentId },
            });
          }

          if (!item) {
            failed.push({ documentId, error: 'Not found' });
            continue;
          }

          const updateData: any = {};
          if (typeof found === 'boolean') updateData.found = found;
          if (actual_price !== undefined) updateData.actual_price = actual_price;
          if (shopper_notes !== undefined) updateData.shopper_notes = shopper_notes;

          const updated = await strapi.entityService.update('api::order-item.order-item', item.id, {
            data: updateData,
          });
          results.push(updated);
        } catch (e) {
          failed.push({ documentId: itemUpdate.documentId, error: e.message });
        }
      }

      // Send notification for substitutes
      const substitutes = items.filter((i: any) =>
        i.shopper_notes && typeof i.shopper_notes === 'string' && i.shopper_notes.startsWith('SUBSTITUTE:')
      );
      if (substitutes.length > 0) {
        try {
          // Find the order for these items to get the customer
          const firstItem: any = await strapi.db.query('api::order-item.order-item').findOne({
            where: { documentId: items[0].documentId },
            populate: ['order'],
          });
          if (firstItem?.order) {
            const order: any = await strapi.db.query('api::order.order').findOne({
              where: { id: firstItem.order.id },
              populate: ['customer'],
            });
            if (order?.customer) {
              const customer: any = await strapi.db.query('api::user.user').findOne({
                where: { id: order.customer.id },
              });
              if (customer?.fcm_token && isFirebaseReady()) {
                const subNames = substitutes.map((s: any) => s.shopper_notes.replace('SUBSTITUTE: ', '')).join(', ');
                await sendPush(
                  customer.fcm_token,
                  'Substitute Suggested',
                  `Your shopper suggested: ${subNames}. Check your order for details.`,
                  { type: 'order_status', orderId: order.documentId },
                ).catch(() => {});
              }
              await saveNotification(strapi, {
                title: 'Substitute Suggested',
                body: `${substitutes.length} item(s) unavailable — your shopper suggested substitutes.`,
                type: 'order_status',
                userId: order.customer.id,
                orderNumber: order.order_number,
              }).catch(() => {});
            }
          }
        } catch (notifErr) {
          // Non-blocking — don't fail the batch update
        }
      }

      ctx.body = {
        data: results,
        meta: { updated: results.length, failed: failed.length },
      };
    } catch (error) {
      console.error('Batch update error:', error);
      ctx.throw(500, 'Failed to batch update items');
    }
  },

  async bulkCreate(ctx: any) {
    try {
      const { items } = ctx.request.body;

      if (!items || !Array.isArray(items)) {
        return ctx.badRequest('items array is required');
      }

      const createdItems = [];
      const failedItems = [];

      for (let index = 0; index < items.length; index++) {
        const itemData = items[index];
        try {
          const { order: orderDocId, product: productDocId, ...scalarData } = itemData;

          // Resolve order documentId to numeric ID
          let orderId = null;
          if (orderDocId) {
            const orderRecord: any = await strapi.db.query('api::order.order').findOne({
              where: { documentId: orderDocId },
            });
            if (orderRecord) {
              orderId = orderRecord.id;
            } else {
            }
          }

          // Resolve product documentId to numeric ID
          let productId = null;
          if (productDocId) {
            const productRecord: any = await strapi.db.query('api::product.product').findOne({
              where: { documentId: productDocId },
            });
            if (productRecord) {
              productId = productRecord.id;
            } else {
            }
          }

          // Create using db.query with numeric IDs for relations
          const orderItem = await strapi.entityService.create('api::order-item.order-item', {
            data: {
              ...scalarData,
              order: orderId,
              product: productId,
            },
          });

          createdItems.push(orderItem);
        } catch (error) {
          failedItems.push({ item: itemData, error: error.message });
        }
      }

      ctx.body = {
        data: createdItems,
        meta: {
          count: createdItems.length,
          failed: failedItems.length,
        },
      };
    } catch (error) {
      console.error('ERROR: Bulk create failed:', error);
      ctx.throw(500, 'Failed to create order items in bulk');
    }
  },
}));
