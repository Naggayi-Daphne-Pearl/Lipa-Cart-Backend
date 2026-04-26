export default ({ env }) => [
  'strapi::logger',
  'strapi::errors',
  'global::sentry',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:'],
          'img-src': ["'self'", 'data:', 'blob:', 'market-assets.strapi.io', 'res.cloudinary.com'],
          'media-src': [
            "'self'",
            'data:',
            'blob:',
            'market-assets.strapi.io',
            'res.cloudinary.com',
          ],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      origin:
        env('NODE_ENV', 'development') === 'production'
          ? [
              env('FRONTEND_URL', 'https://www.lipacart.com'),
              'https://lipacart.com',
              'https://www.lipacart.com',
              'https://shopper.lipacart.com',
              'https://rider.lipacart.com',
              'https://admin.lipacart.com',
            ]
          : (ctx) => {
              // In development, allow any localhost origin (Flutter uses random ports)
              const req = ctx.request.header.origin || '';
              if (req.startsWith('http://localhost') || req.startsWith('http://127.0.0.1')) {
                return req;
              }
              return '';
            },
      credentials: true,
      keepHeaderOnError: true,
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  {
    // Strapi's default formLimit is ~56KB, which truncates real product
    // images well before plugins.upload.security.sizeLimit ever fires.
    // Keep these in sync with UPLOAD_MAX_BYTES.
    name: 'strapi::body',
    config: {
      formLimit: '12mb',
      jsonLimit: '12mb',
      textLimit: '12mb',
      formidable: { maxFileSize: 12 * 1024 * 1024 },
    },
  },
  'strapi::session',
  'global::normalize-admin-url',
  'strapi::favicon',
  'strapi::public',
  'global::allow-bulk-orders',
  'global::auto-assign-role',
];
