export default {
  type: 'content-api',
  routes: [
    {
      method: 'POST',
      path: '/addresses/:id/set-default',
      handler: 'address.setDefault',
    },
  ],
};
