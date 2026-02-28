import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::shopping-list.shopping-list',
  ({ strapi }) => ({
    async getOrCreateCustomerFromAuthUser(authUser: any) {
      if (!authUser) {
        return null;
      }

      const userProfiles: any = await strapi.entityService.findMany('api::user.user', {
        filters: { phone: authUser.username },
        limit: 1,
      });

      let customUser = userProfiles && userProfiles.length > 0 ? userProfiles[0] : null;

      if (!customUser && authUser.email) {
        const userProfilesByEmail: any = await strapi.entityService.findMany('api::user.user', {
          filters: { email: authUser.email },
          limit: 1,
        });

        customUser = userProfilesByEmail && userProfilesByEmail.length > 0 ? userProfilesByEmail[0] : null;
      }

      if (!customUser) {
        return null;
      }

      const customer = await strapi.db.query('api::customer.customer').findOne({
        where: { user: { id: customUser.id } },
      });

      if (customer) {
        return customer;
      }

      const referralCode = `LC${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const newCustomer = await strapi.entityService.create('api::customer.customer', {
        data: {
          user: customUser.id,
          referral_code: referralCode,
          total_orders: 0,
        },
      });

      return newCustomer;
    },

    // Main find method - requires authentication, returns only user's lists
    async find(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized('Authentication required');
      }

      // Get customer associated with the authenticated user profile
      let customer = null;
      try {
        customer = await this.getOrCreateCustomerFromAuthUser(user);
      } catch (error) {
        console.error('Shopping list find: failed to resolve/create customer profile', error);
        customer = null;
      }

      if (!customer) {
        return {
          data: [],
          meta: {
            pagination: {
              start: 0,
              limit: 10,
              total: 0,
            },
          },
        };
      }

      // Filter to only this customer's shopping lists
      ctx.query.filters = ctx.query.filters || {};
      (ctx.query.filters as any).customer = { id: { $eq: customer.id } };

      return super.find(ctx);
    },

    // Override create method to associate with authenticated customer
    async create(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized('Authentication required');
      }

      let customer = null;
      try {
        customer = await this.getOrCreateCustomerFromAuthUser(user);
      } catch (error) {
        console.error('Shopping list create: failed to resolve/create customer profile', error);
        return ctx.internalServerError('Failed to create customer profile');
      }

      if (!customer) {
        return ctx.badRequest('No user profile found');
      }

      // Set the customer for the shopping list
      ctx.request.body = ctx.request.body || {};
      ctx.request.body.data = ctx.request.body.data || {};
      ctx.request.body.data.customer = customer.id;

      return super.create(ctx);
    },

    // Override update method to ensure only the owner can update
    async update(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized('Authentication required');
      }

      // Get customer associated with the authenticated user profile
      const customer = await this.getOrCreateCustomerFromAuthUser(user);

      if (!customer) {
        return ctx.badRequest('User does not have a customer profile');
      }

      // Check if the shopping list belongs to the customer
      const { id } = ctx.params;
      let shoppingList: any = null;

      const byDocumentId: any = await strapi.entityService.findMany(
        'api::shopping-list.shopping-list',
        {
          filters: { documentId: id } as any,
          populate: { customer: true },
          limit: 1,
        }
      );

      if (Array.isArray(byDocumentId) && byDocumentId.length > 0) {
        shoppingList = byDocumentId[0];
      }

      if (!shoppingList) {
        const numericId = Number(id);
        if (!Number.isNaN(numericId)) {
          shoppingList = await strapi.db.query('api::shopping-list.shopping-list').findOne({
            where: { id: numericId },
          });
        }
      }

      if (!shoppingList) {
        return ctx.notFound('Shopping list not found');
      }

      const shoppingListCustomerId =
        typeof shoppingList.customer === 'object'
          ? shoppingList.customer?.id
          : shoppingList.customer;

      if (shoppingListCustomerId !== customer.id) {
        return ctx.forbidden('You do not have permission to update this shopping list');
      }

      try {
        return super.update(ctx);
      } catch (error) {
        console.error('Shopping list update failed', {
          params: ctx.params,
          body: ctx.request?.body,
          error,
        });
        return ctx.internalServerError('Failed to update shopping list');
      }
    },

    // Override delete method to ensure only the owner can delete
    async delete(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized('Authentication required');
      }

      // Get customer associated with the authenticated user profile
      const customer = await this.getOrCreateCustomerFromAuthUser(user);

      if (!customer) {
        return ctx.badRequest('User does not have a customer profile');
      }

      // Check if the shopping list belongs to the customer
      const { id } = ctx.params;
      let shoppingList: any = null;

      const byDocumentId: any = await strapi.entityService.findMany(
        'api::shopping-list.shopping-list',
        {
          filters: { documentId: id } as any,
          populate: { customer: true },
          limit: 1,
        }
      );

      if (Array.isArray(byDocumentId) && byDocumentId.length > 0) {
        shoppingList = byDocumentId[0];
      }

      if (!shoppingList) {
        const numericId = Number(id);
        if (!Number.isNaN(numericId)) {
          shoppingList = await strapi.db.query('api::shopping-list.shopping-list').findOne({
            where: { id: numericId },
          });
        }
      }

      if (!shoppingList) {
        return ctx.notFound('Shopping list not found');
      }

      const shoppingListCustomerId =
        typeof shoppingList.customer === 'object'
          ? shoppingList.customer?.id
          : shoppingList.customer;

      if (shoppingListCustomerId !== customer.id) {
        return ctx.forbidden('You do not have permission to delete this shopping list');
      }

      return super.delete(ctx);
    },
  })
);
