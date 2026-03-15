/**
 * Middleware to allow authenticated users to access the bulk order items endpoint
 * Bypasses Strapi's permission system for this specific route
 */

export default (config: any, { strapi }: any) => {
  return async (ctx: any, next: any) => {
    // Check if this is the bulk create endpoint
    if (ctx.request.path === '/api/order-items/bulk' && ctx.request.method === 'POST') {
      // Strapi's permission system will have already authenticated the user via Bearer token
      // We just need to skip the permission check by setting a flag
      // or by manually verifying the token

      try {
        // The user should already be in ctx.state.user if they have a valid Bearer token
        // If not, the request will be rejected below
        if (ctx.state.user) {
          // Allow the request to proceed to the controller
          return await next();
        } else {
          // Try to authenticate using Bearer token if present
          const authHeader = ctx.request.header.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
              // Verify token using Strapi's auth service
              const user = await strapi.plugin('users-permissions').service('jwt').verify(token);
              ctx.state.user = user;
              return await next();
            } catch (err) {
              return ctx.unauthorized('Invalid authentication token');
            }
          }
          return ctx.unauthorized('Authentication required');
        }
      } catch (error) {
        console.error('ERROR: Bulk endpoint middleware error:', error);
        return ctx.internalServerError('Internal server error');
      }
    }

    // For other endpoints, proceed normally
    return await next();
  };
};
