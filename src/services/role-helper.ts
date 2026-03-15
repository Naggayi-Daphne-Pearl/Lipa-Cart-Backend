import type { Core } from '@strapi/strapi';

/**
 * Helper Service for Role Management
 * 
 * Use these functions when you need to assign roles to Strapi auth users
 * (plugin::users-permissions.user), typically when syncing with Supabase auth.
 */

/**
 * Assign role to a Strapi auth user based on user_type
 * 
 * @param strapi - Strapi instance
 * @param strapiAuthUserId - ID of the Strapi auth user (plugin::users-permissions.user)
 * @param userType - Type of user: customer, shopper, rider, admin
 * @returns Updated user or null if failed
 */
export async function assignRoleToAuthUser(
  strapi: Core.Strapi,
  strapiAuthUserId: number,
  userType: 'customer' | 'shopper' | 'rider' | 'admin'
) {
  try {
    const role = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: userType } });

    if (!role) {
      console.error(`Role not found for type: ${userType}`);
      return null;
    }

    const updatedUser = await strapi
      .query('plugin::users-permissions.user')
      .update({
        where: { id: strapiAuthUserId },
        data: { role: role.id },
      });

    return updatedUser;
  } catch (error) {
    console.error(`Error assigning ${userType} role to auth user ${strapiAuthUserId}:`, error);
    return null;
  }
}

/**
 * Create a Strapi auth user with the correct role
 * Use this when syncing users from Supabase or other auth providers
 * 
 * @param strapi - Strapi instance
 * @param userData - User data including username, email, and userType
 * @returns Created user or null if failed
 */
export async function createAuthUserWithRole(
  strapi: Core.Strapi,
  userData: {
    username: string;
    email: string;
    password?: string;
    userType: 'customer' | 'shopper' | 'rider' | 'admin';
    confirmed?: boolean;
  }
) {
  try {
    const role = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: userData.userType } });

    if (!role) {
      console.error(`Role not found for type: ${userData.userType}`);
      return null;
    }

    const user = await strapi.plugins['users-permissions'].services.user.add({
      username: userData.username,
      email: userData.email,
      password: userData.password || Math.random().toString(36).slice(-8), // Random password if not provided
      role: role.id,
      confirmed: userData.confirmed !== undefined ? userData.confirmed : true,
      blocked: false,
    });

    return user;
  } catch (error) {
    console.error(`Error creating auth user with ${userData.userType} role:`, error);
    return null;
  }
}

/**
 * Get role ID by user type
 * 
 * @param strapi - Strapi instance
 * @param userType - Type of user
 * @returns Role ID or null if not found
 */
export async function getRoleIdByType(
  strapi: Core.Strapi,
  userType: 'customer' | 'shopper' | 'rider' | 'admin'
): Promise<number | null> {
  try {
    const role = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: userType } });

    return role ? role.id : null;
  } catch (error) {
    console.error(`Error fetching role for type ${userType}:`, error);
    return null;
  }
}

/**
 * Example usage in a custom controller:
 * 
 * ```typescript
 * import { assignRoleToAuthUser, createAuthUserWithRole } from '../../../services/role-helper';
 * 
 * // In your controller
 * async syncFromSupabase(ctx) {
 *   const { supabaseUserId, phone, userType } = ctx.request.body;
 *   
 *   // Create Strapi auth user
 *   const authUser = await createAuthUserWithRole(strapi, {
 *     username: supabaseUserId,
 *     email: `${supabaseUserId}@generated.local`,
 *     userType: userType,
 *   });
 *   
 *   // Create custom user profile
 *   const userProfile = await strapi.entityService.create('api::user.user', {
 *     data: {
 *       phone: phone,
 *       user_type: userType,
 *     },
 *   });
 *   
 *   return { authUser, userProfile };
 * }
 * ```
 */
