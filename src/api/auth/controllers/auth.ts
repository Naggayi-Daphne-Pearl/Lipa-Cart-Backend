import type { Core } from '@strapi/strapi';
import { createAuthUserWithRole } from '../../../services/role-helper';

export default {
  /**
   * Sign up with phone, password, and optional name/email
   * Creates both auth user and custom user profile
   */
  async signup(ctx: any) {
    try {
      const { phone, password, name, email, userType } = ctx.request.body;

      // Validate required fields
      if (!phone || !password) {
        return ctx.badRequest('Phone and password are required');
      }

      // Validate phone format
      if (!phone.startsWith('+256') || phone.length !== 13) {
        return ctx.badRequest('Invalid phone format. Use +256XXXXXXXXX (9 digits after prefix)');
      }

      // Validate password strength (minimum 6 characters)
      if (password.length < 6) {
        return ctx.badRequest('Password must be at least 6 characters');
      }

      // Check if user already exists
      const existingAuthUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { username: phone },
        });

      if (existingAuthUser) {
        return ctx.badRequest('User with this phone number already exists');
      }

      // Create auth user with password
      const authUser = await createAuthUserWithRole(strapi, {
        username: phone,
        email: email || `${phone.replace('+', '')}@lipacart.local`,
        password, // Will be hashed by Strapi
        userType: userType || 'customer',
        confirmed: true,
      });

      if (!authUser) {
        ctx.throw(500, 'Failed to create user');
      }

      // Create custom user profile
      const customUser: any = await strapi.entityService.create('api::user.user', {
        data: {
          phone,
          name: name || null,
          email: email || null,
          user_type: userType || 'customer',
          is_active: true,
        },
        populate: { profile_photo: true },
      });

      // Create customer profile if user type is customer
      let customerId = null;
      if ((userType || 'customer') === 'customer') {
        // Generate unique referral code
        const referralCode = `LC${Date.now().toString(36).toUpperCase()}`;
        
        const customer = await strapi.entityService.create('api::customer.customer', {
          data: {
            user: customUser.id,
            referral_code: referralCode,
            total_orders: 0,
          },
        });
        
        customerId = customer.id;
      }

      // Generate JWT
      const jwt = strapi.plugins['users-permissions'].services.jwt.issue({
        id: authUser.id,
      });

      ctx.body = {
        jwt,
        user: {
          id: customUser.id,
          document_id: customUser.documentId,
          phone: customUser.phone,
          name: customUser.name ?? null,
          email: customUser.email ?? null,
          user_type: customUser.user_type,
          profile_photo: customUser.profile_photo?.url ?? null,
          customer_id: customerId,
        },
      };
    } catch (error) {
      console.error('Signup error:', error);
      ctx.throw(500, 'Failed to sign up');
    }
  },

  /**
   * Login with phone and password
   * Returns JWT token and user profile
   */
  async login(ctx: any) {
    try {
      const { phone, password } = ctx.request.body;

      // Validate required fields
      if (!phone || !password) {
        return ctx.badRequest('Phone and password are required');
      }

      // Find auth user by phone (username)
      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { username: phone },
          populate: { role: true },
        });

      if (!authUser) {
        return ctx.badRequest('Invalid phone or password');
      }

      // Verify password using Strapi's built-in password verification
      const validPassword = await strapi.plugins[
        'users-permissions'
      ].services.user.validatePassword(password, authUser.password);

      if (!validPassword) {
        return ctx.badRequest('Invalid phone or password');
      }

      // Check if user is blocked
      if (authUser.blocked) {
        return ctx.badRequest('Your account has been blocked');
      }

      // Fetch custom user profile
      const customUser: any = await strapi
        .entityService
        .findMany('api::user.user', {
          filters: { phone },
          populate: { profile_photo: true, customer: true },
        });

      if (!customUser || customUser.length === 0) {
        return ctx.notFound('User profile not found');
      }

      const user = customUser[0];

      // Get customer ID if user is a customer
      let customerId = null;
      if (user.user_type === 'customer') {
        // Check if customer record exists
        if (user.customer) {
          customerId = user.customer.id;
        } else {
          // Create customer record if it doesn't exist
          try {
            const referralCode = `LC${Date.now().toString(36).toUpperCase()}`;
            const newCustomer = await strapi.entityService.create('api::customer.customer', {
              data: {
                user: user.id,
                referral_code: referralCode,
                total_orders: 0,
              },
            });
            customerId = newCustomer.id;
          } catch (err) {
            console.error('Failed to create customer record:', err);
            // Continue anyway, just without customer ID
          }
        }
      }

      // Generate JWT
      const jwt = strapi.plugins['users-permissions'].services.jwt.issue({
        id: authUser.id,
      });

      ctx.body = {
        jwt,
        user: {
          id: user.id,
          document_id: user.documentId,
          phone: user.phone,
          name: user.name ?? null,
          email: user.email ?? null,
          user_type: user.user_type,
          profile_photo: user.profile_photo?.url ?? null,
          customer_id: customerId,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      ctx.throw(500, 'Failed to login');
    }
  },

  /**
   * Refresh JWT token
   * Takes a valid (but potentially expiring) JWT and issues a new one
   */
  async refresh(ctx: any) {
    try {
      // User is already authenticated via middleware (JWT exists and is valid)
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized('No user found');
      }

      // Issue new JWT token
      const jwt = strapi.plugins['users-permissions'].services.jwt.issue({
        id: user.id,
      });

      // Fetch custom user profile for response
      const customUser: any = await strapi
        .query('api::user.user')
        .findOne({
          where: { phone: user.username },
          populate: { profile_photo: true, customer: true },
        });

      const customerId = customUser?.customer?.id ?? null;

      ctx.body = {
        jwt,
        user: customUser
          ? {
              id: customUser.id,
              document_id: customUser.documentId,
              phone: customUser.phone,
              name: customUser.name ?? null,
              email: customUser.email ?? null,
              user_type: customUser.user_type,
              profile_photo: customUser.profile_photo?.url ?? null,
              customer_id: customerId,
            }
          : {
              id: user.id,
              document_id: null,
              phone: user.username,
              name: null,
              email: user.email,
              user_type: 'customer',
              profile_photo: null,
              customer_id: null,
            },
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      ctx.throw(500, 'Failed to refresh token');
    }
  },

  /**
   * Get current authenticated user profile
   * Standardized /api/auth/me endpoint
   */
  async me(ctx: any) {
    try {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized('No user found');
      }

      // Fetch custom user profile
      const customUser: any = await strapi
        .query('api::user.user')
        .findOne({
          where: { phone: user.username },
          populate: { profile_photo: true, customer: true },
        });

      if (!customUser) {
        return ctx.notFound('User profile not found');
      }

      ctx.body = {
        id: customUser.id,
        document_id: customUser.documentId,
        phone: customUser.phone,
        name: customUser.name ?? null,
        email: customUser.email ?? null,
        user_type: customUser.user_type,
        profile_photo: customUser.profile_photo?.url ?? null,
        customer_id: customUser.customer?.id ?? null,
      };
    } catch (error) {
      console.error('Get user profile error:', error);
      ctx.throw(500, 'Failed to get user profile');
    }
  },
} as any;
