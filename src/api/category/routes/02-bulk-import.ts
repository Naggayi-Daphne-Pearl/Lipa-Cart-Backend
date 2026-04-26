/**
 * Custom routes alongside the default core router for category. Strapi auto-
 * loads every routes file in this directory, so the core CRUD remains intact.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/categories/xlsx-template',
      handler: 'category.xlsxTemplate',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/categories/xlsx-export',
      handler: 'category.xlsxExport',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/categories/bulk-import',
      handler: 'category.bulkImport',
      config: { policies: [] },
    },
  ],
};
