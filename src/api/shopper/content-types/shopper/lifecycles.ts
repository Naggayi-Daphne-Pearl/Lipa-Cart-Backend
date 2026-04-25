import { sendKycApprovedLoginEmail } from '../../../../services/email';

declare const strapi: any;

export default {
  async afterUpdate(event: any) {
    const { result, params } = event;

    if (params?.data?.kyc_status !== 'approved') return;

    const shopperId = result?.id;
    if (!shopperId) return;

    try {
      const shopper: any = await strapi.db.query('api::shopper.shopper').findOne({
        where: { id: shopperId },
        populate: ['user'],
      });

      const email = shopper?.user?.email;
      if (!email) {
        strapi.log.warn(
          `[shopper.lifecycle] Approved shopper ${shopperId} has no user email; skipping notification`,
        );
        return;
      }

      await sendKycApprovedLoginEmail(email, 'shopper', { name: shopper.user?.name });
      strapi.log.info(`[shopper.lifecycle] Approval email sent for shopper ${shopperId}`);
    } catch (err: any) {
      strapi.log.warn(
        `[shopper.lifecycle.afterUpdate] Approval email failed for shopper ${shopperId}: ${err?.message || err}`,
      );
    }
  },
};
