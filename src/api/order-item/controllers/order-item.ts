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
      if (!ctx.state.user) return ctx.unauthorized('Authentication required');

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
      if (!ctx.state.user) return ctx.unauthorized('Authentication required');

      const { items } = ctx.request.body;
      if (!items || !Array.isArray(items)) {
        return ctx.badRequest('items array is required');
      }

      const results = [];
      const failed = [];

      for (const itemUpdate of items) {
        try {
          const { documentId, found, actual_price } = itemUpdate;
          const item: any = await strapi.db.query('api::order-item.order-item').findOne({
            where: { documentId },
          });

          if (!item) {
            failed.push({ documentId, error: 'Not found' });
            continue;
          }

          const updateData: any = {};
          if (typeof found === 'boolean') updateData.found = found;
          if (actual_price !== undefined) updateData.actual_price = actual_price;

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
      // Check authentication
      if (!ctx.state.user) {
        console.error('ERROR: Unauthorized - no user in context');
        return ctx.unauthorized('Authentication required');
      }

      console.log(`\nBulk create request from user: ${ctx.state.user.id}`);

      const { items } = ctx.request.body;

      if (!items || !Array.isArray(items)) {
        console.error('ERROR: Invalid request - items must be an array');
        return ctx.badRequest('items array is required');
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`BULK CREATE: Processing ${items.length} order items`);
      console.log(`${'='.repeat(60)}`);

      // Create all order items
      const createdItems = [];
      const failedItems = [];

      for (let index = 0; index < items.length; index++) {
        const itemData = items[index];
        try {
          console.log(`\n[${index + 1}/${items.length}] Creating order item:`);
          console.log(`  Order ID: ${itemData.order}`);
          console.log(`  Product ID: ${itemData.product}`);
          console.log(`  Quantity: ${itemData.quantity} ${itemData.unit}`);

          const orderItem = await strapi.entityService.create('api::order-item.order-item', {
            data: itemData,
          });

          console.log(`  ✓ Created with ID: ${orderItem.id}`);
          createdItems.push(orderItem);
        } catch (error) {
          console.error(`  ✗ FAILED:`, error.message);
          console.error(`     Full error:`, error);
          failedItems.push({
            item: itemData,
            error: error.message,
          });
        }
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`RESULT: ${createdItems.length} created, ${failedItems.length} failed`);
      console.log(`${'='.repeat(60)}\n`);

      if (failedItems.length > 0) {
        console.error('Failed items:', JSON.stringify(failedItems, null, 2));
      }

      ctx.body = {
        data: createdItems,
        meta: {
          count: createdItems.length,
          failed: failedItems.length,
        },
      };
    } catch (error) {
      console.error('\nERROR: Bulk create failed:', error);
      ctx.throw(500, 'Failed to create order items in bulk');
    }
  },
}));
