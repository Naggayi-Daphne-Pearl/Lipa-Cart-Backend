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
