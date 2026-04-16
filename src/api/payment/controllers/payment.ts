import { factories } from '@strapi/strapi';
import { requireAuth } from '../../../services/auth-helper';
import {
  createPawaPayDeposit,
  getPawaPayDepositStatus,
  isPawaPayConfigured,
  mapPawaPayStatusToPaymentStatus,
} from '../../../services/pawapay';

function normalizeMsisdn(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('256')) return digits;
  if (digits.startsWith('0')) return `256${digits.slice(1)}`;
  return digits;
}

function extractProviderStatus(payload: any): string {
  if (!payload) return '';
  if (typeof payload.status === 'string') return payload.status;
  if (Array.isArray(payload) && payload[0]?.status) return String(payload[0].status);
  if (payload.data?.status) return String(payload.data.status);
  if (payload.result?.status) return String(payload.result.status);
  return '';
}

export default factories.createCoreController('api::payment.payment', ({ strapi }) => ({
  async initiateMobileMoney(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;

      if (!customUser || customUser.user_type !== 'customer') {
        return ctx.forbidden('Only customers can initiate payments');
      }

      if (!isPawaPayConfigured()) {
        return ctx.badRequest('PawaPay is not configured on the server');
      }

      const { orderId, phoneNumber, correspondent, country } = ctx.request.body || {};
      if (!orderId) {
        return ctx.badRequest('orderId is required');
      }

      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: String(orderId) },
        populate: ['customer'],
      });

      if (!order) return ctx.notFound('Order not found');
      if (!order.customer || order.customer.id !== customUser.id) {
        return ctx.forbidden('You can only pay for your own order');
      }
      if (!['pending', 'payment_processing'].includes(order.status)) {
        return ctx.badRequest(`Cannot initiate payment for order in '${order.status}' state`);
      }
      if (String(order.payment_method) !== 'mobileMoney') {
        return ctx.badRequest('PawaPay is only available for mobile money orders');
      }

      const msisdn = normalizeMsisdn(phoneNumber || customUser.phone || '');
      if (!/^256\d{9}$/.test(msisdn)) {
        return ctx.badRequest('A valid Uganda phone number is required');
      }

      let payment: any = await strapi.db.query('api::payment.payment').findOne({
        where: {
          order: { id: order.id },
          method: 'mobile_money',
          provider: 'pawapay',
        },
      });

      if (!payment) {
        payment = await strapi.entityService.create('api::payment.payment', {
          data: {
            order: order.id,
            method: 'mobile_money',
            provider: 'pawapay',
            amount: Number(order.total || 0),
            currency: 'UGX',
            status: 'pending',
            phone_number: `+${msisdn}`,
          },
        });
      }

      const depositId = payment.transaction_id || `lc_${order.id}_${Date.now()}`;

      const providerResponse = await createPawaPayDeposit({
        depositId,
        amount: Number(order.total || 0),
        currency: String(payment.currency || 'UGX'),
        phoneNumber: msisdn,
        correspondent: correspondent || process.env.PAWAPAY_CORRESPONDENT_UG || 'MTN_MOMO_UGA',
        country: country || process.env.PAWAPAY_COUNTRY || 'UGA',
        statementDescription: `LipaCart Order ${order.order_number}`,
      });

      const providerStatus = extractProviderStatus(providerResponse);
      const mappedStatus = mapPawaPayStatusToPaymentStatus(providerStatus);

      const updatedPayment = await strapi.entityService.update('api::payment.payment', payment.id, {
        data: {
          transaction_id: depositId,
          status: mappedStatus,
          phone_number: `+${msisdn}`,
          provider_response: providerResponse,
          ...(mappedStatus === 'failed'
            ? { error_message: providerStatus || 'PawaPay payment initiation failed' }
            : {}),
          ...(mappedStatus === 'completed' ? { completed_at: new Date() } : {}),
        },
      });

      const orderStatusPatch: any =
        mappedStatus === 'completed'
          ? {
              status: 'payment_confirmed',
              payment_confirmed_at: new Date(),
            }
          : mappedStatus === 'failed'
            ? { status: 'pending' }
            : { status: 'payment_processing' };

      await strapi.entityService.update('api::order.order', order.id, {
        data: orderStatusPatch,
      });

      ctx.body = {
        data: {
          payment: updatedPayment,
          providerStatus,
          orderStatus: orderStatusPatch.status,
          message:
            mappedStatus === 'completed'
              ? 'Payment completed successfully'
              : mappedStatus === 'failed'
                ? 'Payment failed to start. Please retry.'
                : 'Payment request sent. Approve the mobile money prompt on your phone.',
        },
      };
    } catch (error: any) {
      console.error('PawaPay initiateMobileMoney error:', error);
      ctx.throw(500, error?.message || 'Failed to initiate mobile money payment');
    }
  },

  async checkStatus(ctx: any) {
    try {
      const auth = await requireAuth(ctx, strapi);
      if (!auth) return;
      const { customUser } = auth;
      if (!customUser || customUser.user_type !== 'customer') {
        return ctx.forbidden('Only customers can check payment status');
      }

      const { id } = ctx.params;
      const payment: any = await strapi.db.query('api::payment.payment').findOne({
        where: { documentId: String(id) },
        populate: {
          order: {
            populate: ['customer'],
          },
        },
      });
      if (!payment) return ctx.notFound('Payment not found');

      if (payment.order?.customer?.id !== customUser.id) {
        return ctx.forbidden('You can only check your own payment');
      }
      if (payment.provider !== 'pawapay') {
        return ctx.badRequest('This payment is not handled by PawaPay');
      }
      if (!payment.transaction_id) {
        return ctx.badRequest('Payment has no transaction reference');
      }

      const providerResponse = await getPawaPayDepositStatus(payment.transaction_id);
      const providerStatus = extractProviderStatus(providerResponse);
      const mappedStatus = mapPawaPayStatusToPaymentStatus(providerStatus);

      const updatedPayment = await strapi.entityService.update('api::payment.payment', payment.id, {
        data: {
          status: mappedStatus,
          provider_response: providerResponse,
          ...(mappedStatus === 'failed'
            ? { error_message: providerStatus || 'Payment failed' }
            : {}),
          ...(mappedStatus === 'completed' ? { completed_at: new Date() } : {}),
        },
      });

      const orderStatusPatch: any =
        mappedStatus === 'completed'
          ? {
              status: 'payment_confirmed',
              payment_confirmed_at: new Date(),
            }
          : mappedStatus === 'failed'
            ? { status: 'pending' }
            : { status: 'payment_processing' };

      await strapi.entityService.update('api::order.order', payment.order.id, {
        data: orderStatusPatch,
      });

      ctx.body = {
        data: {
          payment: updatedPayment,
          providerStatus,
          orderStatus: orderStatusPatch.status,
        },
      };
    } catch (error: any) {
      console.error('PawaPay checkStatus error:', error);
      ctx.throw(500, error?.message || 'Failed to check payment status');
    }
  },

  async pawapayWebhook(ctx: any) {
    try {
      const callbackToken = process.env.PAWAPAY_WEBHOOK_TOKEN;
      if (callbackToken) {
        const providedToken =
          ctx.request.headers['x-pawapay-token'] ||
          ctx.request.headers['x-webhook-token'] ||
          ctx.query?.token;
        if (String(providedToken || '') !== String(callbackToken)) {
          return ctx.unauthorized('Invalid webhook token');
        }
      }

      const payload = ctx.request.body;
      const transactionId =
        payload?.depositId ||
        payload?.deposit_id ||
        payload?.data?.depositId ||
        payload?.data?.deposit_id;
      const status = extractProviderStatus(payload);

      if (!transactionId || !status) {
        return ctx.badRequest('depositId and status are required');
      }

      const payment: any = await strapi.db.query('api::payment.payment').findOne({
        where: { transaction_id: String(transactionId), provider: 'pawapay' },
        populate: ['order'],
      });

      if (!payment) {
        return (ctx.body = { ok: true, ignored: true, reason: 'Payment not found' });
      }

      const mappedStatus = mapPawaPayStatusToPaymentStatus(status);

      await strapi.entityService.update('api::payment.payment', payment.id, {
        data: {
          status: mappedStatus,
          provider_response: payload,
          ...(mappedStatus === 'failed' ? { error_message: status } : {}),
          ...(mappedStatus === 'completed' ? { completed_at: new Date() } : {}),
        },
      });

      const orderStatusPatch: any =
        mappedStatus === 'completed'
          ? {
              status: 'payment_confirmed',
              payment_confirmed_at: new Date(),
            }
          : mappedStatus === 'failed'
            ? { status: 'pending' }
            : { status: 'payment_processing' };

      await strapi.entityService.update('api::order.order', payment.order.id, {
        data: orderStatusPatch,
      });

      ctx.body = { ok: true };
    } catch (error: any) {
      console.error('PawaPay webhook error:', error);
      ctx.throw(500, error?.message || 'Failed to handle PawaPay webhook');
    }
  },
}));
