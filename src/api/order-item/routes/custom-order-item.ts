export default {
  type: 'content-api',
  routes: [
    {
      method: 'PATCH',
      path: '/order-items/batch-update',
      handler: 'order-item.batchUpdate',
      config: { auth: false },
    },
    {
      method: 'PATCH',
      path: '/order-items/:id/shopper-update',
      handler: 'order-item.shopperUpdate',
      config: { auth: false },
    },
    {
      method: 'PATCH',
      path: '/order-items/:id/substitution-response',
      handler: 'order-item.respondToSubstitution',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/order-items/:id/suggest-substitute',
      handler: 'order-item.suggestSubstitute',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/order-items/bulk',
      handler: 'order-item.bulkCreate',
      config: { auth: false },
    },
  ],
};
