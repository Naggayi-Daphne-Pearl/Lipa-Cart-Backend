export default [
  'strapi::logger',
  'strapi::errors',
  'global::sentry',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
  'global::allow-bulk-orders',  // Custom middleware to allow bulk order items endpoint
  'global::auto-assign-role',
];
