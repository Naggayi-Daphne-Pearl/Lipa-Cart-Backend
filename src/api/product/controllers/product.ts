import { factories } from '@strapi/strapi';
import { isAllowedUploadUrl } from '../../../services/upload-url-allowlist';
import {
  readFile,
  uploadBufferToCloudinary,
  fetchRemoteImageBuffer,
  requireAdmin,
  parseDryRun,
  maxImageBytes,
} from '../../../services/bulk-import-helpers';
import {
  TEMPLATE_HEADERS,
  TemplateRow,
  generateTemplate,
  parseWorkbook,
  extractZipImages,
} from '../../../services/product-bulk-import';

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  /**
   * GET /products/category-options — admin id/name list of active categories.
   * Used by /products/xlsx-template at generation time.
   */
  async categoryOptions(ctx: any) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const categories: any[] = await strapi.db.query('api::category.category').findMany({
      select: ['id', 'documentId', 'name'],
      where: { is_active: true },
      orderBy: { name: 'asc' },
      limit: 500,
    });

    ctx.body = {
      data: categories.map((c) => ({ id: c.documentId, name: c.name })),
    };
  },

  /**
   * GET /products/xlsx-template — admin-only. Generates an .xlsx with a
   * category_name dropdown backed by the live category list, so admins can't
   * fat-finger a category that doesn't exist.
   */
  async xlsxTemplate(ctx: any) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const categories: any[] = await strapi.db.query('api::category.category').findMany({
      select: ['name'],
      where: { is_active: true },
      orderBy: { name: 'asc' },
      limit: 500,
    });
    const names = categories.map((c) => c.name as string).filter(Boolean);

    const buffer = await generateTemplate(names);
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', 'attachment; filename="products-template.xlsx"');
    ctx.body = buffer;
  },

  /**
   * GET /products/xlsx-export — admin-only. Pulls the current active catalog
   * and returns it as an .xlsx in the same shape as the import template, so
   * admins can use it as a backup or as a reference when filling new rows.
   *
   * Note: re-importing this file CREATES new products (the bulk-import flow
   * has no upsert path). It is a read-only snapshot, not a sync mechanism.
   */
  async xlsxExport(ctx: any) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const [categories, products] = await Promise.all([
      strapi.db.query('api::category.category').findMany({
        select: ['name'],
        where: { is_active: true },
        orderBy: { name: 'asc' },
        limit: 500,
      }) as Promise<any[]>,
      strapi.db.query('api::product.product').findMany({
        select: ['name', 'description', 'estimated_price', 'common_units'],
        populate: { category: { select: ['name'] }, image: { select: ['url'] } },
        where: { is_active: true },
        orderBy: { name: 'asc' },
        limit: 1000,
      }) as Promise<any[]>,
    ]);

    const names = categories.map((c) => c.name as string).filter(Boolean);

    const rows = products.map((p) => {
      const units = Array.isArray(p.common_units)
        ? (p.common_units as unknown[]).map((u) => String(u).trim()).filter(Boolean)
        : typeof p.common_units === 'string'
          ? [p.common_units as string]
          : [];
      return {
        name: (p.name ?? '').toString(),
        description: (p.description ?? '').toString(),
        estimated_price: p.estimated_price != null ? p.estimated_price.toString() : '',
        common_units: units.join('|'),
        category_name: (p.category?.name ?? '').toString(),
        image_filename: '',
        image_url: (p.image?.url ?? '').toString(),
      };
    });

    const buffer = await generateTemplate(names, rows);
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set(
      'Content-Disposition',
      `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    ctx.body = buffer;
  },

  /**
   * POST /products/bulk-import — admin only. Multipart form-data:
   *   - xlsx (required): the filled template
   *   - zip  (optional): a zip of product images, referenced by
   *                       image_filename in the workbook
   *   - dry_run (optional form field): "true" to validate without writing
   *
   * Image source priority per row:
   *   1. image_filename in the zip (preferred — bundle approach)
   *   2. image_url (Cloudinary tenant only — back-compat)
   *
   * Returns { dry_run, created, skipped, total, errors[], unused_zip_files[] }.
   */
  async bulkImport(ctx: any) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const files = ctx.request.files ?? {};
    const xlsxFile = (files.xlsx ?? files['xlsx[]']) as any;
    const zipFile = (files.zip ?? files['zip[]']) as any;
    if (!xlsxFile) {
      return ctx.badRequest('xlsx file is required (multipart field "xlsx")');
    }

    const dryRun = parseDryRun(ctx);

    let xlsxBuf: Buffer;
    try {
      xlsxBuf = await readFile(xlsxFile);
    } catch (e: any) {
      return ctx.badRequest(`Failed to read xlsx: ${e?.message ?? 'unknown'}`);
    }

    let parsed: { rows: TemplateRow[]; rowNumbers: number[] };
    try {
      parsed = await parseWorkbook(xlsxBuf);
    } catch (e: any) {
      return ctx.badRequest(`xlsx parse error: ${e?.message ?? 'unknown'}`);
    }

    if (parsed.rows.length === 0) {
      return ctx.badRequest('xlsx has no data rows');
    }
    if (parsed.rows.length > 200) {
      return ctx.badRequest('Max 200 rows per import. Split the file.');
    }

    let zipImages = new Map<string, { buffer: Buffer; mime: string }>();
    const usedZipKeys = new Set<string>();
    if (zipFile) {
      try {
        const zipBuf = await readFile(zipFile);
        zipImages = extractZipImages(zipBuf);
      } catch (e: any) {
        return ctx.badRequest(`zip parse error: ${e?.message ?? 'unknown'}`);
      }
    }

    // Pre-load active categories for case-insensitive name → id resolution.
    const categories: any[] = await strapi.db.query('api::category.category').findMany({
      select: ['id', 'name'],
      where: { is_active: true },
      limit: 500,
    });
    const categoryByName = new Map<string, number>();
    for (const c of categories) {
      categoryByName.set((c.name as string).trim().toLowerCase(), c.id);
    }

    const maxBytes = maxImageBytes();

    let created = 0;
    let imagesAttached = 0;
    let rowsRequestingImage = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const rowNumber = parsed.rowNumbers[i];

      const name = row.name?.trim();
      if (!name) {
        errors.push({ row: rowNumber, error: 'name is required' });
        continue;
      }

      const priceRaw = row.estimated_price?.trim();
      const price = Number(priceRaw);
      if (!Number.isFinite(price) || price < 0) {
        errors.push({ row: rowNumber, error: 'estimated_price must be a positive number' });
        continue;
      }

      const categoryNameRaw = row.category_name?.trim();
      if (!categoryNameRaw) {
        errors.push({ row: rowNumber, error: 'category_name is required' });
        continue;
      }
      const categoryId = categoryByName.get(categoryNameRaw.toLowerCase());
      if (!categoryId) {
        errors.push({
          row: rowNumber,
          error: `unknown category "${categoryNameRaw}"`,
        });
        continue;
      }

      // Validate image references up front (cheap) before doing any uploads.
      const imageFilename = row.image_filename?.trim() ?? '';
      const imageUrl = row.image_url?.trim() ?? '';
      const requestsImage = imageFilename.length > 0 || imageUrl.length > 0;
      if (requestsImage) rowsRequestingImage++;

      let zipKey: string | null = null;
      if (imageFilename) {
        if (zipImages.size === 0) {
          errors.push({
            row: rowNumber,
            error: `image "${imageFilename}" referenced but no .zip was uploaded`,
          });
          continue;
        }
        zipKey = imageFilename.toLowerCase();
        if (!zipImages.has(zipKey)) {
          errors.push({
            row: rowNumber,
            error: `image "${imageFilename}" not found in uploaded zip`,
          });
          continue;
        }
      } else if (imageUrl && !isAllowedUploadUrl(imageUrl)) {
        errors.push({
          row: rowNumber,
          error: 'image_url must be a Cloudinary URL on our tenant',
        });
        continue;
      }

      if (dryRun) {
        if (zipKey) usedZipKeys.add(zipKey);
        created++;
        continue;
      }

      // Resolve image — zip wins, URL is fallback.
      let imageId: number | null = null;
      try {
        if (zipKey) {
          const entry = zipImages.get(zipKey)!;
          imageId = await uploadBufferToCloudinary(strapi, entry.buffer, imageFilename, entry.mime);
          usedZipKeys.add(zipKey);
        } else if (imageUrl) {
          const fetched = await fetchRemoteImageBuffer(imageUrl, maxBytes);
          if (fetched) {
            imageId = await uploadBufferToCloudinary(
              strapi,
              fetched.buffer,
              fetched.filename,
              fetched.mime,
            );
          }
        }
      } catch (err: any) {
        errors.push({
          row: rowNumber,
          error: `image upload failed: ${err?.message ?? 'unknown'}`,
        });
        continue;
      }

      const units = (row.common_units?.trim() ?? '')
        .split('|')
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      try {
        await strapi.entityService.create('api::product.product', {
          data: {
            name,
            description: row.description?.trim() ?? '',
            estimated_price: price,
            common_units: units.length > 0 ? units : ['piece'],
            category: categoryId,
            ...(imageId ? { image: imageId } : {}),
            is_active: true,
          },
        });
        created++;
        if (imageId) imagesAttached++;
      } catch (err: any) {
        errors.push({
          row: rowNumber,
          error: err?.message ?? 'create failed',
        });
      }
    }

    const unusedZipFiles = Array.from(zipImages.keys()).filter((k) => !usedZipKeys.has(k));

    ctx.body = {
      data: {
        dry_run: dryRun,
        created,
        skipped: errors.length,
        total: parsed.rows.length,
        errors,
        rows_requesting_image: rowsRequestingImage,
        images_attached: imagesAttached,
        zip_provided: zipFile != null,
        unused_zip_files: unusedZipFiles,
      },
    };
  },
}));

// Re-export for tests / other callers if ever needed.
export { TEMPLATE_HEADERS };
