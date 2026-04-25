export default {
  routes: [
    {
      method: 'GET',
      path: '/training-questions',
      handler: 'training-question.findForRole',
      config: {
        auth: false,
      },
    },
  ],
};
