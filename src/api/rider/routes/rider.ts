export default {
  routes: [
    // Custom KYC endpoints MUST come before :id routes
    {
      method: 'POST',
      path: '/riders/kyc/submit',
      handler: 'rider.submitKyc',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'PATCH',
      path: '/riders/:id/kyc',
      handler: 'rider.reviewKyc',
      config: {
        auth: false,
        policies: [],
      },
    },
    // Standard core CRUD routes
    { method: 'GET', path: '/riders', handler: 'rider.find' },
    { method: 'GET', path: '/riders/:id', handler: 'rider.findOne' },
    { method: 'POST', path: '/riders', handler: 'rider.create' },
    { method: 'PUT', path: '/riders/:id', handler: 'rider.update' },
    { method: 'DELETE', path: '/riders/:id', handler: 'rider.delete' },
  ],
};
