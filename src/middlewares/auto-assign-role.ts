import type { Core } from '@strapi/strapi';

/**
 * Middleware to automatically assign role to user based on user_type
 * This ensures that when a user is created or updated with a user_type,
 * they automatically get the corresponding role in Strapi's RBAC system
 * 
 * Note: This middleware is kept for future extension but role assignment
 * is handled in the user controller for better control flow.
 */
export default (config: any, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<any>) => {
    await next();
    
    // Middleware placeholder for future role-related logic
    // Role assignment is handled in user controller
  };
};
