export default {
  routes: [
    {
      method: 'POST',
      path: '/payments/mobile-money/initiate',
      handler: 'payment.initiateMobileMoney',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/payments/:id/status',
      handler: 'payment.checkStatus',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payments/pawapay/webhook',
      handler: 'payment.pawapayWebhook',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payments/flutterwave/initiate',
      handler: 'payment.initiateFlutterwaveMobileMoney',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/payments/:id/flutterwave-status',
      handler: 'payment.checkFlutterwaveStatus',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/payments/flutterwave/webhook',
      handler: 'payment.flutterwaveWebhook',
      config: { auth: false, policies: [], middlewares: [] },
    },
    { method: 'GET', path: '/payments', handler: 'payment.find' },
    { method: 'GET', path: '/payments/:id', handler: 'payment.findOne' },
    { method: 'POST', path: '/payments', handler: 'payment.create' },
    { method: 'PUT', path: '/payments/:id', handler: 'payment.update' },
    { method: 'DELETE', path: '/payments/:id', handler: 'payment.delete' },
  ],
};
