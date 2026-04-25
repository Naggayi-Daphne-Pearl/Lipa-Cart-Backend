import { sendKycApprovedLoginEmail } from '../../../../services/email';

declare const strapi: any;

export default {
  async beforeUpdate(event: any) {
    if (event.params?.data?.kyc_status !== 'approved') return;
    try {
      const where = event.params?.where;
      if (!where) return;
      const existing: any = await strapi.db
        .query('api::shopper.shopper')
        .findOne({ where, select: ['kyc_status'] });
      event.state = event.state ?? {};
      event.state.previousKycStatus = existing?.kyc_status ?? null;
    } catch (err: any) {
      strapi.log.warn(
        `[shopper.lifecycle.beforeUpdate] Could not read previous kyc_status: ${err?.message || err}`,
      );
    }
  },

  async afterUpdate(event: any) {
    const { result, params } = event;

    if (params?.data?.kyc_status !== 'approved') return;
    // Idempotent: skip if the row was already approved before this update.
    if (event.state?.previousKycStatus === 'approved') return;

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
