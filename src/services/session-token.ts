import crypto from 'crypto';
import type { Core } from '@strapi/strapi';

const ACCESS_TOKEN_EXPIRES_IN = '1h';
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;
const STANDARD_REFRESH_DAYS = 14;
const REMEMBER_ME_REFRESH_DAYS = 30;
const REFRESH_COOKIE_NAME = 'refresh_token';

const parseRememberMe = (value: unknown, fallback = true): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() == 'true') return true;
    if (value.toLowerCase() == 'false') return false;
  }
  return fallback;
};

const isSecureRequest = (ctx: any): boolean => {
  const forwardedProto = ctx.request.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.includes('https')) {
    return true;
  }

  return ctx.secure || ctx.protocol === 'https' || process.env.NODE_ENV === 'production';
};

const hashRefreshToken = (value: string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

const generateRefreshToken = (): string => {
  return crypto.randomBytes(48).toString('hex');
};

const getRefreshLifetimeDays = (rememberMe: boolean): number => {
  return rememberMe ? REMEMBER_ME_REFRESH_DAYS : STANDARD_REFRESH_DAYS;
};

const getEntityId = async (
  strapi: Core.Strapi,
  entry: any,
): Promise<number> => {
  if (typeof entry?.id === 'number') {
    return entry.id;
  }

  if (typeof entry?.id === 'string' && /^\d+$/.test(entry.id)) {
    return Number(entry.id);
  }

  if (entry?.documentId) {
    const existingUser: any = await strapi.query('api::user.user').findOne({
      where: { documentId: entry.documentId },
      select: ['id'],
    } as any);

    if (typeof existingUser?.id === 'number') {
      return existingUser.id;
    }
  }

  throw new Error('Unable to resolve numeric user id for session persistence');
};

const setRefreshCookie = (
  ctx: any,
  refreshToken: string,
  expiresAt: Date,
) => {
  const secure = isSecureRequest(ctx);

  ctx.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    overwrite: true,
    expires: expiresAt,
    path: '/',
  });
};

export const clearRefreshCookie = (ctx: any) => {
  const secure = isSecureRequest(ctx);

  ctx.cookies.set(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    overwrite: true,
    expires: new Date(0),
    path: '/',
  });
};

const findCustomUserByRefreshToken = async (
  strapi: Core.Strapi,
  refreshToken: string,
) => {
  const matches = (await strapi.entityService.findMany('api::user.user', {
    filters: {
      refresh_token_hash: hashRefreshToken(refreshToken),
    } as any,
    populate: { profile_photo: true, customer: true },
    limit: 1,
  })) as any[];

  const customUser = matches?.[0];
  if (!customUser) return null;

  if (customUser.session_revoked_at) {
    return null;
  }

  const expiresAt = customUser.refresh_token_expires_at
    ? new Date(customUser.refresh_token_expires_at)
    : null;

  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    return null;
  }

  return customUser;
};

const findCustomUserByPhone = async (strapi: Core.Strapi, phone: string) => {
  return (await strapi.query('api::user.user').findOne({
    where: { phone },
    populate: { profile_photo: true, customer: true },
  })) as any;
};

const findAuthUserByPhone = async (strapi: Core.Strapi, phone: string) => {
  return await strapi.query('plugin::users-permissions.user').findOne({
    where: { username: phone },
    populate: { role: true },
  });
};

export const issueSessionTokens = async (
  strapi: Core.Strapi,
  ctx: any,
  authUser: any,
  customUser: any,
  rememberMe = true,
) => {
  const jwt = strapi.plugins['users-permissions'].services.jwt.issue(
    { id: authUser.id },
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  );

  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = new Date();
  refreshTokenExpiresAt.setDate(
    refreshTokenExpiresAt.getDate() + getRefreshLifetimeDays(rememberMe),
  );

  const customUserId = await getEntityId(strapi, customUser);

  await strapi.entityService.update('api::user.user', customUserId, {
    data: {
      refresh_token_hash: hashRefreshToken(refreshToken),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      session_revoked_at: null,
      remember_me: rememberMe,
    } as any,
  });

  setRefreshCookie(ctx, refreshToken, refreshTokenExpiresAt);

  return {
    jwt,
    refreshToken,
    refreshTokenExpiresAt,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    rememberMe,
  };
};

export const resolveSessionUser = async (strapi: Core.Strapi, ctx: any) => {
  const refreshToken =
    ctx.request.body?.refreshToken || ctx.cookies.get(REFRESH_COOKIE_NAME);

  if (refreshToken) {
    const customUser = await findCustomUserByRefreshToken(strapi, refreshToken);
    if (customUser) {
      const authUser = await findAuthUserByPhone(strapi, customUser.phone);
      if (authUser) {
        return {
          authUser,
          customUser,
          rememberMe: parseRememberMe(
            ctx.request.body?.rememberMe,
            customUser.remember_me ?? true,
          ),
        };
      }
    }
  }

  const authHeader = ctx.request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authHeader.slice(7);
  try {
    const payload = await strapi.plugins['users-permissions'].services.jwt.verify(accessToken);
    const authUser = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: payload.id },
      populate: { role: true },
    });

    if (!authUser) {
      return null;
    }

    const customUser = await findCustomUserByPhone(strapi, authUser.username);
    if (!customUser) {
      return null;
    }

    return {
      authUser,
      customUser,
      rememberMe: parseRememberMe(
        ctx.request.body?.rememberMe,
        customUser.remember_me ?? true,
      ),
    };
  } catch (error) {
    return null;
  }
};

export const revokeSession = async (strapi: Core.Strapi, ctx: any) => {
  const sessionUser = await resolveSessionUser(strapi, ctx);

  if (sessionUser?.customUser) {
    const customUserId = await getEntityId(strapi, sessionUser.customUser);

    await strapi.entityService.update('api::user.user', customUserId, {
      data: {
        refresh_token_hash: null,
        refresh_token_expires_at: null,
        session_revoked_at: new Date().toISOString(),
        remember_me: false,
      } as any,
    });
  }

  clearRefreshCookie(ctx);
};
