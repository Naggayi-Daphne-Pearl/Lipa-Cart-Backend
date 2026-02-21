export default {
  routes: [
    {
      method: 'POST',
      path: '/otp/request',
      handler: 'otp.request',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/otp/verify',
      handler: 'otp.verify',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
