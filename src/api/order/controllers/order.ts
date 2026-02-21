import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
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
