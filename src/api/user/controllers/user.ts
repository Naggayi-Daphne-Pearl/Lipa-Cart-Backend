import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::user.user', ({ strapi }) => ({
  /**
   * Override create to automatically assign role based on user_type
   * 
   * Note: Our custom 'user' content type is separate from Strapi's
   * users-permissions plugin users. Role assignment should be handled
   * when creating users through the authentication endpoints, not here.
   * 
   * This controller manages our custom user profiles (phone, name, user_type)
   * while Strapi's auth handles login credentials and roles.
   */
  async create(ctx) {
    const response = await super.create(ctx);
    
    return response;
  },

  /**
   * Override update to log changes
   */
  async update(ctx) {
    const response = await super.update(ctx);

    return response;
  },

  /**
   * Register or update FCM device token for push notifications.
   * POST /api/user/register-device
   * Body: { fcm_token: string }
   */
  async registerDevice(ctx: any) {
    try {
      const authUser = ctx.state.user;
      if (!authUser) {
        return ctx.unauthorized('You must be authenticated');
      }

      const { fcm_token } = ctx.request.body;
      if (!fcm_token || typeof fcm_token !== 'string') {
        return ctx.badRequest('fcm_token is required');
      }

      const customUser = await strapi.db.query('api::user.user').findOne({
        where: { phone: authUser.username },
      }) as any;

      if (!customUser) {
        return ctx.notFound('User profile not found');
      }

      await strapi.db.query('api::user.user').update({
        where: { id: customUser.id },
        data: { fcm_token },
      });

      ctx.body = { ok: true };
    } catch (error) {
      console.error('Error registering device token:', error);
      ctx.throw(500, 'Failed to register device');
    }
  },

  /**
   * Get current user profile
   * Uses JWT to identify the authenticated user
   */
  async me(ctx: any) {
    try {
      const authUser = ctx.state.user;
      if (!authUser) {
        return ctx.unauthorized('You must be authenticated to access this endpoint');
      }

      // Find custom user by phone using direct database access (bypasses permission checks)
      const customUser = (await strapi.db.connection('api_users').where({ phone: authUser.username }).first()) as any;

      if (!customUser) {
        return ctx.notFound('User profile not found');
      }

      ctx.body = {
        id: customUser.documentId,
        phone: customUser.phone,
        name: customUser.name ?? null,
        email: customUser.email ?? null,
        user_type: customUser.user_type,
        profile_photo: customUser.profile_photo?.url ?? null,
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      ctx.throw(500, 'Failed to fetch user profile');
    }
  },
}));

