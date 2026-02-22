import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::address.address', ({ strapi }) => ({
  async create(ctx) {
    // Get the authenticated user
    const user = ctx.state.user;
    
    if (!user) {
      return ctx.unauthorized('You must be logged in to create an address');
    }

    // Always find the customer profile for the authenticated user
    // This ensures users can only create addresses for themselves
    // Find the custom user profile by phone (stored as username in auth)
    const userProfiles: any = await strapi.entityService.findMany('api::user.user', {
      filters: { phone: user.username },
      limit: 1,
    });
    
    if (!userProfiles || userProfiles.length === 0) {
      return ctx.badRequest('No user profile found');
    }
    
    const customUserProfile = userProfiles[0];
    
    // Find customer profile for this user
    const customers: any = await strapi.entityService.findMany('api::customer.customer', {
      filters: { user: customUserProfile.id } as any,
      limit: 1,
    });
    
    if (!customers || customers.length === 0) {
      return ctx.badRequest('No customer profile found for this user');
    }
    
    const customer = customers[0];
    
    // Always use the customer ID we found (for security - users can only create for themselves)
    ctx.request.body.data.customer = customer.id;
    
    const response = await super.create(ctx);
    return response;
  },
}));

