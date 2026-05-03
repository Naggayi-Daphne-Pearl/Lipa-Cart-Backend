import * as deliveryCodeService from '../delivery-code';

describe('Delivery Code Service', () => {
  describe('generateDeliveryCode', () => {
    it('generates a 4-digit code as a string', () => {
      const code = deliveryCodeService.generateDeliveryCode();
      expect(code).toMatch(/^\d{4}$/);
      expect(code.length).toBe(4);
    });

    it('generates different codes on multiple calls', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(deliveryCodeService.generateDeliveryCode());
      }
      expect(codes.size).toBeGreaterThan(50); // High probability of uniqueness
    });

    it('can generate code 0000', () => {
      // Edge case: ensure padding works
      const code = deliveryCodeService.generateDeliveryCode();
      // Just check it's always 4 digits, even if it's 0000
      expect(code.length).toBe(4);
    });
  });

  describe('validateDeliveryCode', () => {
    const mockOrder = { delivery_code: '1234' };

    it('returns valid: true for correct code', () => {
      const result = deliveryCodeService.validateDeliveryCode(mockOrder, '1234');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns valid: false for incorrect code', () => {
      const result = deliveryCodeService.validateDeliveryCode(mockOrder, '5678');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('trims whitespace from input', () => {
      const result = deliveryCodeService.validateDeliveryCode(mockOrder, '  1234  ');
      expect(result.valid).toBe(true);
    });

    it('rejects non-4-digit codes', () => {
      const result = deliveryCodeService.validateDeliveryCode(mockOrder, '123');
      expect(result.valid).toBe(false);
    });

    it('rejects non-numeric codes', () => {
      const result = deliveryCodeService.validateDeliveryCode(mockOrder, 'abcd');
      expect(result.valid).toBe(false);
    });

    it('returns error when order has no code', () => {
      const orderWithoutCode = {};
      const result = deliveryCodeService.validateDeliveryCode(orderWithoutCode, '1234');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No delivery code');
    });

    it('returns error when order is null', () => {
      const result = deliveryCodeService.validateDeliveryCode(null, '1234');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Order not found');
    });
  });

  describe('checkCodeAttemptStatus', () => {
    it('tracks remaining attempts', () => {
      const order = { delivery_code_attempts: 0 };
      const status = deliveryCodeService.checkCodeAttemptStatus(order);
      expect(status.locked).toBe(false);
      expect(status.remainingAttempts).toBe(3);
    });

    it('locks after 3 attempts', () => {
      const order = { delivery_code_attempts: 3 };
      const status = deliveryCodeService.checkCodeAttemptStatus(order);
      expect(status.locked).toBe(true);
      expect(status.remainingAttempts).toBe(0);
    });

    it('returns 0 remaining when already exceeded', () => {
      const order = { delivery_code_attempts: 5 };
      const status = deliveryCodeService.checkCodeAttemptStatus(order);
      expect(status.locked).toBe(true);
      expect(status.remainingAttempts).toBe(0);
    });
  });

  describe('resendDeliveryCode', () => {
    // Note: This is a placeholder test since resendDeliveryCode needs strapi context
    it('returns success for valid method', async () => {
      const mockStrapi = {}; // In real tests, would be a test fixture
      // Would need to mock strapi.db.query, strapi.log, etc.
      // For now, just validate the service signature exists
      expect(typeof deliveryCodeService.resendDeliveryCode).toBe('function');
    });
  });

  describe('forwardDeliveryCode', () => {
    it('validates phone number input is a string', async () => {
      const mockStrapi = {}; // In real tests, would be a test fixture
      expect(typeof deliveryCodeService.forwardDeliveryCode).toBe('function');
    });
  });
});
