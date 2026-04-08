export default ({ env }) => {
  const publicUrl =
    env('PUBLIC_URL') ||
    (env('RAILWAY_PUBLIC_DOMAIN')
      ? `https://${env('RAILWAY_PUBLIC_DOMAIN')}`
      : 'http://localhost:1337');

  return {
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),
    url: publicUrl,
    proxy: env.bool(
      'IS_PROXIED',
      env('NODE_ENV', 'development') === 'production',
    ),
    app: {
      keys: env.array('APP_KEYS'),
    },
  };
};
