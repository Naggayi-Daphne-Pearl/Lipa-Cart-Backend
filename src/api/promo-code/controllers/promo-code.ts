import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::promo-code.promo-code', ({ strapi }) => ({
  /**
   * Validate a promo code and return discount info.
   * POST /api/promo-codes/validate
   */
  async validate(ctx: any) {
    try {
      const { code, subtotal } = ctx.request.body;

      if (!code) return ctx.badRequest('Promo code is required');

      const promo: any = await strapi.db.query('api::promo-code.promo-code').findOne({
        where: { code: code.toUpperCase() },
      });

      if (!promo) return ctx.notFound('Invalid promo code');

      if (!promo.is_active) return ctx.badRequest('This promo code is no longer active');

      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        return ctx.badRequest('This promo code has expired');
      }

      if (promo.usage_limit && promo.times_used >= promo.usage_limit) {
        return ctx.badRequest('This promo code has reached its usage limit');
      }

      if (promo.min_order_amount && subtotal < promo.min_order_amount) {
        return ctx.badRequest(
          `Minimum order of UGX ${promo.min_order_amount.toLocaleString()} required for this code`
        );
      }

      let discountAmount: number;
      if (promo.discount_type === 'percentage') {
        discountAmount = (subtotal * promo.discount_value) / 100;
        if (promo.max_discount && discountAmount > promo.max_discount) {
          discountAmount = promo.max_discount;
        }
      } else {
        discountAmount = promo.discount_value;
      }

      ctx.body = {
        valid: true,
        code: promo.code,
        description: promo.description,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        discount_amount: discountAmount,
      };
    } catch (error) {
      console.error('Promo code validation error:', error);
      ctx.throw(500, 'Failed to validate promo code');
    }
  },
}));
