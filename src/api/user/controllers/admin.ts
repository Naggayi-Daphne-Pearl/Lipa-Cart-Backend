import type { Core } from '@strapi/strapi';

export default {
  /**
   * Get all users with their roles and profiles - respects filters
   * Admin only endpoint
   * Supports filters: user_type, is_active, name, phone
   */
  async findAll(ctx: any) {
    try {
      // Manual JWT verification
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return ctx.unauthorized('No authorization token provided');
      }

      const token = authHeader.slice(7);
      let user: any;
      try {
        user = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch (error) {
        return ctx.unauthorized('Invalid or expired token');
      }

      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { id: user.id },
          populate: { role: true },
        });

      if (authUser?.role?.type !== 'admin') {
        return ctx.forbidden('Admin access required');
      }

      // Build filters from query parameters
      const filters: any = {};
      const query = ctx.query as any;

      // Handle filters[user_type][$eq]=shopper syntax from frontend
      if (query.filters) {
        if (query.filters.user_type) {
          filters.user_type = query.filters.user_type.$eq || query.filters.user_type;
        }
        if (query.filters.is_active) {
          filters.is_active = query.filters.is_active.$eq === 'true' || query.filters.is_active.$eq === true;
        }
        if (query.filters.$or) {
          // Handle search across name and phone fields
          // This is more complex - would need custom implementation
        }
      }

      // Handle pagination
      const page = parseInt(query.pagination?.page) || 1;
      const pageSize = parseInt(query.pagination?.pageSize) || 20;
      const offset = (page - 1) * pageSize;

      // Fetch custom users with filters
      const users = await strapi.entityService.findMany('api::user.user', {
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        populate: { profile_photo: true },
        limit: pageSize,
        offset: offset,
      });

      // Get total count for pagination
      const total = await strapi.db.query('api::user.user').count({
        where: Object.keys(filters).length > 0 ? filters : undefined,
      });

      // Transform response
      const transformedUsers = users.map((user: any) => ({
        id: user.documentId,
        phone: user.phone,
        name: user.name ?? null,
        email: user.email ?? null,
        user_type: user.user_type,
        is_active: user.is_active ?? true,
        profile_photo: user.profile_photo?.url ?? null,
        created_at: user.createdAt,
      }));

      ctx.body = transformedUsers;
      ctx.set('X-Total-Count', total.toString());
    } catch (error) {
      console.error('Error fetching users:', error);
      ctx.throw(500, 'Failed to fetch users');
    }
  },

  /**
   * Update user role
   * Admin only endpoint
   */
  async updateRole(ctx: any) {
    try {
      const { userId } = ctx.params;
      const { user_type } = ctx.request.body;

      // Validate user_type
      const validTypes = ['customer', 'shopper', 'rider', 'admin'];
      if (!validTypes.includes(user_type)) {
        return ctx.badRequest('Invalid user_type. Must be one of: ' + validTypes.join(', '));
      }

      // Manual JWT verification
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return ctx.unauthorized('No authorization token provided');
      }

      const token = authHeader.slice(7);
      let requestingUser: any;
      try {
        requestingUser = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch (error) {
        return ctx.unauthorized('Invalid or expired token');
      }

      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { id: requestingUser.id },
          populate: { role: true },
        });

      if (authUser?.role?.type !== 'admin') {
        return ctx.forbidden('Admin access required');
      }

      // Find custom user
      const customUser = await strapi.query('api::user.user').findOne({
        where: { documentId: userId },
      });

      if (!customUser) {
        return ctx.notFound('User not found');
      }

      // Update custom user's user_type
      const updatedUser = await strapi.entityService.update(
        'api::user.user',
        customUser.id,
        {
          data: { user_type },
        }
      );

      // Find and update corresponding auth user role
      const targetAuthUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { username: customUser.phone },
        });

      if (targetAuthUser) {
        const role = await strapi
          .query('plugin::users-permissions.role')
          .findOne({ where: { type: user_type } });

        if (role) {
          await strapi
            .query('plugin::users-permissions.user')
            .update({
              where: { id: targetAuthUser.id },
              data: { role: role.id },
            });
        }
      }

      ctx.body = {
        id: updatedUser.documentId,
        phone: updatedUser.phone,
        name: updatedUser.name,
        user_type: updatedUser.user_type,
        message: 'User role updated successfully',
      };
    } catch (error) {
      console.error('Error updating user role:', error);
      ctx.throw(500, 'Failed to update user role');
    }
  },

  /**
   * Toggle user active status
   * Admin only endpoint
   */
  async toggleStatus(ctx: any) {
    try {
      const { userId } = ctx.params;

      // Manual JWT verification
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return ctx.unauthorized('No authorization token provided');
      }

      const token = authHeader.slice(7);
      let requestingUser: any;
      try {
        requestingUser = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch (error) {
        return ctx.unauthorized('Invalid or expired token');
      }

      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { id: requestingUser.id },
          populate: { role: true },
        });

      if (authUser?.role?.type !== 'admin') {
        return ctx.forbidden('Admin access required');
      }

      // Find custom user
      const customUser = await strapi.query('api::user.user').findOne({
        where: { documentId: userId },
      });

      if (!customUser) {
        return ctx.notFound('User not found');
      }

      // Toggle is_active status
      const updatedUser = await strapi.entityService.update(
        'api::user.user',
        customUser.id,
        {
          data: { is_active: !customUser.is_active },
        }
      );

      // Also block/unblock auth user
      const targetAuthUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { username: customUser.phone },
        });

      if (targetAuthUser) {
        await strapi
          .query('plugin::users-permissions.user')
          .update({
            where: { id: targetAuthUser.id },
            data: { blocked: !updatedUser.is_active },
          });
      }

      ctx.body = {
        id: updatedUser.documentId,
        phone: updatedUser.phone,
        name: updatedUser.name,
        is_active: updatedUser.is_active,
        message: `User ${updatedUser.is_active ? 'activated' : 'deactivated'} successfully`,
      };
    } catch (error) {
      console.error('Error toggling user status:', error);
      ctx.throw(500, 'Failed to toggle user status');
    }
  },

  /**
   * Get dashboard statistics
   * Admin only endpoint
   */
  async getStats(ctx: any) {
    try {
      // Manual JWT verification since we disabled Strapi's auth middleware
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return ctx.unauthorized('No authorization token provided');
      }

      const token = authHeader.slice(7);
      let user: any;
      try {
        user = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch (error) {
        return ctx.unauthorized('Invalid or expired token');
      }

      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { id: user.id },
          populate: { role: true },
        });

      if (authUser?.role?.type !== 'admin') {
        return ctx.forbidden('Admin access required');
      }

      // Get counts using Promise.all for performance
      const [totalUsers, totalOrders, totalProducts, shopperCount, riderCount] = await Promise.all([
        strapi.db.query('api::user.user').count(),
        strapi.db.query('api::order.order').count(),
        strapi.db.query('api::product.product').count(),
        strapi.db.query('api::user.user').count({ where: { user_type: 'shopper' } }),
        strapi.db.query('api::user.user').count({ where: { user_type: 'rider' } }),
      ]);

      ctx.body = {
        totalUsers,
        totalOrders,
        totalProducts,
        shopperCount,
        riderCount,
      };
    } catch (error) {
      console.error('Error fetching stats:', error);
      ctx.throw(500, 'Failed to fetch statistics');
    }
  },

  /**
   * Create staff account (shopper or rider)
   * Admin only endpoint
   */
  async createStaff(ctx: any) {
    try {
      const { phone, password, name, email, userType } = ctx.request.body;

      // Manual JWT verification since we disabled Strapi's auth middleware
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return ctx.unauthorized('No authorization token provided');
      }

      const token = authHeader.slice(7);
      let user: any;
      try {
        user = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch (error) {
        return ctx.unauthorized('Invalid or expired token');
      }

      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { id: user.id },
          populate: { role: true },
        });

      if (authUser?.role?.type !== 'admin') {
        return ctx.forbidden('Admin access required');
      }

      // Validate required fields
      if (!phone || !password || !name || !userType) {
        return ctx.badRequest('Phone, password, name, and userType are required');
      }

      // Validate userType
      if (userType !== 'shopper' && userType !== 'rider') {
        return ctx.badRequest('userType must be "shopper" or "rider"');
      }

      // Validate phone format
      if (!phone.startsWith('+256') || phone.length !== 13) {
        return ctx.badRequest('Invalid phone format. Use +256XXXXXXXXX (9 digits after prefix)');
      }

      // Validate password strength
      if (password.length < 6) {
        return ctx.badRequest('Password must be at least 6 characters');
      }

      // Validate email format if provided
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email && !emailRegex.test(email)) {
        return ctx.badRequest('Invalid email format. Please provide a valid email address');
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

      // Import the role helper
      const { createAuthUserWithRole } = await import('../../../services/role-helper');

      // Create auth user
      const newAuthUser = await createAuthUserWithRole(strapi, {
        username: phone,
        email: email || `${phone.replace('+', '')}@lipacart.local`,
        password,
        userType,
        confirmed: true,
      });

      if (!newAuthUser) {
        ctx.throw(500, 'Failed to create auth user');
      }

      // Create custom user profile
      const customUser: any = await strapi.entityService.create('api::user.user', {
        data: {
          phone,
          name: name || null,
          email: email || null,
          user_type: userType,
          is_active: true,
        },
      });

      // Create role-specific profile record
      try {
        if (userType === 'shopper') {
          await strapi.entityService.create('api::shopper.shopper', {
            data: {
              user: customUser.documentId,
              kyc_status: 'not_submitted',
            },
          });
        } else if (userType === 'rider') {
          await strapi.entityService.create('api::rider.rider', {
            data: {
              user: customUser.documentId,
              is_verified: false,
              is_online: false,
            },
          });
        }
      } catch (profileError) {
        console.error(`Error creating ${userType} profile:`, profileError);
        // Delete the created user if profile creation fails
        await strapi.entityService.delete('api::user.user', customUser.id);
        ctx.throw(400, `Failed to create ${userType} profile: ${profileError.message}`);
      }

      ctx.body = {
        success: true,
        user: {
          id: customUser.documentId,
          phone: customUser.phone,
          name: customUser.name,
          user_type: customUser.user_type,
        },
        message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} account created successfully`,
      };
    } catch (error) {
      console.error('Error creating staff account:', error);
      const errorMsg = error.message || 'Failed to create staff account';
      ctx.throw(400, errorMsg);
    }
  },

  // Update user profile (riders, shoppers, customers)
  updateUser: async (ctx: any) => {
    try {
      // Manual JWT verification since we disabled Strapi's auth middleware
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return ctx.unauthorized('No authorization token provided');
      }

      const token = authHeader.slice(7);
      let user: any;
      try {
        user = await strapi.plugins['users-permissions'].services.jwt.verify(token);
      } catch (error) {
        return ctx.unauthorized('Invalid or expired token');
      }

      // Get admin user from Strapi's users-permissions
      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { id: user.id },
          populate: { role: true },
        });

      if (authUser?.role?.type !== 'admin') {
        return ctx.forbidden('Admin access required');
      }

      const { userId } = ctx.params;
      const { name, phone, email, vehicle_type, vehicle_plate, license_number, business_name } = ctx.request.body;

      // Find the user by documentId (UUID string from route param)
      const userToUpdate = await strapi.query('api::user.user').findOne({
        where: { documentId: userId },
      });

      if (!userToUpdate) {
        return ctx.notFound('User not found');
      }

      // Build update data - only include fields that are provided
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;

      // Update the user using the internal id
      const updatedUser = await strapi.entityService.update('api::user.user', userToUpdate.id, {
        data: updateData,
      });

      // Update role-specific profile if needed
      if (userToUpdate.user_type === 'rider') {
        const rider = await strapi.query('api::rider.rider').findOne({
          where: { user: userToUpdate.id },
        });

        if (rider) {
          const riderUpdateData: any = {};
          if (vehicle_type !== undefined) riderUpdateData.vehicle_type = vehicle_type;
          if (vehicle_plate !== undefined) riderUpdateData.vehicle_plate = vehicle_plate;
          if (license_number !== undefined) riderUpdateData.license_number = license_number;

          if (Object.keys(riderUpdateData).length > 0) {
            await strapi.entityService.update('api::rider.rider', rider.id, {
              data: riderUpdateData,
            });
          }
        }
      }

      if (userToUpdate.user_type === 'shopper') {
        const shopper = await strapi.query('api::shopper.shopper').findOne({
          where: { user: userToUpdate.id },
        });

        if (shopper) {
          const shopperUpdateData: any = {};
          if (business_name !== undefined) shopperUpdateData.business_name = business_name;

          if (Object.keys(shopperUpdateData).length > 0) {
            await strapi.entityService.update('api::shopper.shopper', shopper.id, {
              data: shopperUpdateData,
            });
          }
        }
      }

      ctx.body = {
        success: true,
        message: 'User profile updated successfully',
        user: {
          id: updatedUser.documentId,
          name: updatedUser.name,
          phone: updatedUser.phone,
          email: updatedUser.email,
        },
      };
    } catch (error) {
      console.error('Error updating user:', error);
      if (error.status) {
        ctx.throw(error.status, error.message);
      } else {
        ctx.throw(400, error.message || 'Failed to update user');
      }
    }
  },
} as any;
