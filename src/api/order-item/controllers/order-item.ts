import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::order-item.order-item', ({ strapi }) => ({
  async create(ctx: any) {
    try {
      const { data } = ctx.request.body;
      console.log('DEBUG: Creating order item with data:', JSON.stringify(data, null, 2));
      
      const result = await super.create(ctx);
      console.log('DEBUG: Order item created successfully:', JSON.stringify(result, null, 2));
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
      console.log(`\nBulk create request received`);

      const { items } = ctx.request.body;

      if (!items || !Array.isArray(items)) {
        return ctx.badRequest('items array is required');
      }

      console.log(`BULK CREATE: Processing ${items.length} order items`);

      const createdItems = [];
      const failedItems = [];

      for (let index = 0; index < items.length; index++) {
        const itemData = items[index];
        try {
          const { order: orderDocId, product: productDocId, ...scalarData } = itemData;

          console.log(`[${index + 1}/${items.length}] order=${orderDocId}, product=${productDocId}, qty=${scalarData.quantity}`);

          // Resolve order documentId to numeric ID
          let orderId = null;
          if (orderDocId) {
            const orderRecord: any = await strapi.db.query('api::order.order').findOne({
              where: { documentId: orderDocId },
            });
            if (orderRecord) {
              orderId = orderRecord.id;
              console.log(`  Resolved order documentId ${orderDocId} -> id ${orderId}`);
            } else {
              console.error(`  Order not found for documentId: ${orderDocId}`);
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
              console.log(`  Resolved product documentId ${productDocId} -> id ${productId}`);
            } else {
              console.log(`  Product not found for documentId: ${productDocId} (skipping link)`);
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

          console.log(`  ✓ Created order item id=${orderItem.id}`);
          createdItems.push(orderItem);
        } catch (error) {
          console.error(`  ✗ FAILED:`, error.message);
          failedItems.push({ item: itemData, error: error.message });
        }
      }

      console.log(`RESULT: ${createdItems.length} created, ${failedItems.length} failed`);

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
