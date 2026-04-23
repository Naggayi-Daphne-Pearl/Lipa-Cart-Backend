export default {
  routes: [
    {
      method: 'GET',
      path: '/health',
      handler: 'health.check',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/email/test',
      handler: 'health.testEmail',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/email/test',
      handler: 'health.testEmail',
      config: {
        auth: false,
      },
    },
  ],
};
