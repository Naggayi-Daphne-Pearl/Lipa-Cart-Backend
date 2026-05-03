/**
 * Integration tests for email.ts template functions.
 * Mocks nodemailer so no SMTP traffic; asserts each template produces
 * correct subject, content, attachments, and routes to the right recipient.
 */

const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
const verifyMock = jest.fn().mockResolvedValue(true);

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: sendMailMock,
    verify: verifyMock,
  })),
}));

// Ensure SMTP env is populated before initEmail() runs.
process.env.SMTP_HOST = 'smtp.test.local';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'apikey';
process.env.SMTP_PASS = 'test-pass';
process.env.SMTP_FROM = 'LipaCart <noreply@lipacart.com>';
process.env.SUPPORT_EMAIL = 'support-test@lipacart.com';
process.env.FRONTEND_URL = 'https://www.lipacart.com';

import {
  initEmail,
  sendOtpEmail,
  sendForgotPasswordOtpEmail,
  sendKycApprovedLoginEmail,
  sendOrderConfirmationEmail,
  sendDeliveryReceiptEmail,
  sendOrderStatusUpdateEmail,
  sendEmail,
  getEmailDiagnostics,
} from '../email';

beforeAll(() => {
  initEmail();
});

beforeEach(() => {
  sendMailMock.mockClear();
  sendMailMock.mockResolvedValue({ messageId: 'test-msg-id' });
});

/** Helper: read the first sendMail call arguments. */
function lastSendMailArgs() {
  expect(sendMailMock).toHaveBeenCalledTimes(1);
  return sendMailMock.mock.calls[0][0];
}

/** Helper: build a mock strapi with a seeded customer + order lookup. */
function mockStrapi(
  customerEmail: string | null,
  total = 150000,
  overrides: Record<string, unknown> = {},
) {
  return {
    db: {
      connection: {
        raw: jest.fn().mockResolvedValue(customerEmail ? [{ user_id: 1 }] : []),
      },
      query: () => ({
        findOne: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.id === 1) return Promise.resolve({ email: customerEmail });
          return Promise.resolve({
            id: where?.id,
            total,
            payment_method: 'mobileMoney',
            delivery_address: {
              address_line: 'Plot 12 Kampala Road',
              city: 'Kampala',
              landmark: 'Acacia Mall',
            },
            ...overrides,
          });
        }),
      }),
    },
  };
}

describe('email service — initialization', () => {
  it('initEmail() reports ready with mocked SMTP env', () => {
    expect(getEmailDiagnostics().configured).toBe(true);
  });
});

describe('sendOtpEmail', () => {
  it('sends to the given address with the OTP in the body', async () => {
    const ok = await sendOtpEmail('user@example.com', '123456');
    expect(ok).toBe(true);
    const args = lastSendMailArgs();
    expect(args.to).toBe('user@example.com');
    expect(args.subject).toBe('Your LipaCart verification code');
    expect(args.html).toContain('123456');
    expect(args.text).toContain('123456');
    expect(args.from).toBe('LipaCart <noreply@lipacart.com>');
  });

  it('includes the support email in the footer', async () => {
    await sendOtpEmail('user@example.com', '999000');
    expect(lastSendMailArgs().html).toContain('support-test@lipacart.com');
  });
});

describe('sendForgotPasswordOtpEmail', () => {
  it('includes the OTP, a reset CTA, and replyTo=support', async () => {
    const ok = await sendForgotPasswordOtpEmail('user@example.com', '424242', {
      name: 'Jane Doe',
      resetUrl: 'https://www.lipacart.com/forgot-password?email=user@example.com&otp=424242',
    });
    expect(ok).toBe(true);
    const args = lastSendMailArgs();
    expect(args.subject).toBe('Reset your LipaCart password');
    expect(args.replyTo).toBe('support-test@lipacart.com');
    expect(args.html).toContain('424242');
    expect(args.html).toContain('otp=424242');
    expect(args.html).toContain('Hi Jane,');
  });

  it('defaults greeting to "Hi there," when name is omitted', async () => {
    await sendForgotPasswordOtpEmail('anon@example.com', '111222');
    expect(lastSendMailArgs().html).toContain('Hi there,');
  });
});

