import { factories } from '@strapi/strapi';

const MAX_DEVICE_TOKENS = 8;

function normalizeTokenList(tokens: unknown): string[] {
  if (!Array.isArray(tokens)) return [];
  return tokens
    .filter((token): token is string => typeof token === 'string' && token.trim().length > 0)
    .map((token) => token.trim());
}

function getAllStoredTokens(customUser: any): string[] {
  const tokens = normalizeTokenList(customUser?.fcm_tokens);
  const legacyToken =
    typeof customUser?.fcm_token === 'string' && customUser.fcm_token.trim().length > 0
      ? customUser.fcm_token.trim()
      : null;

  if (legacyToken != null && !tokens.includes(legacyToken)) {
    tokens.unshift(legacyToken);
  }

  return Array.from(new Set(tokens));
}

async function resolveAuthenticatedCustomUser(strapi: any, ctx: any): Promise<any | null> {
  const authHeader = ctx.request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    ctx.unauthorized('You must be authenticated');
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  let jwtUser: any;
  try {
    jwtUser = await strapi.plugins['users-permissions'].services.jwt.verify(token);
  } catch {
    ctx.unauthorized('Invalid or expired token');
    return null;
  }

  const authUser: any = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: jwtUser.id },
  });
  if (!authUser) {
    ctx.unauthorized('User not found');
    return null;
  }

  const customUser = (await strapi.db.query('api::user.user').findOne({
    where: { phone: authUser.username },
  })) as any;

  if (!customUser) {
    ctx.notFound('User profile not found');
    return null;
  }

  return customUser;
}

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
      const customUser = await resolveAuthenticatedCustomUser(strapi, ctx);
      if (!customUser) return;

      const { fcm_token } = ctx.request.body;
      if (!fcm_token || typeof fcm_token !== 'string') {
        return ctx.badRequest('fcm_token is required');
      }

      const normalizedToken = fcm_token.trim();
      if (!normalizedToken) {
        return ctx.badRequest('fcm_token is required');
      }

      const existingTokens = getAllStoredTokens(customUser);
      const mergedTokens = [
        normalizedToken,
        ...existingTokens.filter((token) => token !== normalizedToken),
      ].slice(0, MAX_DEVICE_TOKENS);

      await strapi.db.query('api::user.user').update({
        where: { id: customUser.id },
        data: {
          // Keep legacy single-token field for backward compatibility.
          fcm_token: normalizedToken,
          fcm_tokens: mergedTokens,
        },
      });

      console.log(
        `[notifications] FCM token registered for user ${customUser.id}: ${normalizedToken.slice(0, 20)}...`,
      );
      ctx.body = { ok: true };
    } catch (error) {
      console.error('Error registering device token:', error);
      ctx.throw(500, 'Failed to register device');
    }
  },

  /**
   * Unregister current or provided FCM token.
   * POST /api/user/unregister-device
   * Body: { fcm_token?: string }
   */
  async unregisterDevice(ctx: any) {
    try {
      const customUser = await resolveAuthenticatedCustomUser(strapi, ctx);
      if (!customUser) return;

      const rawToken = ctx.request.body?.fcm_token;
      if (typeof rawToken === 'string' && rawToken.trim().length === 0) {
        return ctx.badRequest('fcm_token cannot be blank');
      }

      const providedToken = typeof rawToken === 'string' ? rawToken.trim() : null;

      const existingTokens = getAllStoredTokens(customUser);
      const nextTokens = providedToken
        ? existingTokens.filter((token) => token !== providedToken)
        : [];

      await strapi.db.query('api::user.user').update({
        where: { id: customUser.id },
        data: {
          fcm_tokens: nextTokens,
          fcm_token: nextTokens.length > 0 ? nextTokens[0] : null,
        },
      });

      ctx.body = { ok: true };
    } catch (error) {
      console.error('Error unregistering device token:', error);
      ctx.throw(500, 'Failed to unregister device');
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
      const customUser = (await strapi.db
        .connection('api_users')
        .where({ phone: authUser.username })
        .first()) as any;

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

  /**
   * Delete current user account.
   * DELETE /api/user/delete-account
   * Removes both custom user profile and Strapi auth user.
   */
  async deleteAccount(ctx: any) {
    try {
      const authUser = ctx.state.user;
      if (!authUser) return ctx.unauthorized('Authentication required');

      // Find custom user
      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: authUser.username },
      });

      if (customUser) {
        // Clear all registered device tokens
        await strapi.db.query('api::user.user').update({
          where: { id: customUser.id },
          data: {
            fcm_token: null,
            fcm_tokens: [],
            name: 'Deleted User',
            email: null,
            phone: `deleted_${customUser.id}`,
          },
        });
      }

      // Delete auth user (users-permissions)
      await strapi.plugins['users-permissions'].services.user.remove({ id: authUser.id });

      ctx.body = { ok: true, message: 'Account deleted successfully' };
    } catch (error) {
      console.error('Delete account error:', error);
      ctx.throw(500, 'Failed to delete account');
    }
  },

  /**
   * Change phone number with OTP verification.
   * POST /api/user/change-phone
   * Body: { new_phone: string, otp: string }
   */
  async changePhone(ctx: any) {
    try {
      const authUser = ctx.state.user;
      if (!authUser) return ctx.unauthorized('Authentication required');

      const { new_phone, otp } = ctx.request.body;
      if (!new_phone || !otp) return ctx.badRequest('new_phone and otp are required');

      // Verify OTP for the new phone
      const otpService = strapi.service('api::otp.otp') as any;
      const isValid = otpService.verifyOtp(new_phone, otp);
      if (!isValid) return ctx.badRequest('Invalid or expired OTP');

      // Check if new phone is already taken
      const existing: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: new_phone },
      });
      if (existing) return ctx.badRequest('This phone number is already registered');

      // Update custom user phone
      const customUser: any = await strapi.db.query('api::user.user').findOne({
        where: { phone: authUser.username },
      });
      if (customUser) {
        await strapi.db.query('api::user.user').update({
          where: { id: customUser.id },
          data: { phone: new_phone },
        });
      }

      // Update auth user username
      await strapi.plugins['users-permissions'].services.user.edit(authUser.id, {
        username: new_phone,
      });

      ctx.body = { ok: true, message: 'Phone number updated successfully' };
    } catch (error) {
      console.error('Change phone error:', error);
      ctx.throw(500, 'Failed to change phone number');
    }
  },
}));
