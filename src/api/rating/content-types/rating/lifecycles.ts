import {
  findOrderByReference,
  recalculateOrderParticipantRatings,
  recalculateRoleProfileRating,
} from '../../services/rating';

export default {
  async beforeCreate({ params }: any) {
    const { data } = params;

    if (!data.order) {
      return;
    }

    try {
      const existingOrder = await findOrderByReference(strapi, data.order, {
        populate: ['rating'],
      });

      if (existingOrder?.rating?.id || existingOrder?.rating?.documentId) {
        throw new Error(
          'Rating already exists for this order. Customers can only rate an order once.',
        );
      }
    } catch (error: any) {
      if (error.message?.includes('Rating already exists')) {
        throw error;
      }

      console.warn('[Rating beforeCreate] Warning:', error.message);
    }
  },

  async beforeDelete(event: any) {
    try {
      const existing = await strapi.db.query('api::rating.rating').findOne({
        where: event.params?.where,
        populate: {
          order: {
            populate: ['shopper', 'rider'],
          },
        },
      });

      event.state = {
        affectedOrder: existing?.order?.documentId ?? existing?.order?.id ?? null,
        affectedShopperUserId: existing?.order?.shopper?.id ?? null,
        affectedRiderUserId: existing?.order?.rider?.id ?? null,
      };
    } catch (error: any) {
      console.warn('[Rating beforeDelete] Warning:', error.message);
    }
  },

  async afterCreate({ result }: any) {
    try {
      await recalculateOrderParticipantRatings(strapi, result?.order);
    } catch (error: any) {
      console.warn('[Rating afterCreate] Failed to update profile ratings:', error.message);
    }
  },

  async afterUpdate({ result }: any) {
    try {
      await recalculateOrderParticipantRatings(strapi, result?.order);
    } catch (error: any) {
      console.warn('[Rating afterUpdate] Failed to update profile ratings:', error.message);
    }
  },

  async afterDelete(event: any) {
    try {
      const state = event.state ?? {};

      if (state.affectedOrder) {
        await recalculateOrderParticipantRatings(strapi, state.affectedOrder);
        return;
      }

      if (state.affectedShopperUserId) {
        await recalculateRoleProfileRating(strapi, 'shopper', state.affectedShopperUserId);
      }

      if (state.affectedRiderUserId) {
        await recalculateRoleProfileRating(strapi, 'rider', state.affectedRiderUserId);
      }
    } catch (error: any) {
      console.warn('[Rating afterDelete] Failed to update profile ratings:', error.message);
    }
  },
};
