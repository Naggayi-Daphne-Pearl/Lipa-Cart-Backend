import type { Core } from '@strapi/strapi';
import { createAuthUserWithRole } from '../../../services/role-helper';

export default {
  async request(ctx: any) {
    try {
      const { phone } = ctx.request.body;

      // Validate phone format
      if (!phone || typeof phone !== 'string') {
        return ctx.badRequest('Phone number is required');
      }

      // Must start with +256 and be 13 chars total: +256 (4 chars) + 9 digits
      if (!phone.startsWith('+256') || phone.length !== 13) {
        return ctx.badRequest('Invalid phone format. Use +256XXXXXXXXX (9 digits after prefix)');
      }

      // Generate, store, and send OTP (via SMS if configured, else logs to console)
      const otpService = strapi.service('api::otp.otp');
      await otpService.generateOtp(phone);

      ctx.body = {
        success: true,
        message: 'Verification code sent',
      };
    } catch (error) {
      ctx.throw(500, 'Failed to send OTP');
    }
  },

  async verify(ctx: any) {
    try {
      const { phone, otp } = ctx.request.body;

      if (!phone || !otp) {
        return ctx.badRequest('Phone and OTP are required');
      }

      // Verify OTP
      const otpService = strapi.service('api::otp.otp');
      const isValid = otpService.verifyOtp(phone, otp);

      if (!isValid) {
        ctx.status = 401;
        return (ctx.body = {
          error: 'Invalid or expired OTP',
        });
      }

      // OTP verified - find or create auth user
      let authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { username: phone },
          populate: { role: true },
        });

      if (!authUser) {
        // Create new user with customer role
        authUser = await createAuthUserWithRole(strapi, {
          username: phone,
          email: `${phone.replace('+', '')}@lipacart.local`,
          userType: 'customer',
          confirmed: true,
        });

        if (!authUser) {
          ctx.throw(500, 'Failed to create user');
        }
      }

      // Find or create custom user profile
      let customUser = await strapi
        .query('api::user.user')
        .findOne({
          where: { phone },
          populate: { profile_photo: true },
        });

      if (!customUser) {
        customUser = await strapi.entityService.create('api::user.user', {
          data: {
            phone,
            user_type: 'customer',
            is_active: true,
          },
          populate: { profile_photo: true },
        });
      }

      // Generate JWT (for auth user)
      const jwt = strapi.plugins['users-permissions'].services.jwt.issue({
        id: authUser.id,
      });

      // Return custom user's data as primary identity
      ctx.body = {
        jwt,
        user: {
          id: customUser.documentId,
          phone: customUser.phone,
          name: customUser.name ?? null,
          email: customUser.email ?? null,
          user_type: customUser.user_type,
          profile_photo: customUser.profile_photo?.url ?? null,
        },
      };
    } catch (error) {
      console.error('OTP verify error:', error);
      ctx.throw(500, 'Failed to verify OTP');
    }
  },
} as any;
