import {
  mapFlutterwaveStatusToPaymentStatus,
  detectUgandaNetwork,
  verifyWebhookSignature,
  computeHmacSignature,
  isFlutterwaveConfigured,
} from '../flutterwave';

describe('mapFlutterwaveStatusToPaymentStatus', () => {
  it.each(['succeeded', 'completed', 'success', 'SUCCEEDED', 'Completed'])(
    'maps "%s" to completed',
    (status) => {
      expect(mapFlutterwaveStatusToPaymentStatus(status)).toBe('completed');
    },
  );

  it.each(['failed', 'cancelled', 'expired', 'FAILED', 'Expired'])(
    'maps "%s" to failed',
    (status) => {
      expect(mapFlutterwaveStatusToPaymentStatus(status)).toBe('failed');
    },
  );

  it('defaults unknown inputs to processing', () => {
    expect(mapFlutterwaveStatusToPaymentStatus(null)).toBe('processing');
    expect(mapFlutterwaveStatusToPaymentStatus(undefined)).toBe('processing');
    expect(mapFlutterwaveStatusToPaymentStatus('')).toBe('processing');
    expect(mapFlutterwaveStatusToPaymentStatus('pending')).toBe('processing');
    expect(mapFlutterwaveStatusToPaymentStatus('whatever')).toBe('processing');
  });
});

describe('detectUgandaNetwork', () => {
  describe('MTN (default)', () => {
    it.each(['0771234567', '0781234567', '0761234567', '0391234567'])('%s → MTN', (phone) => {
      expect(detectUgandaNetwork(phone)).toBe('MTN');
    });

    it('handles the +256 prefixed form', () => {
      expect(detectUgandaNetwork('+256771234567')).toBe('MTN');
      expect(detectUgandaNetwork('256771234567')).toBe('MTN');
    });

    it('defaults unknown/short numbers to MTN', () => {
      expect(detectUgandaNetwork('')).toBe('MTN');
      expect(detectUgandaNetwork('1234')).toBe('MTN');
    });
  });

  describe('Airtel', () => {
    it.each(['0701234567', '0741234567', '0751234567', '0751111111'])('%s → Airtel', (phone) => {
      expect(detectUgandaNetwork(phone)).toBe('Airtel');
    });

    it('handles country-code prefixed Airtel numbers', () => {
      expect(detectUgandaNetwork('+256701234567')).toBe('Airtel');
      expect(detectUgandaNetwork('256741234567')).toBe('Airtel');
    });
  });

  it('strips non-digit characters before inspecting prefix', () => {
    expect(detectUgandaNetwork('+256 (77) 123 4567')).toBe('MTN');
    expect(detectUgandaNetwork('+256-70-123-4567')).toBe('Airtel');
  });
});

describe('verifyWebhookSignature', () => {
  const secret = 'webhook-shared-secret';
  const originalSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.FLUTTERWAVE_WEBHOOK_SECRET = secret;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    } else {
      process.env.FLUTTERWAVE_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('accepts a matching verif-hash header', () => {
    expect(verifyWebhookSignature({ 'verif-hash': secret })).toBe(true);
  });

  it('accepts the capitalized variant', () => {
    expect(verifyWebhookSignature({ 'Verif-Hash': secret })).toBe(true);
  });

  it('accepts the x-flutterwave-signature alias', () => {
    expect(verifyWebhookSignature({ 'x-flutterwave-signature': secret })).toBe(true);
  });

  it('rejects a mismatched header', () => {
    expect(verifyWebhookSignature({ 'verif-hash': 'wrong' })).toBe(false);
  });

  it('rejects when the header is missing', () => {
    expect(verifyWebhookSignature({})).toBe(false);
  });

  it('rejects when no secret is configured (fail-closed)', () => {
    delete process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    expect(verifyWebhookSignature({ 'verif-hash': 'anything' })).toBe(false);
  });

  it('is safe against length-based timing differences', () => {
    // Both of these should return false without throwing. The
    // timingSafeEqual call only runs when lengths match; verifying
    // short/long headers exercises the length guard.
    expect(verifyWebhookSignature({ 'verif-hash': 'short' })).toBe(false);
    expect(verifyWebhookSignature({ 'verif-hash': 'a'.repeat(500) })).toBe(false);
  });
});

describe('computeHmacSignature', () => {
  const originalKey = process.env.FLUTTERWAVE_ENCRYPTION_KEY;

  beforeAll(() => {
    // 32-byte key, base64-encoded (matches the format Flutterwave issues).
    process.env.FLUTTERWAVE_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.FLUTTERWAVE_ENCRYPTION_KEY;
    } else {
      process.env.FLUTTERWAVE_ENCRYPTION_KEY = originalKey;
    }
  });

  it('produces a deterministic hex digest for a given body', () => {
    const sig1 = computeHmacSignature('{"foo":"bar"}');
    const sig2 = computeHmacSignature('{"foo":"bar"}');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it('produces different digests for different bodies', () => {
    expect(computeHmacSignature('{"a":1}')).not.toBe(computeHmacSignature('{"a":2}'));
  });
});

describe('isFlutterwaveConfigured', () => {
  const originalId = process.env.FLUTTERWAVE_CLIENT_ID;
  const originalSecret = process.env.FLUTTERWAVE_CLIENT_SECRET;

  afterEach(() => {
    process.env.FLUTTERWAVE_CLIENT_ID = originalId ?? '';
    process.env.FLUTTERWAVE_CLIENT_SECRET = originalSecret ?? '';
  });

  it('returns false when either credential is missing', () => {
    process.env.FLUTTERWAVE_CLIENT_ID = '';
    process.env.FLUTTERWAVE_CLIENT_SECRET = 'secret';
    expect(isFlutterwaveConfigured()).toBe(false);

    process.env.FLUTTERWAVE_CLIENT_ID = 'id';
    process.env.FLUTTERWAVE_CLIENT_SECRET = '';
    expect(isFlutterwaveConfigured()).toBe(false);
  });

  it('returns true when both credentials are set', () => {
    process.env.FLUTTERWAVE_CLIENT_ID = 'client-id';
    process.env.FLUTTERWAVE_CLIENT_SECRET = 'client-secret';
    expect(isFlutterwaveConfigured()).toBe(true);
  });

  it('treats whitespace-only credentials as unconfigured', () => {
    process.env.FLUTTERWAVE_CLIENT_ID = '   ';
    process.env.FLUTTERWAVE_CLIENT_SECRET = '   ';
    expect(isFlutterwaveConfigured()).toBe(false);
  });
});
