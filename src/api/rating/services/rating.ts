import { factories } from '@strapi/strapi';

export type RatingRole = 'shopper' | 'rider';

function normalizeRelationRef(value: any): string | number | null {
  if (value == null) return null;
  if (typeof value === 'object') {
    return value.documentId ?? value.id ?? null;
  }
  return value;
}

export async function getAuthenticatedCustomUser(strapi: any, ctx: any) {
  const authUser = ctx.state.user;
  if (!authUser?.username) return null;

  return strapi.db.query('api::user.user').findOne({
    where: { phone: authUser.username },
  });
}

export async function findOrderByReference(
  strapi: any,
  orderRef: any,
  options: Record<string, unknown> = {},
) {
  const normalizedRef = normalizeRelationRef(orderRef);
  if (!normalizedRef) return null;

  const isNumericRef = typeof normalizedRef === 'number' || /^\d+$/.test(String(normalizedRef));

  return strapi.db.query('api::order.order').findOne({
    where: isNumericRef ? { id: Number(normalizedRef) } : { documentId: String(normalizedRef) },
    ...options,
  });
}

export async function recalculateRoleProfileRating(strapi: any, role: RatingRole, userId: number) {
  const ratingField = role === 'shopper' ? 'shopper_rating' : 'rider_rating';

  const profiles = await strapi.entityService.findMany(`api::${role}.${role}` as any, {
    filters: { user: { id: userId } } as any,
    limit: 1,
  });

  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile) return;

  const orders = await strapi.entityService.findMany('api::order.order' as any, {
    filters: { [role]: { id: userId } } as any,
    populate: ['rating'] as any,
  });

  const ratingValues: number[] = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    const rating = (order as any).rating;
    const value = rating?.[ratingField];
    if (typeof value === 'number' && value >= 1 && value <= 5) {
      ratingValues.push(value);
    }
  }

  const totalRatings = ratingValues.length;
  const averageRating =
    totalRatings > 0
      ? Math.round((ratingValues.reduce((sum, value) => sum + value, 0) / totalRatings) * 10) / 10
      : 0;

  await strapi.entityService.update(`api::${role}.${role}` as any, profile.id, {
    data: {
      rating: averageRating,
      total_ratings: totalRatings,
    } as any,
  });
}

export async function recalculateOrderParticipantRatings(strapi: any, orderRef: any) {
  const order = await findOrderByReference(strapi, orderRef, {
    populate: ['shopper', 'rider'],
  });

  if (!order) return;

  if (order.shopper?.id) {
    await recalculateRoleProfileRating(strapi, 'shopper', order.shopper.id);
  }

  if (order.rider?.id) {
    await recalculateRoleProfileRating(strapi, 'rider', order.rider.id);
  }
}

export default factories.createCoreService('api::rating.rating');
