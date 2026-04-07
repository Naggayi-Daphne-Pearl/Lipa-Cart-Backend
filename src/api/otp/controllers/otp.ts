import type { Core } from '@strapi/strapi';
import { createAuthUserWithRole } from '../../../services/role-helper';
import { issueSessionTokens } from '../../../services/session-token';

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
      const { phone, otp, rememberMe = true } = ctx.request.body;

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
          populate: { profile_photo: true, customer: true },
        });

      if (!customUser) {
        customUser = await strapi.entityService.create('api::user.user', {
          data: {
            phone,
            user_type: 'customer',
            is_active: true,
          },
          populate: { profile_photo: true, customer: true },
        });
      }

      let customerId = null;
      if (customUser.customer?.id) {
        customerId = customUser.customer.id;
      } else {
        try {
          const referralCode = `LC${Date.now().toString(36).toUpperCase()}`;
          const newCustomer: any = await strapi.entityService.create(
            'api::customer.customer',
            {
              data: {
                user: customUser.id,
                referral_code: referralCode,
                total_orders: 0,
              },
            },
          );
          customerId = newCustomer.id;
        } catch (err) {
          console.error('Failed to create customer record during OTP verify:', err);
        }
      }

      const session = await issueSessionTokens(
        strapi,
        ctx,
        authUser,
        customUser,
        rememberMe !== false,
      );

      // Return custom user's data as primary identity
      ctx.body = {
        jwt: session.jwt,
        refreshToken: session.refreshToken,
        session: {
          rememberMe: session.rememberMe,
          accessTokenExpiresIn: session.accessTokenExpiresIn,
          refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
        },
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
      console.error('OTP verify error:', error);
      ctx.throw(500, 'Failed to verify OTP');
    }
  },
} as any;
