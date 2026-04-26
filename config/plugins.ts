export default ({ env }) => ({
  upload: {
    config: {
      provider: 'cloudinary',
      providerOptions: {
        cloud_name: env('CLOUDINARY_NAME'),
        api_key: env('CLOUDINARY_KEY'),
        api_secret: env('CLOUDINARY_SECRET'),
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
      // Hard cap before bytes hit Cloudinary; keep in sync with the
      // strapi::body formidable limit in config/middlewares.ts.
      sizeLimit: env.int('UPLOAD_MAX_BYTES', 10 * 1024 * 1024),
      // Strapi 5 file-validation surface — silences the "No upload security
      // configuration found" warning. SVG is intentionally excluded: it can
      // carry inline scripts and is a stored-XSS vector.
      security: {
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        deniedTypes: [
          'text/html',
          'application/xhtml+xml',
          'application/javascript',
          'application/x-sh',
          'application/x-msdownload',
          'image/svg+xml',
        ],
      },
    },
  },
});
