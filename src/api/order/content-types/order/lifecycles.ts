import { notifyOrderStatusChange } from '../../../../services/notification';

declare const strapi: any;

export default {
  async afterUpdate(event: any) {
    const { result, params } = event;

    // Only fire when status was explicitly changed to 'cancelled'
    const newStatus = params?.data?.status;
    if (newStatus !== 'cancelled') return;

    const orderId = result?.id;
    const orderNumber = result?.order_number;
    if (!orderId || !orderNumber) return;

    notifyOrderStatusChange(strapi, orderId, 'cancelled', orderNumber).catch(() => {});
  },
};
