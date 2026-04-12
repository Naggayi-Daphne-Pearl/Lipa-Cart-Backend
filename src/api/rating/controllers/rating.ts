import { factories } from '@strapi/strapi';
import { findOrderByReference, getAuthenticatedCustomUser } from '../services/rating';

function parseRatingValue(value: unknown): number | null | 'invalid' {
  if (value == null) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return 'invalid';
  }

  return parsed;
}

function deriveOverallRating(
  overallRating: number | null,
  shopperRating: number | null,
  riderRating: number | null,
): number | null {
  if (overallRating != null) return overallRating;

  const provided = [shopperRating, riderRating].filter((value): value is number => value != null);

  if (provided.length === 0) return null;

  return Math.round(provided.reduce((sum, value) => sum + value, 0) / provided.length);
}

export default factories.createCoreController('api::rating.rating', ({ strapi }) => ({
  async create(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) {
      return ctx.unauthorized('Authentication required');
    }

    const customUser = await getAuthenticatedCustomUser(strapi, ctx);
    if (!customUser) {
      return ctx.notFound('User profile not found');
    }

    if (customUser.user_type !== 'customer') {
      return ctx.forbidden('Only customers can submit ratings');
    }

    const incomingData = ctx.request.body?.data ?? {};
    if (!incomingData.order) {
      return ctx.badRequest('order is required');
    }

    const order = await findOrderByReference(strapi, incomingData.order, {
      populate: ['customer', 'shopper', 'rider', 'rating'],
    });

    if (!order) {
      return ctx.notFound('Order not found');
    }

    if (order.customer?.id !== customUser.id) {
      return ctx.forbidden('You can only rate your own orders');
    }

    if (order.status !== 'delivered') {
      return ctx.badRequest('Only delivered orders can be rated');
    }

    if (order.rating?.id || order.rating?.documentId) {
      return ctx.badRequest('Rating already exists for this order');
    }

    const shopperRating = parseRatingValue(incomingData.shopper_rating);
    const riderRating = parseRatingValue(incomingData.rider_rating);
    const overallRating = parseRatingValue(incomingData.overall_rating);

    if (shopperRating === 'invalid' || riderRating === 'invalid' || overallRating === 'invalid') {
      return ctx.badRequest('Ratings must be whole numbers between 1 and 5');
    }

    if (shopperRating == null && riderRating == null && overallRating == null) {
      return ctx.badRequest('Provide at least one rating');
    }

    if (shopperRating != null && !order.shopper?.id) {
      return ctx.badRequest('This order does not have a shopper to rate');
    }

    if (riderRating != null && !order.rider?.id) {
      return ctx.badRequest('This order does not have a rider to rate');
    }

    const resolvedOverallRating = deriveOverallRating(overallRating, shopperRating, riderRating);

    if (resolvedOverallRating == null) {
      return ctx.badRequest(
        'overall_rating is required when shopper and rider ratings are not provided',
      );
    }

    const trimmedComment =
      typeof incomingData.comment === 'string' && incomingData.comment.trim().length > 0
        ? incomingData.comment.trim()
        : undefined;

    ctx.request.body.data = {
      ...incomingData,
      order: order.documentId ?? order.id,
      customer: customUser.id,
      overall_rating: resolvedOverallRating,
      shopper_rating: shopperRating,
      rider_rating: riderRating,
      ...(trimmedComment ? { comment: trimmedComment } : { comment: null }),
    };

    return super.create(ctx);
  },
}));
