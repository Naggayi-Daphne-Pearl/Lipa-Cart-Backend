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

      // Prevent signup for admin role only
      const normalizedUserType = (userType || 'customer').toLowerCase();
      if (normalizedUserType === 'admin') {
        return ctx.forbidden('Admin accounts cannot be created via signup. Please contact the administrator.');
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

      // Create shopper profile if user type is shopper
      let shopperId = null;
      let kycStatus = 'not_submitted';
      if (normalizedUserType === 'shopper') {
        try {
          const shopper: any = await strapi.entityService.create('api::shopper.shopper', {
            data: {
              user: customUser.documentId,
              kyc_status: 'not_submitted',
            },
          });
          shopperId = shopper.documentId ?? String(shopper.id);
          kycStatus = shopper.kyc_status ?? 'not_submitted';
        } catch (err) {
          console.error('Failed to create shopper record:', err);
        }
      }

      // Create rider profile if user type is rider
      let riderId = null;
      if (normalizedUserType === 'rider') {
        try {
          const rider: any = await strapi.entityService.create('api::rider.rider', {
            data: {
              user: customUser.documentId,
              kyc_status: 'not_submitted',
            },
          });
          riderId = rider.documentId ?? String(rider.id);
          kycStatus = rider.kyc_status ?? 'not_submitted';
        } catch (err) {
          console.error('Failed to create rider record:', err);
        }
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
          ...(normalizedUserType === 'shopper' && { shopper_id: shopperId, kyc_status: kycStatus }),
          ...(normalizedUserType === 'rider' && { rider_id: riderId, kyc_status: kycStatus }),
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

      // Get shopper ID and KYC status if user is a shopper
      let shopperId = null;
      let kycStatus = 'not_submitted';
      if (user.user_type === 'shopper') {
        try {
          let shopper: any = null;
          try {
            const linkResult: any = await strapi.db.connection.raw(
              `SELECT shopper_id FROM shoppers_user_lnk WHERE user_id = ?`,
              [user.id]
            );
            const rows = linkResult?.rows || linkResult;
            if (rows && rows.length > 0) {
              shopper = await strapi.db.query('api::shopper.shopper').findOne({
                where: { id: rows[0].shopper_id },
              });
            }
          } catch (linkErr: any) {
            console.log('login - link table query failed:', linkErr?.message);
          }

          if (!shopper) {
            const allShoppers: any = await strapi.db.query('api::shopper.shopper').findMany({
              populate: ['user'],
              limit: 200,
            });
            shopper = allShoppers.find((s: any) =>
              s.user?.id === user.id ||
              s.user?.documentId === user.documentId
            );
          }

          if (shopper) {
            shopperId = shopper.documentId ?? String(shopper.id);
            kycStatus = shopper.kyc_status ?? 'not_submitted';
            // If admin manually set is_verified=true via Strapi panel, treat as approved
            if (shopper.is_verified === true && kycStatus !== 'approved') {
              kycStatus = 'approved';
            }
          }
        } catch (err) {
          console.error('Failed to fetch shopper record:', err);
        }
      }

      // Get rider ID and KYC status if user is a rider
      let riderId = null;
      let riderKycStatus = 'not_submitted';
      if (user.user_type === 'rider') {
        try {
          let rider: any = null;
          try {
            const linkResult: any = await strapi.db.connection.raw(
              `SELECT rider_id FROM riders_user_lnk WHERE user_id = ?`,
              [user.id]
            );
            const rows = linkResult?.rows || linkResult;
            if (rows && rows.length > 0) {
              rider = await strapi.db.query('api::rider.rider').findOne({
                where: { id: rows[0].rider_id },
              });
            }
          } catch (linkErr: any) {
            console.log('login - rider link table query failed:', linkErr?.message);
          }

          if (!rider) {
            const allRiders: any = await strapi.db.query('api::rider.rider').findMany({
              populate: ['user'],
              limit: 200,
            });
            rider = allRiders.find((r: any) =>
              r.user?.id === user.id ||
              r.user?.documentId === user.documentId
            );
          }

          if (rider) {
            riderId = rider.documentId ?? String(rider.id);
            riderKycStatus = rider.kyc_status ?? 'not_submitted';
            if (rider.is_verified === true && riderKycStatus !== 'approved') {
              riderKycStatus = 'approved';
            }
          }
        } catch (err) {
          console.error('Failed to fetch rider record:', err);
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
          ...(user.user_type === 'shopper' && { shopper_id: shopperId, kyc_status: kycStatus }),
          ...(user.user_type === 'rider' && { rider_id: riderId, kyc_status: riderKycStatus }),
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
      // Manual JWT verification (auth: false on route)
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let user: any;
      try {
        const payload = await strapi.plugins['users-permissions'].services.jwt.verify(token);
        user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id: payload.id } });
      } catch (err) {
        return ctx.unauthorized('Invalid or expired token');
      }

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

      // Get shopper ID and KYC status if user is a shopper
      let shopperId = null;
      let kycStatus = 'not_submitted';
      if (customUser?.user_type === 'shopper') {
        try {
          let shopper: any = null;
          try {
            const linkResult: any = await strapi.db.connection.raw(
              `SELECT shopper_id FROM shoppers_user_lnk WHERE user_id = ?`,
              [customUser.id]
            );
            const rows = linkResult?.rows || linkResult;
            if (rows && rows.length > 0) {
              shopper = await strapi.db.query('api::shopper.shopper').findOne({
                where: { id: rows[0].shopper_id },
              });
            }
          } catch (linkErr: any) {
            console.log('refresh - link table query failed:', linkErr?.message);
          }

          if (!shopper) {
            const allShoppers: any = await strapi.db.query('api::shopper.shopper').findMany({
              populate: ['user'],
              limit: 200,
            });
            shopper = allShoppers.find((s: any) =>
              s.user?.id === customUser.id ||
              s.user?.documentId === customUser.documentId
            );
          }

          if (shopper) {
            shopperId = shopper.documentId ?? String(shopper.id);
            kycStatus = shopper.kyc_status ?? 'not_submitted';
            // If admin manually set is_verified=true via Strapi panel, treat as approved
            if (shopper.is_verified === true && kycStatus !== 'approved') {
              kycStatus = 'approved';
            }
          }
        } catch (err) {
          console.error('Failed to fetch shopper record:', err);
        }
      }

      // Get rider ID and KYC status if user is a rider
      let riderId = null;
      let riderKycStatus = 'not_submitted';
      if (customUser?.user_type === 'rider') {
        try {
          let rider: any = null;
          try {
            const linkResult: any = await strapi.db.connection.raw(
              `SELECT rider_id FROM riders_user_lnk WHERE user_id = ?`,
              [customUser.id]
            );
            const rows = linkResult?.rows || linkResult;
            if (rows && rows.length > 0) {
              rider = await strapi.db.query('api::rider.rider').findOne({
                where: { id: rows[0].rider_id },
              });
            }
          } catch (linkErr: any) {
            console.log('refresh - rider link table query failed:', linkErr?.message);
          }

          if (!rider) {
            const allRiders: any = await strapi.db.query('api::rider.rider').findMany({
              populate: ['user'],
              limit: 200,
            });
            rider = allRiders.find((r: any) =>
              r.user?.id === customUser.id ||
              r.user?.documentId === customUser.documentId
            );
          }

          if (rider) {
            riderId = rider.documentId ?? String(rider.id);
            riderKycStatus = rider.kyc_status ?? 'not_submitted';
            if (rider.is_verified === true && riderKycStatus !== 'approved') {
              riderKycStatus = 'approved';
            }
          }
        } catch (err) {
          console.error('Failed to fetch rider record:', err);
        }
      }

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
              ...(customUser.user_type === 'shopper' && { shopper_id: shopperId, kyc_status: kycStatus }),
              ...(customUser.user_type === 'rider' && { rider_id: riderId, kyc_status: riderKycStatus }),
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
      // Manual JWT verification (auth: false on route)
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Authentication required');
      }
      const token = authHeader.slice(7);
      let user: any;
      try {
        const payload = await strapi.plugins['users-permissions'].services.jwt.verify(token);
        user = await strapi.query('plugin::users-permissions.user').findOne({ where: { id: payload.id } });
      } catch (err) {
        return ctx.unauthorized('Invalid or expired token');
      }

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

      // Get shopper ID and KYC status if user is a shopper
      let shopperId = null;
      let kycStatus = 'not_submitted';
      let shopperRecord: any = null;
      if (customUser.user_type === 'shopper') {
        try {
          // Strapi v5 stores relations in link tables, so query the link table directly
          let shopper: any = null;
          try {
            const linkResult: any = await strapi.db.connection.raw(
              `SELECT shopper_id FROM shoppers_user_lnk WHERE user_id = ?`,
              [customUser.id]
            );
            const rows = linkResult?.rows || linkResult;
            if (rows && rows.length > 0) {
              shopper = await strapi.db.query('api::shopper.shopper').findOne({
                where: { id: rows[0].shopper_id },
              });
            }
          } catch (linkErr: any) {
            console.log('me - link table query failed:', linkErr?.message);
          }

          // Fallback: query all shoppers with populate and match
          if (!shopper) {
            const allShoppers: any = await strapi.db.query('api::shopper.shopper').findMany({
              populate: ['user'],
              limit: 200,
            });
            shopper = allShoppers.find((s: any) =>
              s.user?.id === customUser.id ||
              s.user?.documentId === customUser.documentId
            );
          }

          if (shopper) {
            shopperRecord = shopper;
            shopperId = shopper.documentId ?? String(shopper.id);
            kycStatus = shopper.kyc_status ?? 'not_submitted';
            // If admin manually set is_verified=true via Strapi panel, treat as approved
            if (shopper.is_verified === true && kycStatus !== 'approved') {
              kycStatus = 'approved';
            }
            console.log('me - shopper found:', { id: shopper.id, documentId: shopper.documentId, kyc_status: kycStatus, is_verified: shopper.is_verified });
          } else {
            console.log('me - no shopper record found for user:', customUser.id);
          }
        } catch (err) {
          console.error('Failed to fetch shopper record:', err);
        }
      }

      // Get rider ID and KYC status if user is a rider
      let riderId = null;
      let riderKycStatus = 'not_submitted';
      let riderRecord: any = null;
      if (customUser.user_type === 'rider') {
        try {
          let rider: any = null;
          try {
            const linkResult: any = await strapi.db.connection.raw(
              `SELECT rider_id FROM riders_user_lnk WHERE user_id = ?`,
              [customUser.id]
            );
            const rows = linkResult?.rows || linkResult;
            if (rows && rows.length > 0) {
              rider = await strapi.db.query('api::rider.rider').findOne({
                where: { id: rows[0].rider_id },
              });
            }
          } catch (linkErr: any) {
            console.log('me - rider link table query failed:', linkErr?.message);
          }

          if (!rider) {
            const allRiders: any = await strapi.db.query('api::rider.rider').findMany({
              populate: ['user'],
              limit: 200,
            });
            rider = allRiders.find((r: any) =>
              r.user?.id === customUser.id ||
              r.user?.documentId === customUser.documentId
            );
          }

          if (rider) {
            riderRecord = rider;
            riderId = rider.documentId ?? String(rider.id);
            riderKycStatus = rider.kyc_status ?? 'not_submitted';
            if (rider.is_verified === true && riderKycStatus !== 'approved') {
              riderKycStatus = 'approved';
            }
            console.log('me - rider found:', { id: rider.id, documentId: rider.documentId, kyc_status: riderKycStatus, is_verified: rider.is_verified });
          } else {
            console.log('me - no rider record found for user:', customUser.id);
          }
        } catch (err) {
          console.error('Failed to fetch rider record:', err);
        }
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
        ...(customUser.user_type === 'shopper' && { shopper_id: shopperId, kyc_status: kycStatus, kyc_rejection_reason: shopperRecord?.kyc_rejection_reason ?? null }),
        ...(customUser.user_type === 'rider' && { rider_id: riderId, kyc_status: riderKycStatus, kyc_rejection_reason: riderRecord?.kyc_rejection_reason ?? null }),
      };
    } catch (error) {
      console.error('Get user profile error:', error);
      ctx.throw(500, 'Failed to get user profile');
    }
  },

  /**
   * Forgot password - Step 1: Send OTP
   * Verifies user exists, then sends OTP to their phone
   */
  async forgotPassword(ctx: any) {
    try {
      const { phone } = ctx.request.body;

      if (!phone) {
        return ctx.badRequest('Phone number is required');
      }

      if (!phone.startsWith('+256') || phone.length !== 13) {
        return ctx.badRequest('Invalid phone format. Use +256XXXXXXXXX');
      }

      // Verify that a user with this phone exists
      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({ where: { username: phone } });

      if (!authUser) {
        return ctx.badRequest('No account found with this phone number');
      }

      // Send OTP
      const otpService = strapi.service('api::otp.otp');
      otpService.generateOtp(phone);

      ctx.body = {
        success: true,
        message: 'Verification code sent',
      };
    } catch (error) {
      console.error('Forgot password error:', error);
      ctx.throw(500, 'Failed to send verification code');
    }
  },

  /**
   * Reset password - Step 2: Verify OTP and set new password
   * Takes phone + OTP + new password, verifies OTP, updates password
   */
  async resetPassword(ctx: any) {
    try {
      const { phone, otp, newPassword } = ctx.request.body;

      if (!phone || !otp || !newPassword) {
        return ctx.badRequest('Phone, OTP, and new password are required');
      }

      if (newPassword.length < 6) {
        return ctx.badRequest('Password must be at least 6 characters');
      }

      // Verify OTP
      const otpService = strapi.service('api::otp.otp');
      const isValid = otpService.verifyOtp(phone, otp);

      if (!isValid) {
        ctx.status = 401;
        return (ctx.body = { error: 'Invalid or expired verification code' });
      }

      // Find auth user
      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({ where: { username: phone } });

      if (!authUser) {
        return ctx.notFound('User not found');
      }

      // Update password using Strapi's user service (handles hashing)
      await strapi.plugins['users-permissions'].services.user.edit(authUser.id, {
        password: newPassword,
      });

      console.log(`Password reset successful for ${phone}`);

      ctx.body = {
        success: true,
        message: 'Password reset successfully',
      };
    } catch (error) {
      console.error('Reset password error:', error);
      ctx.throw(500, 'Failed to reset password');
    }
  },

  /**
   * TEMPORARY ENDPOINT: Assign admin role to a user
   * This is for testing/admin setup purposes. Remove in production.
   */
  async assignAdminRole(ctx: any) {
    try {
      const { userId } = ctx.request.body;

      if (!userId) {
        return ctx.badRequest('userId is required');
      }

      // Get the admin role
      const adminRole = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'admin' } });

      if (!adminRole) {
        return ctx.notFound('Admin role not found');
      }

      // Update the user with the admin role
      const updatedUser = await strapi
        .query('plugin::users-permissions.user')
        .update({
          where: { id: userId },
          data: { role: adminRole.id },
        });

      ctx.body = {
        message: `Admin role assigned to user ${userId}`,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          role: adminRole.type,
        },
      };
    } catch (error) {
      console.error('Assign admin role error:', error);
      ctx.throw(500, 'Failed to assign admin role');
    }
  },
} as any;
