export default {
  type: 'content-api',
  routes: [
    {
      method: 'POST',
      path: '/order-items/bulk',
      handler: 'order-item.bulkCreate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
