import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::shopping-list.shopping-list', ({ strapi }) => ({
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

      customUser =
        userProfilesByEmail && userProfilesByEmail.length > 0 ? userProfilesByEmail[0] : null;
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

    // By default return only user's lists.
    // Templates are opt-in via includeTemplates=true/include_templates=true.
    const includeTemplates =
      ctx.query.includeTemplates === 'true' || ctx.query.include_templates === 'true';

    ctx.query.filters = ctx.query.filters || {};
    (ctx.query.filters as any).$or = includeTemplates
      ? [{ customer: { id: { $eq: customer.id } } }, { customer: { id: { $null: true } } }]
      : [{ customer: { id: { $eq: customer.id } } }];

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

    // Enforce free-tier limit: max 3 shopping lists per customer
    const existingLists = await strapi.entityService.findMany('api::shopping-list.shopping-list', {
      filters: { customer: { id: customer.id } },
      limit: 1000,
    });

    if (existingLists.length >= 3) {
      return ctx.forbidden(
        'Free tier limited to 3 shopping lists. Delete an existing list to create a new one.',
      );
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
      },
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
      typeof shoppingList.customer === 'object' ? shoppingList.customer?.id : shoppingList.customer;

    if (shoppingListCustomerId !== customer.id) {
      return ctx.forbidden('You do not have permission to update this shopping list');
    }

    // Validate items: ensure all product IDs exist
    const items = ctx.request.body?.data?.items;
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.product) {
          // product can be id or documentId
          const productRef =
            typeof item.product === 'object'
              ? item.product.documentId || item.product.id
              : item.product;
          let productExists: any = null;

          if (typeof productRef === 'string' && Number.isNaN(Number(productRef))) {
            const foundByDocId = await strapi.entityService.findMany('api::product.product', {
              filters: { documentId: productRef } as any,
              limit: 1,
            });
            productExists =
              Array.isArray(foundByDocId) && foundByDocId.length > 0 ? foundByDocId[0] : null;
          } else {
            productExists = await strapi.entityService.findOne(
              'api::product.product',
              Number(productRef),
            );
          }

          if (!productExists) {
            return ctx.badRequest(`Product ${productRef} not found`);
          }
        }
      }
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
      },
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
      typeof shoppingList.customer === 'object' ? shoppingList.customer?.id : shoppingList.customer;

    if (shoppingListCustomerId == null) {
      return ctx.forbidden(
        'Template lists are read-only. Create your own copy and delete that copy instead.',
      );
    }

    if (shoppingListCustomerId !== customer.id) {
      return ctx.forbidden('You do not have permission to delete this shopping list');
    }

    return super.delete(ctx);
  },
  // Add item to shopping list
  async addItem(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const customer = await this.getOrCreateCustomerFromAuthUser(user);
    if (!customer) {
      return ctx.badRequest('No user profile found');
    }

    const { listId } = ctx.params;
    const item = ctx.request.body?.data || ctx.request.body;

    // Get shopping list
    const byDocumentId: any = await strapi.entityService.findMany(
      'api::shopping-list.shopping-list',
      {
        filters: { documentId: listId } as any,
        populate: { customer: true, items: { populate: { product: true } } },
        limit: 1,
      },
    );

    const shoppingList: any =
      Array.isArray(byDocumentId) && byDocumentId.length > 0 ? byDocumentId[0] : null;

    if (!shoppingList) {
      return ctx.notFound('Shopping list not found');
    }

    const shoppingListCustomerId =
      typeof shoppingList.customer === 'object' ? shoppingList.customer?.id : shoppingList.customer;
    if (shoppingListCustomerId !== customer.id) {
      return ctx.forbidden('You do not have permission to modify this shopping list');
    }

    // Validate product if provided (supports id and documentId)
    if (item.product) {
      const productRef =
        typeof item.product === 'object'
          ? item.product.documentId || item.product.id
          : item.product;
      let productExists: any = null;
      if (typeof productRef === 'string' && Number.isNaN(Number(productRef))) {
        const foundByDocId = await strapi.entityService.findMany('api::product.product', {
          filters: { documentId: productRef } as any,
          limit: 1,
        });
        productExists =
          Array.isArray(foundByDocId) && foundByDocId.length > 0 ? foundByDocId[0] : null;
      } else {
        productExists = await strapi.entityService.findOne(
          'api::product.product',
          Number(productRef),
        );
      }

      if (!productExists) {
        return ctx.badRequest(`Product ${productRef} not found`);
      }
    }

    // Merge duplicate item by name + product reference
    const normalizedName = String(item.name || '')
      .trim()
      .toLowerCase();
    const incomingProductRef = item.product
      ? typeof item.product === 'object'
        ? item.product.documentId || item.product.id
        : item.product
      : null;
    const existingItems = shoppingList.items || [];
    const duplicateIndex = existingItems.findIndex((existing: any) => {
      const existingName = String(existing.name || '')
        .trim()
        .toLowerCase();
      const existingProductRef = existing.product
        ? typeof existing.product === 'object'
          ? existing.product.documentId || existing.product.id
          : existing.product
        : null;
      return (
        existingName == normalizedName &&
        String(existingProductRef ?? '') == String(incomingProductRef ?? '')
      );
    });

    let updatedItems = [...existingItems];
    if (duplicateIndex !== -1) {
      const existing = updatedItems[duplicateIndex];
      const existingQty = Number(existing.quantity ?? 0);
      const incomingQty = Number(item.quantity ?? 0);
      updatedItems[duplicateIndex] = {
        ...existing,
        quantity: existingQty + incomingQty,
      };
    } else {
      updatedItems = [...updatedItems, item];
    }

    try {
      const updated = await strapi.entityService.update(
        'api::shopping-list.shopping-list',
        shoppingList.id,
        { data: { items: updatedItems } },
      );
      return { data: updated };
    } catch (error) {
      console.error('Failed to add item to shopping list', error);
      return ctx.internalServerError('Failed to add item');
    }
  },

  // Remove item from shopping list
  async removeItem(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const customer = await this.getOrCreateCustomerFromAuthUser(user);
    if (!customer) {
      return ctx.badRequest('No user profile found');
    }

    const { listId, itemIndex } = ctx.params;
    const index = parseInt(itemIndex);

    // Get shopping list
    const byDocumentId: any = await strapi.entityService.findMany(
      'api::shopping-list.shopping-list',
      {
        filters: { documentId: listId } as any,
        populate: { customer: true, items: true },
        limit: 1,
      },
    );

    const shoppingList: any =
      Array.isArray(byDocumentId) && byDocumentId.length > 0 ? byDocumentId[0] : null;

    if (!shoppingList) {
      return ctx.notFound('Shopping list not found');
    }

    const shoppingListCustomerId =
      typeof shoppingList.customer === 'object' ? shoppingList.customer?.id : shoppingList.customer;
    if (shoppingListCustomerId !== customer.id) {
      return ctx.forbidden('You do not have permission to modify this shopping list');
    }

    if (isNaN(index) || index < 0 || index >= shoppingList.items.length) {
      return ctx.badRequest('Invalid item index');
    }

    // Remove item
    const updatedItems = shoppingList.items.filter((_: any, i: number) => i !== index);

    try {
      const updated = await strapi.entityService.update(
        'api::shopping-list.shopping-list',
        shoppingList.id,
        { data: { items: updatedItems } },
      );
      return { data: updated };
    } catch (error) {
      console.error('Failed to remove item from shopping list', error);
      return ctx.internalServerError('Failed to remove item');
    }
  },

  // Update item in shopping list
  async updateItem(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const customer = await this.getOrCreateCustomerFromAuthUser(user);
    if (!customer) {
      return ctx.badRequest('No user profile found');
    }

    const { listId, itemIndex } = ctx.params;
    const itemUpdate = ctx.request.body?.data || ctx.request.body;
    const index = parseInt(itemIndex);

    // Get shopping list
    const byDocumentId: any = await strapi.entityService.findMany(
      'api::shopping-list.shopping-list',
      {
        filters: { documentId: listId } as any,
        populate: { customer: true, items: true },
        limit: 1,
      },
    );

    const shoppingList: any =
      Array.isArray(byDocumentId) && byDocumentId.length > 0 ? byDocumentId[0] : null;

    if (!shoppingList) {
      return ctx.notFound('Shopping list not found');
    }

    const shoppingListCustomerId =
      typeof shoppingList.customer === 'object' ? shoppingList.customer?.id : shoppingList.customer;
    if (shoppingListCustomerId !== customer.id) {
      return ctx.forbidden('You do not have permission to modify this shopping list');
    }

    if (isNaN(index) || index < 0 || index >= shoppingList.items.length) {
      return ctx.badRequest('Invalid item index');
    }

    // Validate product if provided
    if (itemUpdate.product) {
      const productRef =
        typeof itemUpdate.product === 'object'
          ? itemUpdate.product.documentId || itemUpdate.product.id
          : itemUpdate.product;
      let productExists: any = null;
      if (typeof productRef === 'string' && Number.isNaN(Number(productRef))) {
        const foundByDocId = await strapi.entityService.findMany('api::product.product', {
          filters: { documentId: productRef } as any,
          limit: 1,
        });
        productExists =
          Array.isArray(foundByDocId) && foundByDocId.length > 0 ? foundByDocId[0] : null;
      } else {
        productExists = await strapi.entityService.findOne(
          'api::product.product',
          Number(productRef),
        );
      }
      if (!productExists) {
        return ctx.badRequest(`Product ${productRef} not found`);
      }
    }

    // Update item
    const updatedItems = shoppingList.items.map((item: any, i: number) =>
      i === index ? { ...item, ...itemUpdate } : item,
    );

    try {
      const updated = await strapi.entityService.update(
        'api::shopping-list.shopping-list',
        shoppingList.id,
        { data: { items: updatedItems } },
      );
      return { data: updated };
    } catch (error) {
      console.error('Failed to update item in shopping list', error);
      return ctx.internalServerError('Failed to update item');
    }
  },

  // Toggle item checked status
  async toggleItemChecked(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const customer = await this.getOrCreateCustomerFromAuthUser(user);
    if (!customer) {
      return ctx.badRequest('No user profile found');
    }

    const { listId, itemIndex } = ctx.params;
    const index = parseInt(itemIndex);

    // Get shopping list
    const byDocumentId: any = await strapi.entityService.findMany(
      'api::shopping-list.shopping-list',
      {
        filters: { documentId: listId } as any,
        populate: { customer: true, items: true },
        limit: 1,
      },
    );

    const shoppingList: any =
      Array.isArray(byDocumentId) && byDocumentId.length > 0 ? byDocumentId[0] : null;

    if (!shoppingList) {
      return ctx.notFound('Shopping list not found');
    }

    const shoppingListCustomerId =
      typeof shoppingList.customer === 'object' ? shoppingList.customer?.id : shoppingList.customer;
    if (shoppingListCustomerId !== customer.id) {
      return ctx.forbidden('You do not have permission to modify this shopping list');
    }

    if (isNaN(index) || index < 0 || index >= shoppingList.items.length) {
      return ctx.badRequest('Invalid item index');
    }

    // Toggle checked status
    const updatedItems = shoppingList.items.map((item: any, i: number) =>
      i === index ? { ...item, is_checked: !item.is_checked } : item,
    );

    try {
      const updated = await strapi.entityService.update(
        'api::shopping-list.shopping-list',
        shoppingList.id,
        { data: { items: updatedItems } },
      );
      return { data: updated };
    } catch (error) {
      console.error('Failed to toggle item status', error);
      return ctx.internalServerError('Failed to toggle item');
    }
  },
}));