describe('sendKycApprovedLoginEmail', () => {
  it('includes a role-specific message for shoppers', async () => {
    await sendKycApprovedLoginEmail('shopper@example.com', 'shopper', { name: 'Sam' });
    const args = lastSendMailArgs();
    expect(args.subject).toBe('Your LipaCart account is approved');
    expect(args.html).toContain('shopper');
    expect(args.html).toContain('Hi Sam,');
    expect(args.html).toContain('https://www.lipacart.com/login');
  });

  it('includes a role-specific message for riders', async () => {
    await sendKycApprovedLoginEmail('rider@example.com', 'rider');
    expect(lastSendMailArgs().html).toContain('rider');
  });
});

describe('sendOrderConfirmationEmail', () => {
  it('sends to the customer with order number, total, and Payment Confirmed status', async () => {
    const strapi = mockStrapi('customer@example.com', 250000);
    await sendOrderConfirmationEmail(strapi, 42, 'ORD-42');
    const args = lastSendMailArgs();
    expect(args.to).toBe('customer@example.com');
    expect(args.subject).toBe('Order Confirmed — #ORD-42');
    expect(args.html).toContain('#ORD-42');
    expect(args.html).toContain('UGX 250,000');
    expect(args.html).toContain('Payment Confirmed');
  });

  it('uses COD-specific copy when the order will be paid on delivery', async () => {
    const strapi = mockStrapi('customer@example.com', 58125, {
      payment_method: 'cashOnDelivery',
    });
    await sendOrderConfirmationEmail(strapi, 77, 'ORD-77');
    const args = lastSendMailArgs();
    expect(args.subject).toBe('Order Confirmed - Pay on Delivery #ORD-77');
    expect(args.html).toContain('Amount Due');
    expect(args.html).toContain('Cash on Delivery');
    expect(args.html).toContain('receipt will be issued after cash collection is confirmed');
    expect(args.attachments).toBeUndefined();
  });

  it('silently skips when the order has no linked customer', async () => {
    const strapi = mockStrapi(null);
    await sendOrderConfirmationEmail(strapi, 99, 'ORD-99');
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('sendDeliveryReceiptEmail', () => {
  it('includes a PDF receipt attachment named after the order', async () => {
    const strapi = mockStrapi('customer@example.com', 80000);
    await sendDeliveryReceiptEmail(strapi, 7, 'ORD-7');
    const args = lastSendMailArgs();
    expect(args.subject).toBe('Order Delivered — #ORD-7');
    expect(args.attachments).toHaveLength(1);
    expect(args.attachments[0].filename).toBe('receipt-ORD-7.pdf');
    expect(args.attachments[0].contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(args.attachments[0].content)).toBe(true);
    expect(args.html).toContain('UGX 80,000');
  });
});

describe('sendOrderStatusUpdateEmail', () => {
  it('sends a minimalist status email with the new status label', async () => {
    const strapi = mockStrapi('customer@example.com');
    await sendOrderStatusUpdateEmail(strapi, 3, 'ORD-3', 'Shopper Assigned');
    const args = lastSendMailArgs();
    expect(args.subject).toBe('Order Update — #ORD-3');
    expect(args.html).toContain('#ORD-3');
    expect(args.html).toContain('Shopper Assigned');
  });
});

describe('sendEmail (generic, legacy 4-arg signature)', () => {
  it('accepts the positional signature used by sendOrderConfirmationEmail', async () => {
    const ok = await sendEmail('raw@example.com', 'Hello', '<p>Body</p>');
    expect(ok).toBe(true);
    const args = lastSendMailArgs();
    expect(args.to).toBe('raw@example.com');
    expect(args.subject).toBe('Hello');
    expect(args.html).toBe('<p>Body</p>');
  });

  it('returns false when transporter throws (e.g. connection timeout)', async () => {
    sendMailMock.mockRejectedValueOnce(
      Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }),
    );
    const ok = await sendEmail({ to: 'fail@example.com', subject: 'x', html: 'y' });
    expect(ok).toBe(false);
    expect(getEmailDiagnostics().lastError).toContain('Connection timeout');
  });
});

describe('unified template shell', () => {
  it('every template rendering includes the LipaCart header and support footer', async () => {
    const calls: string[] = [];

    await sendOtpEmail('a@x.com', '111111');
    calls.push(lastSendMailArgs().html);
    sendMailMock.mockClear();

    await sendForgotPasswordOtpEmail('b@x.com', '222222');
    calls.push(lastSendMailArgs().html);
    sendMailMock.mockClear();

    await sendKycApprovedLoginEmail('c@x.com', 'shopper');
    calls.push(lastSendMailArgs().html);

    for (const html of calls) {
      expect(html).toContain('LipaCart');
      expect(html).toContain('support-test@lipacart.com');
      expect(html).toContain('Reliable grocery delivery updates');
    }
  });
});
