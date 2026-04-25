import { sendKycApprovedLoginEmail } from '../../../../services/email';

declare const strapi: any;

export default {
  async beforeUpdate(event: any) {
    if (event.params?.data?.kyc_status !== 'approved') return;
    try {
      const where = event.params?.where;
      if (!where) return;
      const existing: any = await strapi.db.query('api::rider.rider').findOne({
        where,
        select: ['kyc_status'],
      });
      event.state = event.state ?? {};
      event.state.previousKycStatus = existing?.kyc_status ?? null;
    } catch (err: any) {
      strapi.log.warn(
        `[rider.lifecycle.beforeUpdate] Could not read previous kyc_status: ${err?.message || err}`,
      );
    }
  },

  async afterUpdate(event: any) {
    const { result, params } = event;

    if (params?.data?.kyc_status !== 'approved') return;
    // Idempotent: skip if the row was already approved before this update.
    if (event.state?.previousKycStatus === 'approved') return;

    const riderId = result?.id;
    if (!riderId) return;

    try {
      const rider: any = await strapi.db.query('api::rider.rider').findOne({
        where: { id: riderId },
        populate: ['user'],
      });

      const email = rider?.user?.email;
      if (!email) {
        strapi.log.warn(
          `[rider.lifecycle] Approved rider ${riderId} has no user email; skipping notification`,
        );
        return;
      }

      await sendKycApprovedLoginEmail(email, 'rider', { name: rider.user?.name });
      strapi.log.info(`[rider.lifecycle] Approval email sent for rider ${riderId}`);
    } catch (err: any) {
      strapi.log.warn(
        `[rider.lifecycle.afterUpdate] Approval email failed for rider ${riderId}: ${err?.message || err}`,
      );
    }
  },
};
