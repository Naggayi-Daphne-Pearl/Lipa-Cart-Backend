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
