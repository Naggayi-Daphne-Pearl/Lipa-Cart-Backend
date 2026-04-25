const strapiHolder: { current: any } = { current: null };

const sendKycApprovedLoginEmailMock = jest.fn().mockResolvedValue(true);
const sendOrderConfirmationEmailMock = jest.fn().mockResolvedValue(true);
const sendDeliveryReceiptEmailMock = jest.fn().mockResolvedValue(true);
const sendOrderStatusUpdateEmailMock = jest.fn().mockResolvedValue(true);

const requireAdminMock = jest.fn();
const requireAuthMock = jest.fn();
const notifyOrderStatusChangeMock = jest.fn().mockResolvedValue(undefined);
const notifyShoppersNewTaskMock = jest.fn().mockResolvedValue(undefined);
const notifyRidersNewDeliveryMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@strapi/strapi', () => ({
  factories: {
    createCoreController: (_uid: string, builder: any) => builder({ strapi: strapiHolder.current }),
  },
}));

jest.mock('../../services/email', () => ({
  sendKycApprovedLoginEmail: (...args: any[]) => sendKycApprovedLoginEmailMock(...args),
  sendOrderConfirmationEmail: (...args: any[]) => sendOrderConfirmationEmailMock(...args),
  sendDeliveryReceiptEmail: (...args: any[]) => sendDeliveryReceiptEmailMock(...args),
  sendOrderStatusUpdateEmail: (...args: any[]) => sendOrderStatusUpdateEmailMock(...args),
}));

jest.mock('../../services/auth-helper', () => ({
  requireAdmin: (...args: any[]) => requireAdminMock(...args),
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}));

jest.mock('../../services/notification', () => ({
  notifyOrderStatusChange: (...args: any[]) => notifyOrderStatusChangeMock(...args),
  notifyShoppersNewTask: (...args: any[]) => notifyShoppersNewTaskMock(...args),
  notifyRidersNewDelivery: (...args: any[]) => notifyRidersNewDeliveryMock(...args),
}));

function makeCtx(body: any = {}, params: any = {}) {
  return {
    request: {
      body,
      headers: {
        authorization: 'Bearer test-token',
      },
    },
    params,
    state: {},
    status: 200,
    body: null as any,
    badRequest: jest.fn((message: string) => ({ error: message })),
    forbidden: jest.fn((message: string) => ({ error: message })),
    unauthorized: jest.fn((message: string) => ({ error: message })),
    notFound: jest.fn((message: string) => ({ error: message })),
    conflict: jest.fn((message: string) => ({ error: message })),
    throw: jest.fn((code: number, message: string) => {
      throw new Error(`${code}:${message}`);
    }),
  };
}

