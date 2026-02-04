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
    
    // Log user creation for tracking
    if (response?.data) {
      console.log(`✓ Created user profile: ${response.data.id} (${response.data.user_type})`);
    }
    
    return response;
  },

  /**
   * Override update to log changes
   */
  async update(ctx) {
    const response = await super.update(ctx);
    
    // Log user updates for tracking
    if (response?.data) {
      console.log(`✓ Updated user profile: ${response.data.id} (${response.data.user_type})`);
    }
    
    return response;
  },
}));

