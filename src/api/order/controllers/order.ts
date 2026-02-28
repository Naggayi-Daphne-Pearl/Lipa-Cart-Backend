import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async find(ctx: any) {
    try {
      console.log('DEBUG: Finding orders with query:', ctx.query);
      const result = await super.find(ctx);
      
      if (result.data && Array.isArray(result.data)) {
        console.log(`DEBUG: Found ${result.data.length} orders`);
        result.data.forEach((order: any, index: number) => {
          const orderAttrs = order.attributes || order;
          console.log(`DEBUG: Order ${index} - ID: ${order.id}, Order#: ${orderAttrs.order_number}, Items count: ${orderAttrs.order_items?.length || 0}`);
          if (orderAttrs.order_items) {
            console.log(`DEBUG: Order ${index} order_items structure:`, JSON.stringify(orderAttrs.order_items, null, 2));
          }
        });
      }
      
      return result;
    } catch (error) {
      console.error('ERROR: Failed to find orders:', error);
      throw error;
    }
  },

  async createGuestOrder(ctx: any) {
    try {
      const { phone, address_line, city, landmark, subtotal, service_fee, delivery_fee, total } =
        ctx.request.body;

      // Validate required fields
      if (!phone || !address_line) {
        return ctx.badRequest('phone and address_line are required');
      }

      // Find or create custom user by phone
      let customUser = await strapi.query('api::user.user').findOne({
        where: { phone },
      });

      if (!customUser) {
        customUser = await strapi.entityService.create('api::user.user', {
          data: {
            phone,
            user_type: 'customer',
            is_active: true,
          },
        });
      }

      // Create address record
      const address = await strapi.entityService.create('api::address.address', {
        data: {
          address_line,
          city: city ?? null,
          landmark: landmark ?? null,
        },
      });

      // Generate order number
      const orderNumber = `LC${Date.now().toString().slice(-8)}`;

      // Create order
      const order = await strapi.entityService.create('api::order.order', {
        data: {
          order_number: orderNumber,
          customer: customUser.id,
          delivery_address: address.id,
          subtotal,
          service_fee,
          delivery_fee,
          total,
          status: 'pending',
        },
        populate: { delivery_address: true, customer: true },
      });

      ctx.body = { data: order };
    } catch (error) {
      console.error('Guest order creation error:', error);
      ctx.throw(500, 'Failed to create guest order');
    }
  },
}));
