import { factories } from '@strapi/strapi';

// Module-level helpers — kept outside the controller object so they don't have
// to conform to Strapi's `(ctx) => Promise` controller handler signature.
async function resolveCustomer(strapi: any, ctx: any) {
  const user = ctx.state.user;
  if (!user) {
    return null;
  }

  const userProfiles: any = await strapi.entityService.findMany('api::user.user', {
    filters: { phone: user.username },
    limit: 1,
  });

  if (!userProfiles || userProfiles.length === 0) {
    return null;
  }

  const customUserProfile = userProfiles[0];

  const customers: any = await strapi.entityService.findMany('api::customer.customer', {
    filters: { user: customUserProfile.id } as any,
    limit: 1,
  });

  if (!customers || customers.length === 0) {
    return null;
  }

  return customers[0];
}

async function findAddressRecord(strapi: any, idOrDocumentId: string) {
  const byDocumentId: any = await strapi.db.query('api::address.address').findOne({
    where: { documentId: idOrDocumentId },
    populate: ['customer'],
  });

  if (byDocumentId) {
    return byDocumentId;
  }

  const asNumericId = Number.parseInt(idOrDocumentId, 10);
  if (Number.isFinite(asNumericId)) {
    return strapi.db.query('api::address.address').findOne({
      where: { id: asNumericId },
      populate: ['customer'],
    });
  }

  return null;
}

export default factories.createCoreController('api::address.address', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('You must be logged in to create an address');
    }

    const roleType = user.role?.type;
    if (roleType !== 'customer' && roleType !== 'admin') {
      return ctx.forbidden('Only customers can manage addresses');
    }

    if (roleType === 'admin') {
      return super.create(ctx);
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    ctx.request.body.data.customer = customer.id;

    return super.create(ctx);
  },

  async find(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to view addresses');
    }

    const roleType = user.role?.type;
    if (roleType === 'admin') {
      return super.find(ctx);
    }
    if (roleType !== 'customer') {
      return ctx.forbidden('Only customers can view their addresses');
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    const existingFilters = (ctx.query.filters || {}) as Record<string, any>;
    ctx.query.filters = {
      ...existingFilters,
      customer: { id: { $eq: customer.id } },
    };

    return super.find(ctx);
  },

  async findOne(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to view addresses');
    }

    const roleType = user.role?.type;
    if (roleType === 'admin') {
      return super.findOne(ctx);
    }
    if (roleType !== 'customer') {
      return ctx.forbidden('Only customers can view their addresses');
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    const existing = await findAddressRecord(strapi, ctx.params.id);
    if (!existing) {
      return ctx.notFound('Address not found');
    }

    if (existing.customer?.id !== customer.id) {
      return ctx.forbidden('You can only access your own address');
    }

    return super.findOne(ctx);
  },

  async update(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to update addresses');
    }

    const roleType = user.role?.type;
    if (roleType === 'admin') {
      return super.update(ctx);
    }
    if (roleType !== 'customer') {
      return ctx.forbidden('Only customers can update their addresses');
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    const existing = await findAddressRecord(strapi, ctx.params.id);
    if (!existing) {
      return ctx.notFound('Address not found');
    }

    if (existing.customer?.id !== customer.id) {
      return ctx.forbidden('You can only update your own address');
    }

    if (!ctx.request.body.data) {
      ctx.request.body.data = {};
    }
    ctx.request.body.data.customer = customer.id;

    return super.update(ctx);
  },

  async delete(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in to delete addresses');
    }

    const roleType = user.role?.type;
    if (roleType === 'admin') {
      return super.delete(ctx);
    }
    if (roleType !== 'customer') {
      return ctx.forbidden('Only customers can delete their addresses');
    }

    const customer = await resolveCustomer(strapi, ctx);
    if (!customer) {
      return ctx.badRequest('No customer profile found for this user');
    }

    const existing = await findAddressRecord(strapi, ctx.params.id);
    if (!existing) {
      return ctx.notFound('Address not found');
    }

    if (existing.customer?.id !== customer.id) {
      return ctx.forbidden('You can only delete your own address');
    }

    return super.delete(ctx);
  },
}));
