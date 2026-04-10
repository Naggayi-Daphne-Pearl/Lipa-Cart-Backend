/**
 * Shared JWT verification helper for custom controller routes.
 *
 * Strapi's built-in auth middleware doesn't run on custom routes that use
 * `auth: false`, so controllers manually verify Bearer tokens. This helper
 * extracts that repeated logic into one place.
 */

interface AuthResult {
  success: true;
  strapiUser: any;
  customUser: any;
}

interface AuthError {
  success: false;
  status: 'unauthorized' | 'notFound';
  message: string;
}

/**
 * Verifies the JWT from the Authorization header and resolves both the
 * Strapi auth user and the custom api::user.user record.
 *
 * Returns { success: true, strapiUser, customUser } on success,
 * or { success: false, status, message } on failure.
 */
export async function verifyRequestAuth(ctx: any, strapi: any): Promise<AuthResult | AuthError> {
  const authHeader = ctx.request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { success: false, status: 'unauthorized', message: 'Authentication required' };
  }

  const token = authHeader.slice(7);
  let jwtUser: any;
  try {
    jwtUser = await strapi.plugins['users-permissions'].services.jwt.verify(token);
  } catch {
    return { success: false, status: 'unauthorized', message: 'Invalid token' };
  }

  const strapiUser: any = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: jwtUser.id },
  });
  if (!strapiUser) {
    return { success: false, status: 'unauthorized', message: 'User not found' };
  }

  const customUser: any = await strapi.db.query('api::user.user').findOne({
    where: { phone: strapiUser.username },
  });

  return { success: true, strapiUser, customUser };
}

/**
 * Convenience: call verifyRequestAuth and send the error response if auth
 * fails. Returns the auth result or null (after sending the error).
 */
export async function requireAuth(
  ctx: any,
  strapi: any,
): Promise<{ strapiUser: any; customUser: any } | null> {
  const result = await verifyRequestAuth(ctx, strapi);
  if (result.success === false) {
    if (result.status === 'unauthorized') {
      ctx.unauthorized(result.message);
    } else {
      ctx.notFound(result.message);
    }
    return null;
  }
  return { strapiUser: result.strapiUser, customUser: result.customUser };
}
