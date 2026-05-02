import {
  calculatePawaPayCharge,
  extractPawaPayReason,
  isPawaPayConfigured,
  mapPawaPayStatusToPaymentStatus,
} from '../pawapay';

describe('mapPawaPayStatusToPaymentStatus', () => {
  it('maps COMPLETED to completed', () => {
    expect(mapPawaPayStatusToPaymentStatus('COMPLETED')).toBe('completed');
  });

  it('maps FAILED and REJECTED to failed', () => {
    expect(mapPawaPayStatusToPaymentStatus('FAILED')).toBe('failed');
    expect(mapPawaPayStatusToPaymentStatus('REJECTED')).toBe('failed');
  });

  it.each(['ACCEPTED', 'SUBMITTED', 'ENQUEUED', 'DUPLICATE_IGNORED'])(
    'maps %s to processing (in-flight)',
    (status) => {
      expect(mapPawaPayStatusToPaymentStatus(status)).toBe('processing');
    },
  );

  it('is case-insensitive (normalizes to upper-case)', () => {
    expect(mapPawaPayStatusToPaymentStatus('completed')).toBe('completed');
    expect(mapPawaPayStatusToPaymentStatus('failed')).toBe('failed');
  });

  it('defaults unknown or empty inputs to processing', () => {
    expect(mapPawaPayStatusToPaymentStatus(null)).toBe('processing');
    expect(mapPawaPayStatusToPaymentStatus(undefined)).toBe('processing');
    expect(mapPawaPayStatusToPaymentStatus('')).toBe('processing');
    expect(mapPawaPayStatusToPaymentStatus('WHATEVER')).toBe('processing');
  });
});

describe('isPawaPayConfigured', () => {
  const originalApiKey = process.env.PAWAPAY_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.PAWAPAY_API_KEY;
    } else {
      process.env.PAWAPAY_API_KEY = originalApiKey;
    }
  });

  it('returns false when PAWAPAY_API_KEY is unset', () => {
    delete process.env.PAWAPAY_API_KEY;
    expect(isPawaPayConfigured()).toBe(false);
  });

  it('returns false when PAWAPAY_API_KEY is empty or whitespace', () => {
    process.env.PAWAPAY_API_KEY = '';
    expect(isPawaPayConfigured()).toBe(false);
    process.env.PAWAPAY_API_KEY = '   ';
    expect(isPawaPayConfigured()).toBe(false);
  });

  it('returns true when PAWAPAY_API_KEY is set', () => {
    process.env.PAWAPAY_API_KEY = 'test-api-key';
    expect(isPawaPayConfigured()).toBe(true);
  });
});

describe('extractPawaPayReason', () => {
  it('extracts failureReason details from a status array payload', () => {
    expect(
      extractPawaPayReason([
        {
          status: 'FAILED',
          failureReason: {
            failureCode: 'INSUFFICIENT_BALANCE',
            failureMessage: 'Not enough funds',
          },
        },
      ]),
    ).toEqual({ code: 'INSUFFICIENT_BALANCE', message: 'Not enough funds' });
  });

  it('extracts rejectionReason details from a rejection payload', () => {
    expect(
      extractPawaPayReason({
        status: 'REJECTED',
        rejectionReason: {
          rejectionCode: 'INVALID_AMOUNT',
          rejectionMessage: 'Amount should be greater than 0!',
        },
      }),
    ).toEqual({ code: 'INVALID_AMOUNT', message: 'Amount should be greater than 0!' });
  });
});

describe('calculatePawaPayCharge', () => {
  const originalFlat = process.env.PAWAPAY_CHARGE_FLAT;
  const originalPercent = process.env.PAWAPAY_CHARGE_PERCENT;

  afterEach(() => {
    if (originalFlat === undefined) {
      delete process.env.PAWAPAY_CHARGE_FLAT;
    } else {
      process.env.PAWAPAY_CHARGE_FLAT = originalFlat;
    }

    if (originalPercent === undefined) {
      delete process.env.PAWAPAY_CHARGE_PERCENT;
    } else {
      process.env.PAWAPAY_CHARGE_PERCENT = originalPercent;
    }
  });

  it('returns zero when no charge config is set', () => {
    delete process.env.PAWAPAY_CHARGE_FLAT;
    delete process.env.PAWAPAY_CHARGE_PERCENT;
    expect(calculatePawaPayCharge(10000)).toBe(0);
  });

  it('combines flat and percentage fees', () => {
    process.env.PAWAPAY_CHARGE_FLAT = '250';
    process.env.PAWAPAY_CHARGE_PERCENT = '1.5';
    expect(calculatePawaPayCharge(10000)).toBe(400);
  });
});
