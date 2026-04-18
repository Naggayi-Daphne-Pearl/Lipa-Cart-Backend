import { mapPawaPayStatusToPaymentStatus, isPawaPayConfigured } from '../pawapay';

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
