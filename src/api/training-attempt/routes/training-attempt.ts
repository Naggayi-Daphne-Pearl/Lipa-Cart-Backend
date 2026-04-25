export default {
  routes: [
    {
      method: 'POST',
      path: '/training-attempts',
      handler: 'training-attempt.submit',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/training-attempts/status',
      handler: 'training-attempt.status',
      config: {
        policies: [],
      },
    },
  ],
};
