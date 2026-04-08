const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '461833863082-gkset420arg3nqcip15jm9ptclom7g9e.apps.googleusercontent.com';

export type GoogleIdentity = {
  aud?: string;
  email?: string;
  email_verified?: boolean | string;
  iss?: string;
  name?: string;
  picture?: string;
  sub?: string;
};

const isTruthy = (value: unknown): boolean => {
  return value === true || value === 'true';
};

const allowedAudiences = (): string[] => {
  return Array.from(
    new Set(
      [
        process.env.GOOGLE_WEB_CLIENT_ID,
        process.env.GOOGLE_CLIENT_ID,
        DEFAULT_GOOGLE_WEB_CLIENT_ID,
      ].filter((value): value is string => Boolean(value && value.trim())),
    ),
  );
};

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<GoogleIdentity> {
  if (!idToken || !idToken.trim()) {
    throw new Error('Google ID token is required');
  }

  const tokenInfoUrl = new URL('https://oauth2.googleapis.com/tokeninfo');
  tokenInfoUrl.searchParams.set('id_token', idToken);

  const response = await fetch(tokenInfoUrl.toString());
  if (!response.ok) {
    throw new Error('Invalid or expired Google sign-in token');
  }

  const payload = (await response.json()) as GoogleIdentity;
  const issuer = payload.iss?.trim();
  if (
    issuer &&
    issuer !== 'accounts.google.com' &&
    issuer !== 'https://accounts.google.com'
  ) {
    throw new Error('Unsupported Google token issuer');
  }

  if (!isTruthy(payload.email_verified)) {
    throw new Error('Google account email is not verified');
  }

  const email = payload.email?.trim().toLowerCase();
  if (!email) {
    throw new Error('Google account did not provide an email address');
  }

  const audiences = allowedAudiences();
  if (
    audiences.length > 0 &&
    payload.aud &&
    !audiences.includes(payload.aud)
  ) {
    throw new Error('Google token audience mismatch');
  }

  return {
    ...payload,
    email,
  };
}
