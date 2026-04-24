import crypto from 'crypto';
import type { Core } from '@strapi/strapi';

const ACCESS_TOKEN_EXPIRES_IN = '1h';
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;
const STANDARD_REFRESH_DAYS = 14;
const REMEMBER_ME_REFRESH_DAYS = 30;
const REFRESH_COOKIE_NAME = 'refresh_token';
const AUTH_DIAGNOSTICS_ENABLED = process.env.AUTH_DIAGNOSTICS === 'true';

type SessionScope = 'customer' | 'shopper' | 'rider' | 'admin';

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
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',').some((value) => value.trim().toLowerCase() === 'https');
  }

  return Boolean(ctx.request?.secure || ctx.secure || ctx.protocol === 'https');
};

const getRequestOriginUrl = (ctx: any): URL | null => {
  const candidates = [ctx.request.headers.origin, ctx.request.headers.referer];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    try {
      return new URL(candidate);
    } catch {
      continue;
    }
  }

  return null;
};

const getSessionScope = (ctx: any): SessionScope | null => {
  const originUrl = getRequestOriginUrl(ctx);
  const host = originUrl?.hostname.toLowerCase();

  if (!host) {
    return null;
  }

  if (host === 'lipacart.com' || host === 'www.lipacart.com') {
    return 'customer';
  }

  if (host.startsWith('shopper.')) return 'shopper';
  if (host.startsWith('rider.')) return 'rider';
  if (host.startsWith('admin.')) return 'admin';

  return null;
};

const getRefreshCookieName = (ctx: any): string => {
  const scope = getSessionScope(ctx);
  return scope ? `${REFRESH_COOKIE_NAME}_${scope}` : REFRESH_COOKIE_NAME;
};

const getRefreshCookieCandidates = (ctx: any): string[] => {
  const scopedName = getRefreshCookieName(ctx);
  return scopedName === REFRESH_COOKIE_NAME
    ? [REFRESH_COOKIE_NAME]
    : [scopedName, REFRESH_COOKIE_NAME];
};

type SessionDiagnostics = {
  host: string | null;
  origin: string | null;
  scope: SessionScope | null;
  secure: boolean;
  cookieCandidates: string[];
  cookiePresence: Record<string, boolean>;
  hasRefreshTokenInBody: boolean;
  hasAuthorizationHeader: boolean;
};

export const getSessionDiagnostics = (ctx: any): SessionDiagnostics => {
  const originUrl = getRequestOriginUrl(ctx);
  const cookieCandidates = getRefreshCookieCandidates(ctx);
  const cookiePresence = Object.fromEntries(
    cookieCandidates.map((cookieName) => [cookieName, Boolean(ctx.cookies.get(cookieName))]),
  );

  return {
    host: originUrl?.hostname?.toLowerCase() ?? null,
    origin: originUrl?.origin ?? null,
    scope: getSessionScope(ctx),
    secure: isSecureRequest(ctx),
    cookieCandidates,
    cookiePresence,
    hasRefreshTokenInBody: Boolean(ctx.request.body?.refreshToken),
    hasAuthorizationHeader:
      typeof ctx.request.headers.authorization === 'string' &&
      ctx.request.headers.authorization.startsWith('Bearer '),
  };
};

export const logAuthDiagnostics = (
  phase: string,
  ctx: any,
  extra: Record<string, unknown> = {},
) => {
  if (!AUTH_DIAGNOSTICS_ENABLED) return;

  const diagnostics = getSessionDiagnostics(ctx);
  console.info('[auth:diag]', {
    phase,
    ...diagnostics,
    ...extra,
  });
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

const getEntityId = async (strapi: Core.Strapi, entry: any): Promise<number> => {
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

const setRefreshCookie = (ctx: any, refreshToken: string, expiresAt: Date) => {
  const secure = isSecureRequest(ctx);
  const cookieName = getRefreshCookieName(ctx);

  // When behind a TLS-terminating proxy (Railway, Render, etc.) the raw
  // Node request is plain HTTP.  The `cookies` library checks the raw
  // connection independently and throws "Cannot send secure cookie over
  // unencrypted connection".  Setting `cookies.secure = true` overrides
  // the library's own protocol check so it trusts our decision.
  if (secure && ctx.cookies) {
    ctx.cookies.secure = true;
  }

  ctx.cookies.set(cookieName, refreshToken, {
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
  const cookieNames = Array.from(new Set(getRefreshCookieCandidates(ctx)));

  if (secure && ctx.cookies) {
    ctx.cookies.secure = true;
  }

  for (const cookieName of cookieNames) {
    ctx.cookies.set(cookieName, '', {
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
      overwrite: true,
      expires: new Date(0),
      path: '/',
    });
  }
};

const findCustomUserByRefreshToken = async (strapi: Core.Strapi, refreshToken: string) => {
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
  logAuthDiagnostics('resolveSessionUser:start', ctx);

  const refreshTokenFromBody = ctx.request.body?.refreshToken;
  const refreshTokenFromCookie = getRefreshCookieCandidates(ctx).find((cookieName) => {
    const value = ctx.cookies.get(cookieName);
    return typeof value === 'string' && value.length > 0;
  });
  const refreshTokenCookieValue = refreshTokenFromCookie
    ? ctx.cookies.get(refreshTokenFromCookie)
    : null;
  const refreshToken = refreshTokenFromBody || refreshTokenCookieValue;

  if (refreshToken) {
    const customUser = await findCustomUserByRefreshToken(strapi, refreshToken);
    if (customUser) {
      const authUser = await findAuthUserByPhone(strapi, customUser.phone);
      if (authUser) {
        logAuthDiagnostics('resolveSessionUser:refresh-token-success', ctx, {
          refreshTokenSource: refreshTokenFromBody ? 'body' : 'cookie',
          refreshCookieNameUsed: refreshTokenFromCookie,
          resolvedUserId: customUser.id,
          resolvedUserType: customUser.user_type,
        });
        return {
          authUser,
          customUser,
          rememberMe: parseRememberMe(ctx.request.body?.rememberMe, customUser.remember_me ?? true),
        };
      }
    }

    logAuthDiagnostics('resolveSessionUser:refresh-token-miss', ctx, {
      refreshTokenSource: refreshTokenFromBody ? 'body' : 'cookie',
      refreshCookieNameUsed: refreshTokenFromCookie,
    });
  }

  const authHeader = ctx.request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logAuthDiagnostics('resolveSessionUser:no-credentials', ctx);
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
      logAuthDiagnostics('resolveSessionUser:access-token-no-custom-user', ctx, {
        authUserId: authUser.id,
      });
      return null;
    }

    logAuthDiagnostics('resolveSessionUser:access-token-success', ctx, {
      authUserId: authUser.id,
      resolvedUserId: customUser.id,
      resolvedUserType: customUser.user_type,
    });

    return {
      authUser,
      customUser,
      rememberMe: parseRememberMe(ctx.request.body?.rememberMe, customUser.remember_me ?? true),
    };
  } catch (error) {
    logAuthDiagnostics('resolveSessionUser:access-token-failed', ctx);
    return null;
  }
};

export const revokeSession = async (strapi: Core.Strapi, ctx: any) => {
  logAuthDiagnostics('revokeSession:start', ctx);
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

    logAuthDiagnostics('revokeSession:revoked-user-session', ctx, {
      revokedUserId: sessionUser.customUser.id,
      revokedUserType: sessionUser.customUser.user_type,
    });
  } else {
    logAuthDiagnostics('revokeSession:no-session-user', ctx);
  }

  clearRefreshCookie(ctx);
  logAuthDiagnostics('revokeSession:cookies-cleared', ctx);
};
