import type { Core } from '@strapi/strapi';

export default {
  /**
   * Get all users with their roles and profiles
   * Admin only endpoint
   */
  async findAll(ctx: any) {
    try {
      // Check if user is admin
      const user = ctx.state.user;
      const authUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { id: user.id },
          populate: { role: true },
        });

      if (authUser?.role?.type !== 'admin') {
        return ctx.forbidden('Admin access required');
      }

      // Fetch all custom users
      const users = await strapi.entityService.findMany('api::user.user', {
        populate: { profile_photo: true },
        limit: 1000, // TODO: Add pagination
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

      // Check if requesting user is admin
      const requestingUser = ctx.state.user;
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

      // Check if requesting user is admin
      const requestingUser = ctx.state.user;
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
} as any;
