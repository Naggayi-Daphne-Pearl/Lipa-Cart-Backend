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
      // Hard cap before bytes hit Cloudinary; matches Cloudinary free-tier limit.
      sizeLimit: env.int('UPLOAD_MAX_BYTES', 10 * 1024 * 1024),
      // Strapi 5 file-validation surface — silences the "No upload security
      // configuration found" warning and locks the API to image/* + pdf only.
      security: {
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf'],
        // Reject filenames with traversal characters or null bytes.
        denyOnTraversal: true,
        // Strip script-like extensions even if MIME passes.
        denyExtensions: [
          'php',
          'phtml',
          'phar',
          'sh',
          'bat',
          'cmd',
          'exe',
          'js',
          'mjs',
          'cjs',
          'html',
          'htm',
          'svgz',
        ],
      },
    },
  },
});
