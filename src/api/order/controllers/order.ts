import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async find(ctx: any) {
    try {
      console.log('DEBUG: Finding orders with query:', ctx.query);

      // Ensure order_items are always populated
      if (!ctx.query.populate) {
        ctx.query.populate = {};
      }

      // If populate is a string (like 'order_items'), convert to object
      if (typeof ctx.query.populate === 'string') {
        const populateStr = ctx.query.populate;
        ctx.query.populate = {};
        // Parse the populate string if it's comma-separated
        populateStr.split(',').forEach((field: string) => {
          ctx.query.populate[field] = true;
        });
      }

      // Always include order_items in populate
      if (typeof ctx.query.populate === 'object') {
        ctx.query.populate.order_items = {
          populate: {
            product: true,  // Just populate the product relation, don't specify fields
          },
        };
      }

      console.log('DEBUG: Modified populate query:', JSON.stringify(ctx.query.populate));

      const result = await super.find(ctx);

      if (result.data && Array.isArray(result.data)) {
        console.log(`DEBUG: Found ${result.data.length} orders`);

        // Manually populate order_items for each order if not already populated
        for (let i = 0; i < result.data.length; i++) {
          const order = result.data[i] as any;
          const orderAttrs = (order.attributes || order) as any;

          // If order_items not populated, fetch them manually
          if (!orderAttrs.order_items) {
            try {
              const orderId = order.id;
              const populated = (await strapi.entityService.findOne('api::order.order', orderId, {
                populate: {
                  order_items: {
                    populate: {
                      product: true,
                    },
                  },
                },
              })) as any;

              if (populated && populated.order_items) {
                if (order.attributes) {
                  order.attributes.order_items = populated.order_items;
                } else {
                  order.order_items = populated.order_items;
                }
              }
            } catch (e) {
              console.error(`Failed to populate order_items for order ${order.id}:`, e);
            }
          }

          const updatedAttrs = (order.attributes || order) as any;
          console.log(`DEBUG: Order ${i} - ID: ${order.id}, Order#: ${updatedAttrs.order_number}, Items count: ${updatedAttrs.order_items?.length || 0}`);
          if (updatedAttrs.order_items) {
            console.log(`DEBUG: Order ${i} order_items:`, JSON.stringify(updatedAttrs.order_items, null, 2));
          }
        }
      }

      return result;
    } catch (error) {
      console.error('ERROR: Failed to find orders:', error);
      throw error;
    }
  },

  async findOne(ctx: any) {
    try {
      console.log('DEBUG: Finding single order with query:', ctx.query);

      // Ensure order_items are always populated
      if (!ctx.query.populate) {
        ctx.query.populate = {};
      }

      // If populate is a string, convert to object
      if (typeof ctx.query.populate === 'string') {
        const populateStr = ctx.query.populate;
        ctx.query.populate = {};
        populateStr.split(',').forEach((field: string) => {
          ctx.query.populate[field] = true;
        });
      }

      // Always include order_items in populate
      if (typeof ctx.query.populate === 'object') {
        ctx.query.populate.order_items = {
          populate: {
            product: true,  // Just populate the product relation, don't specify fields
          },
        };
      }

      console.log('DEBUG: Modified populate query:', JSON.stringify(ctx.query.populate));

      const result = await super.findOne(ctx);

      if (result.data) {
        const orderAttrs = result.data.attributes || result.data;
        console.log(`DEBUG: Got order - ID: ${result.data.id}, Order#: ${orderAttrs.order_number}, Items count: ${orderAttrs.order_items?.length || 0}`);
      }

      return result;
    } catch (error) {
      console.error('ERROR: Failed to find single order:', error);
      throw error;
    }
  },

  /**
   * Shopper claims an available order
   * POST /api/orders/:id/claim
   */
  async claimOrder(ctx: any) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized('Authentication required');

      const { id } = ctx.params; // documentId of the order

      // Find the custom user (shopper)
      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: user.username },
      });

      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can claim orders');
      }

      // Find the order
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
      });

      if (!order) return ctx.notFound('Order not found');

      if (order.status !== 'payment_confirmed') {
        return ctx.badRequest('Order is not available for claiming');
      }

      if (order.shopper) {
        return ctx.badRequest('Order is already assigned to a shopper');
      }

      // Assign shopper and update status
      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          shopper: customUser.id,
          status: 'shopper_assigned',
          shopper_assigned_at: new Date(),
        },
        populate: {
          order_items: { populate: { product: true } },
          delivery_address: true,
          customer: true,
        },
      });

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Claim order error:', error);
      ctx.throw(500, 'Failed to claim order');
    }
  },

  /**
   * Shopper updates order status (shopping, ready_for_pickup)
   * PATCH /api/orders/:id/shopper-status
   */
  async updateShopperStatus(ctx: any) {
    try {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized('Authentication required');

      const { id } = ctx.params;
      const { status } = ctx.request.body;

      const allowedTransitions: Record<string, string[]> = {
        'shopper_assigned': ['shopping'],
        'shopping': ['ready_for_pickup'],
      };

      // Find the custom user
      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: user.username },
      });

      if (!customUser || customUser.user_type !== 'shopper') {
        return ctx.forbidden('Only shoppers can update order status');
      }

      // Find the order
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: id },
        populate: ['shopper'],
      });

      if (!order) return ctx.notFound('Order not found');

      // Verify this shopper owns the order
      if (order.shopper?.id !== customUser.id) {
        return ctx.forbidden('You are not assigned to this order');
      }

      // Validate status transition
      const allowed = allowedTransitions[order.status];
      if (!allowed || !allowed.includes(status)) {
        return ctx.badRequest(`Cannot transition from '${order.status}' to '${status}'`);
      }

      // Build update data with timestamps
      const updateData: any = { status };
      if (status === 'shopping') updateData.shopping_started_at = new Date();
      if (status === 'ready_for_pickup') updateData.shopping_completed_at = new Date();

      const updated = await strapi.entityService.update('api::order.order', order.id, {
        data: updateData,
        populate: {
          order_items: { populate: { product: true } },
          delivery_address: true,
          customer: true,
        },
      });

      ctx.body = { data: updated };
    } catch (error) {
      console.error('Update shopper status error:', error);
      ctx.throw(500, 'Failed to update order status');
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