describe('email usage instances - controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses OTP service for auth request flow (shopper/rider signup authentication)', async () => {
    const generateOtpMock = jest.fn().mockResolvedValue({ deliveredVia: 'email' });

    (global as any).strapi = {
      db: {
        query: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue({ email: 'shopper@example.com' }),
        })),
      },
      service: jest.fn(() => ({
        generateOtp: generateOtpMock,
      })),
    };

    const otpController = require('../otp/controllers/otp').default;
    const ctx = makeCtx({ phone: '+256700000001' });

    await otpController.request(ctx);

    expect(generateOtpMock).toHaveBeenCalledWith('+256700000001', 'shopper@example.com');
    expect(ctx.body?.success).toBe(true);
  });

  it('sends forgot-password OTP using forgot-password template payload', async () => {
    const getOtpMock = jest.fn().mockResolvedValue(null);
    const generateOtpMock = jest.fn().mockResolvedValue({ deliveredVia: 'email' });

    (global as any).strapi = {
      query: jest.fn((uid: string) => {
        if (uid === 'plugin::users-permissions.user') {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 11,
              email: 'rider@example.com',
              username: '+256700000002',
              password: 'hashed-password',
            }),
          };
        }
        return { findOne: jest.fn().mockResolvedValue(null) };
      }),
      db: {
        query: jest.fn((uid: string) => {
          if (uid === 'api::user.user') {
            return {
              findOne: jest.fn().mockResolvedValue({
                email: 'rider@example.com',
                phone: '+256700000002',
                is_active: true,
                name: 'Rider User',
              }),
            };
          }
          return { findOne: jest.fn().mockResolvedValue(null) };
        }),
      },
      service: jest.fn(() => ({
        getOtp: getOtpMock,
        generateOtp: generateOtpMock,
      })),
    };

    const authController = require('../auth/controllers/auth').default;
    const ctx = makeCtx({ email: 'rider@example.com' });

    await authController.forgotPassword(ctx);

    expect(generateOtpMock).toHaveBeenCalledWith(
      'rider@example.com',
      'rider@example.com',
      'forgot-password',
      expect.objectContaining({
        name: 'Rider User',
        resetUrl: expect.stringContaining('/forgot-password?email=rider%40example.com'),
      }),
    );
    expect(ctx.body?.success).toBe(true);
  });

  it('sends shopper verification status email when lifecycle fires on kyc_status=approved', async () => {
    const strapiMock = {
      db: {
        query: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue({
            id: 22,
            documentId: 'shopper-doc-22',
            user: { email: 'shopper@example.com', name: 'Shopper Name' },
          }),
        })),
      },
      log: { warn: jest.fn(), info: jest.fn() },
    };

    (global as any).strapi = strapiMock;
    jest.resetModules();
    const shopperLifecycles = require('../shopper/content-types/shopper/lifecycles').default;

    await shopperLifecycles.afterUpdate({
      result: { id: 22 },
      params: { data: { kyc_status: 'approved' } },
    });

    expect(sendKycApprovedLoginEmailMock).toHaveBeenCalledWith('shopper@example.com', 'shopper', {
      name: 'Shopper Name',
    });
  });

  it('sends rider verification status email when lifecycle fires on kyc_status=approved', async () => {
    const strapiMock = {
      db: {
        query: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue({
            id: 23,
            documentId: 'rider-doc-23',
            user: { email: 'rider@example.com', name: 'Rider Name' },
          }),
        })),
      },
      log: { warn: jest.fn(), info: jest.fn() },
    };

    (global as any).strapi = strapiMock;
    jest.resetModules();
    const riderLifecycles = require('../rider/content-types/rider/lifecycles').default;

    await riderLifecycles.afterUpdate({
      result: { id: 23 },
      params: { data: { kyc_status: 'approved' } },
    });

    expect(sendKycApprovedLoginEmailMock).toHaveBeenCalledWith('rider@example.com', 'rider', {
      name: 'Rider Name',
    });
  });

  it('does not send email when kyc_status is not the field being updated', async () => {
    const strapiMock = {
      db: { query: jest.fn() },
      log: { warn: jest.fn(), info: jest.fn() },
    };

    (global as any).strapi = strapiMock;
    jest.resetModules();
    const riderLifecycles = require('../rider/content-types/rider/lifecycles').default;

    await riderLifecycles.afterUpdate({
      result: { id: 23 },
      params: { data: { is_active: false } },
    });

    expect(sendKycApprovedLoginEmailMock).not.toHaveBeenCalled();
    expect(strapiMock.db.query).not.toHaveBeenCalled();
  });

  it('sends order confirmation email when payment is confirmed', async () => {
    requireAdminMock.mockResolvedValue({ customUser: { id: 900 } });

    const strapiMock = {
      db: {
        query: jest.fn((uid: string) => {
          if (uid === 'api::order.order') {
            return {
              findOne: jest.fn().mockResolvedValue({
                id: 101,
                documentId: 'order-doc-101',
                status: 'pending',
                order_number: 'ORD-101',
              }),
            };
          }
          return { findOne: jest.fn().mockResolvedValue(null) };
        }),
      },
      entityService: {
        update: jest.fn().mockResolvedValue({ id: 101, status: 'payment_confirmed' }),
      },
    };

    strapiHolder.current = strapiMock;
    jest.resetModules();
    const orderController = require('../order/controllers/order').default;

    const ctx = makeCtx({}, { id: 'order-doc-101' });
    await orderController.confirmPayment(ctx);

    expect(sendOrderConfirmationEmailMock).toHaveBeenCalledWith(strapiMock, 101, 'ORD-101');
  });

  it('sends delivery receipt email when rider marks order delivered', async () => {
    requireAuthMock.mockResolvedValue({
      customUser: { id: 77, user_type: 'rider', documentId: 'user-doc-77' },
    });

    const strapiMock = {
      db: {
        query: jest.fn((uid: string) => {
          if (uid === 'api::order.order') {
            return {
              findOne: jest.fn().mockResolvedValue({
                id: 202,
                documentId: 'order-doc-202',
                status: 'in_transit',
                rider: { id: 77 },
                order_number: 'ORD-202',
                total: 125000,
              }),
            };
          }
          if (uid === 'api::shopper.shopper' || uid === 'api::rider.rider') {
            return {
              findOne: jest.fn().mockResolvedValue(null),
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
          };
        }),
        connection: {
          raw: jest.fn().mockResolvedValue([]),
        },
      },
      entityService: {
        update: jest.fn().mockResolvedValue({ id: 202, status: 'delivered' }),
      },
    };

    strapiHolder.current = strapiMock;
    jest.resetModules();
    const orderController = require('../order/controllers/order').default;

    const ctx = makeCtx({ status: 'delivered' }, { id: 'order-doc-202' });
    await orderController.updateRiderStatus(ctx);

    expect(sendDeliveryReceiptEmailMock).toHaveBeenCalledWith(strapiMock, 202, 'ORD-202');
  });
});
