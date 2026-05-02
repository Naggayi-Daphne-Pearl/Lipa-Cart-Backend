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

interface PawaPayReason {
  code: string | null;
  message: string | null;
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

function extractPrimaryRecord(payload: any): Record<string, any> | null {
  if (!payload) return null;
  if (
    Array.isArray(payload) &&
    payload.length > 0 &&
    payload[0] &&
    typeof payload[0] === 'object'
  ) {
    return payload[0] as Record<string, any>;
  }
  if (typeof payload === 'object') {
    return payload as Record<string, any>;
  }
  return null;
}

export function extractPawaPayReason(payload: any): PawaPayReason {
  const record = extractPrimaryRecord(payload);
  const failureReason = record?.failureReason;
  if (failureReason && typeof failureReason === 'object') {
    return {
      code: typeof failureReason.failureCode === 'string' ? failureReason.failureCode : null,
      message:
        typeof failureReason.failureMessage === 'string' ? failureReason.failureMessage : null,
    };
  }

  const rejectionReason = record?.rejectionReason;
  if (rejectionReason && typeof rejectionReason === 'object') {
    return {
      code:
        typeof rejectionReason.rejectionCode === 'string' ? rejectionReason.rejectionCode : null,
      message:
        typeof rejectionReason.rejectionMessage === 'string'
          ? rejectionReason.rejectionMessage
          : null,
    };
  }

  return { code: null, message: null };
}

function parseNumberEnv(value: string | undefined): number {
  const parsed = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculatePawaPayCharge(amount: number): number {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  if (safeAmount <= 0) return 0;

  const flatCharge = parseNumberEnv(process.env.PAWAPAY_CHARGE_FLAT);
  const percentCharge = parseNumberEnv(process.env.PAWAPAY_CHARGE_PERCENT);
  const percentageAmount = safeAmount * (percentCharge / 100);

  return Math.round(flatCharge + percentageAmount);
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
