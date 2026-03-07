export default {
  type: 'content-api',
  routes: [
    {
      method: 'PATCH',
      path: '/order-items/batch-update',
      handler: 'order-item.batchUpdate',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/order-items/:id/shopper-update',
      handler: 'order-item.shopperUpdate',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/order-items/bulk',
      handler: 'order-item.bulkCreate',
      config: { policies: [], middlewares: [] },
    },
  ],
};
