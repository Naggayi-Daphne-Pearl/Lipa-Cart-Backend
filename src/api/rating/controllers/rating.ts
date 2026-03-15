import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::rating.rating', ({ strapi }) => ({
  /**
   * Create rating and update shopper/rider average ratings
   */
  async create(ctx: any) {
    // Let Strapi create the rating first
    const result = await super.create(ctx);

    try {
      const ratingData = ctx.request.body?.data;
      if (!ratingData) return result;

      const orderId = ratingData.order;
      const shopperRating = ratingData.shopper_rating;
      const riderRating = ratingData.rider_rating;

      if (!orderId) return result;

      // Find the order to get shopper and rider
      const order: any = await strapi.db.query('api::order.order').findOne({
        where: { documentId: orderId },
      });

      if (!order) return result;

      // Update shopper rating if provided
      if (shopperRating && shopperRating >= 1 && shopperRating <= 5) {
        try {
          const shopperLink: any = await strapi.db.connection.raw(
            `SELECT user_id FROM orders_shopper_lnk WHERE order_id = ?`, [order.id]
          );
          const shopperRows = shopperLink?.rows || shopperLink;
          if (shopperRows && shopperRows.length > 0) {
            const shopperUserId = shopperRows[0].user_id;
            const sLink: any = await strapi.db.connection.raw(
              `SELECT shopper_id FROM shoppers_user_lnk WHERE user_id = ?`, [shopperUserId]
            );
            const sRows = sLink?.rows || sLink;
            if (sRows && sRows.length > 0) {
              const shopper: any = await strapi.db.query('api::shopper.shopper').findOne({
                where: { id: sRows[0].shopper_id },
              });

              if (shopper) {
                // Calculate new average: (current_avg * total_ratings + new_rating) / (total_ratings + 1)
                const currentRating = shopper.rating || 0;
                const totalRatings = shopper.total_ratings || 0;
                const newTotalRatings = totalRatings + 1;
                const newAvgRating = ((currentRating * totalRatings) + shopperRating) / newTotalRatings;

                await strapi.entityService.update('api::shopper.shopper', shopper.id, {
                  data: {
                    rating: Math.round(newAvgRating * 10) / 10, // Round to 1 decimal
                    total_ratings: newTotalRatings,
                  },
                });
                console.log(`Updated shopper ${shopper.id}: rating ${newAvgRating.toFixed(1)}, total_ratings ${newTotalRatings}`);
              }
            }
          }
        } catch (e: any) {
          console.error('Failed to update shopper rating:', e?.message);
        }
      }

      // Update rider rating if provided
      if (riderRating && riderRating >= 1 && riderRating <= 5) {
        try {
          const riderLink: any = await strapi.db.connection.raw(
            `SELECT user_id FROM orders_rider_lnk WHERE order_id = ?`, [order.id]
          );
          const riderRows = riderLink?.rows || riderLink;
          if (riderRows && riderRows.length > 0) {
            const riderUserId = riderRows[0].user_id;
            const rLink: any = await strapi.db.connection.raw(
              `SELECT rider_id FROM riders_user_lnk WHERE user_id = ?`, [riderUserId]
            );
            const rRows = rLink?.rows || rLink;
            if (rRows && rRows.length > 0) {
              const rider: any = await strapi.db.query('api::rider.rider').findOne({
                where: { id: rRows[0].rider_id },
              });

              if (rider) {
                const currentRating = rider.rating || 0;
                const totalRatings = rider.total_ratings || 0;
                const newTotalRatings = totalRatings + 1;
                const newAvgRating = ((currentRating * totalRatings) + riderRating) / newTotalRatings;

                await strapi.entityService.update('api::rider.rider', rider.id, {
                  data: {
                    rating: Math.round(newAvgRating * 10) / 10,
                    total_ratings: newTotalRatings,
                  },
                });
                console.log(`Updated rider ${rider.id}: rating ${newAvgRating.toFixed(1)}, total_ratings ${newTotalRatings}`);
              }
            }
          }
        } catch (e: any) {
          console.error('Failed to update rider rating:', e?.message);
        }
      }
    } catch (e: any) {
      // Don't fail the rating creation if stats update fails
      console.error('Error updating rating stats:', e?.message);
    }

    return result;
  },
}));
