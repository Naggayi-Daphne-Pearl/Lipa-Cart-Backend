export default {
  routes: [
    // Public guest order endpoint (no JWT required)
    {
      method: 'POST',
      path: '/orders/guest',
      handler: 'order.createGuestOrder',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // Standard core CRUD routes (authenticated by default)
    { method: 'GET', path: '/orders', handler: 'order.find' },
    { method: 'GET', path: '/orders/:id', handler: 'order.findOne' },
    { method: 'POST', path: '/orders', handler: 'order.create' },
    { method: 'PUT', path: '/orders/:id', handler: 'order.update' },
    { method: 'DELETE', path: '/orders/:id', handler: 'order.delete' },
  ],
};
