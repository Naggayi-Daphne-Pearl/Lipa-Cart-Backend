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
  ],
};
