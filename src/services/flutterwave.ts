/**
 * Flutterwave v4 API integration.
 *
 * Flow for Mobile Money (Uganda):
 *   1. POST /oauth/token            -> access_token (cached in-memory by exp)
 *   2. POST /customers              -> customer_id
 *   3. POST /payment-methods        -> payment_method_id (mobile_money)
 *   4. POST /charges                -> charge.id, status, next_action
 *   5. Webhook charge.completed     -> we verify and update order
 *
 * Mobile money charges have no hosted page - the customer receives a push
 * notification on their phone and approves the PIN there. Status becomes
 * authoritative via the webhook.
 */

import { createHmac, timingSafeEqual } from 'crypto';

interface FlutterwaveConfig {
  baseUrl: string;
  oauthUrl: string;
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
  webhookSecret: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function getConfig(): FlutterwaveConfig {
  return {
    baseUrl: (
      process.env.FLUTTERWAVE_BASE_URL || 'https://developersandbox-api.flutterwave.com'
    ).replace(/\/$/, ''),
    oauthUrl:
      process.env.FLUTTERWAVE_OAUTH_URL ||
      'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token',
    clientId: process.env.FLUTTERWAVE_CLIENT_ID || '',
    clientSecret: process.env.FLUTTERWAVE_CLIENT_SECRET || '',
    encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
    webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET || '',
  };
}

export function isFlutterwaveConfigured(): boolean {
  const cfg = getConfig();
  return cfg.clientId.trim().length > 0 && cfg.clientSecret.trim().length > 0;
}

async function getAccessToken(): Promise<string> {
  const cfg = getConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Flutterwave credentials are not configured');
  }

  // Refresh 60s before expiry to avoid edge-case 401s on long-running requests.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const response = await fetch(cfg.oauthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(
      `Flutterwave OAuth failed (${response.status}): ${data?.error_description || 'no token'}`,
    );
  }

  const expiresInMs = Number(data.expires_in ?? 3600) * 1000;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs,
  };
  return cachedToken.token;
}

async function authedFetch(
  path: string,
  init: { method: 'GET' | 'POST' | 'PUT'; body?: any },
): Promise<any> {
  const cfg = getConfig();
  const token = await getAccessToken();

  const response = await fetch(`${cfg.baseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const message =
      body?.error?.message ||
      body?.message ||
      `Flutterwave ${init.method} ${path} failed (${response.status})`;
    throw new Error(String(message));
  }

  return body;
}

interface CreateCustomerArgs {
  firstName: string;
  lastName?: string;
  email?: string;
  phoneCountryCode: string;
  phoneNumber: string;
  city?: string;
  country?: string;
}

export async function createCustomer(args: CreateCustomerArgs): Promise<string> {
  const result = await authedFetch('/customers', {
    method: 'POST',
    body: {
      name: { first: args.firstName, last: args.lastName || args.firstName },
      email: args.email,
      phone: { country_code: args.phoneCountryCode, number: args.phoneNumber },
      address: {
        city: args.city || 'Kampala',
        country: args.country || 'UG',
        line1: 'N/A',
        postal_code: '00256',
        state: args.city || 'Kampala',
      },
    },
  });
  const customerId = result?.data?.id || result?.id;
  if (!customerId) throw new Error('Flutterwave customer create returned no id');
  return String(customerId);
}

interface CreateMobileMoneyMethodArgs {
  countryCode: string;
  network: 'MTN' | 'Airtel';
  phoneNumber: string;
}

export async function createMobileMoneyMethod(args: CreateMobileMoneyMethodArgs): Promise<string> {
  const result = await authedFetch('/payment-methods', {
    method: 'POST',
    body: {
      type: 'mobile_money',
      mobile_money: {
        country_code: args.countryCode,
        network: args.network,
        phone_number: args.phoneNumber,
      },
    },
  });
  const methodId = result?.data?.id || result?.id;
  if (!methodId) throw new Error('Flutterwave payment-method create returned no id');
  return String(methodId);
}

interface InitiateChargeArgs {
  reference: string;
  amount: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
  redirectUrl?: string;
  meta?: Record<string, any>;
}

export async function initiateCharge(args: InitiateChargeArgs): Promise<any> {
  return authedFetch('/charges', {
    method: 'POST',
    body: {
      reference: args.reference,
      currency: args.currency,
      customer_id: args.customerId,
      payment_method_id: args.paymentMethodId,
      amount: args.amount,
      redirect_url: args.redirectUrl,
      meta: args.meta,
    },
  });
}

export async function getChargeStatus(chargeId: string): Promise<any> {
  return authedFetch(`/charges/${chargeId}`, { method: 'GET' });
}

/**
 * Verify the webhook is from Flutterwave.
 *
 * Flutterwave's webhook security uses a static secret token configured in the
 * dashboard. They send it back in the `verif-hash` header (v3 convention,
 * still used by v4 sandbox). We compare in constant time.
 *
 * If the dashboard supports HMAC signing in the future, FLUTTERWAVE_HMAC_HEADER
 * + encryption_key can be added without breaking this check.
 */
export function verifyWebhookSignature(headers: Record<string, any>): boolean {
  const cfg = getConfig();
  if (!cfg.webhookSecret) return false;

  const provided =
    headers['verif-hash'] ||
    headers['Verif-Hash'] ||
    headers['x-flutterwave-signature'] ||
    headers['X-Flutterwave-Signature'];
  if (!provided) return false;

  const a = Buffer.from(String(provided));
  const b = Buffer.from(cfg.webhookSecret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * HMAC helper available for future use if Flutterwave moves to signed bodies.
 * Keys signed with the encryption key (base64-decoded) over the raw request body.
 */
export function computeHmacSignature(rawBody: string): string {
  const cfg = getConfig();
  const key = Buffer.from(cfg.encryptionKey, 'base64');
  return createHmac('sha256', key).update(rawBody).digest('hex');
}

export function mapFlutterwaveStatusToPaymentStatus(
  status: string | null | undefined,
): 'pending' | 'processing' | 'completed' | 'failed' {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'succeeded' || normalized === 'completed' || normalized === 'success') {
    return 'completed';
  }
  if (normalized === 'failed' || normalized === 'cancelled' || normalized === 'expired') {
    return 'failed';
  }
  return 'processing';
}

/**
 * Best-effort detection of Uganda mobile money network from the local prefix.
 * Falls back to MTN for unknown prefixes - safer for the dominant network.
 */
export function detectUgandaNetwork(phone: string): 'MTN' | 'Airtel' {
  const digits = String(phone || '').replace(/\D/g, '');
  // Normalize to local 9-digit form (drop 256 if present).
  const local = digits.startsWith('256') ? digits.slice(3) : digits.replace(/^0/, '');
  const prefix3 = local.slice(0, 3);
  const airtelPrefixes = [
    '700',
    '701',
    '702',
    '703',
    '704',
    '705',
    '706',
    '707',
    '708',
    '709',
    '740',
    '741',
    '742',
    '743',
    '744',
    '745',
    '746',
    '747',
    '748',
    '749',
    '750',
    '751',
    '752',
    '753',
    '754',
    '755',
    '756',
    '757',
    '758',
    '759',
  ];
  if (airtelPrefixes.includes(prefix3)) return 'Airtel';
  return 'MTN';
}
