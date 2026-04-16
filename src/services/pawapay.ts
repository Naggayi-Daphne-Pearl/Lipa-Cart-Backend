type PawaPayStatus =
  | 'ACCEPTED'
  | 'SUBMITTED'
  | 'ENQUEUED'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'DUPLICATE_IGNORED';

interface CreateDepositArgs {
  depositId: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  correspondent: string;
  country: string;
  statementDescription?: string;
  callbackUrl?: string;
}

interface PawaPayConfig {
  baseUrl: string;
  apiKey: string;
  defaultCurrency: string;
  defaultCountry: string;
  defaultCorrespondent: string;
  callbackUrl?: string;
}

function normalizeMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('256')) return digits;
  if (digits.startsWith('0')) return `256${digits.slice(1)}`;
  return digits;
}

function getConfig(): PawaPayConfig {
  return {
    baseUrl: (process.env.PAWAPAY_BASE_URL || 'https://api.sandbox.pawapay.io').replace(/\/$/, ''),
    apiKey: process.env.PAWAPAY_API_KEY || '',
    defaultCurrency: process.env.PAWAPAY_CURRENCY || 'UGX',
    defaultCountry: process.env.PAWAPAY_COUNTRY || 'UGA',
    defaultCorrespondent: process.env.PAWAPAY_CORRESPONDENT_UG || 'MTN_MOMO_UGA',
    callbackUrl: process.env.PAWAPAY_CALLBACK_URL,
  };
}

export function isPawaPayConfigured(): boolean {
  const cfg = getConfig();
  return cfg.apiKey.trim().length > 0;
}

function authHeaders(cfg: PawaPayConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function createPawaPayDeposit(args: CreateDepositArgs): Promise<any> {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    throw new Error('PAWAPAY_API_KEY is not configured');
  }

  const payload = {
    depositId: args.depositId,
    amount: String(Math.round(args.amount)),
    currency: args.currency || cfg.defaultCurrency,
    country: args.country || cfg.defaultCountry,
    correspondent: args.correspondent || cfg.defaultCorrespondent,
    payer: {
      type: 'MSISDN',
      address: {
        value: normalizeMsisdn(args.phoneNumber),
      },
    },
    customerTimestamp: new Date().toISOString(),
    statementDescription: args.statementDescription || 'LipaCart Order Payment',
    ...(args.callbackUrl || cfg.callbackUrl
      ? { callbackUrl: args.callbackUrl || cfg.callbackUrl }
      : {}),
  };

  const response = await fetch(`${cfg.baseUrl}/deposits`, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let body: any = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = { raw: bodyText };
  }

  if (!response.ok) {
    const errorMessage =
      body?.message || body?.error || `PawaPay deposit request failed (${response.status})`;
    throw new Error(String(errorMessage));
  }

  return body;
}

export async function getPawaPayDepositStatus(depositId: string): Promise<any> {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    throw new Error('PAWAPAY_API_KEY is not configured');
  }

  const response = await fetch(`${cfg.baseUrl}/deposits/${depositId}`, {
    method: 'GET',
    headers: authHeaders(cfg),
  });

  const bodyText = await response.text();
  let body: any = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = { raw: bodyText };
  }

  if (!response.ok) {
    const errorMessage =
      body?.message || body?.error || `PawaPay status request failed (${response.status})`;
    throw new Error(String(errorMessage));
  }

  return body;
}

export function mapPawaPayStatusToPaymentStatus(
  status: string | null | undefined,
): 'pending' | 'processing' | 'completed' | 'failed' {
  const normalized = String(status || '').toUpperCase() as PawaPayStatus;
  if (normalized === 'COMPLETED') return 'completed';
  if (normalized === 'FAILED' || normalized === 'REJECTED') return 'failed';
  return 'processing';
}
