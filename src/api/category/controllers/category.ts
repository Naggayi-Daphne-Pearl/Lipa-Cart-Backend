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
  TemplateRow,
  generateTemplate,
  parseWorkbook,
} from '../../../services/category-bulk-import';
import { extractZipImages } from '../../../services/product-bulk-import';

export default factories.createCoreController('api::category.category', ({ strapi }) => ({
  /**
   * GET /categories/xlsx-template — admin-only.
   */
  async xlsxTemplate(ctx: any) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;
    const buffer = await generateTemplate();
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', 'attachment; filename="categories-template.xlsx"');
    ctx.body = buffer;
  },

  /**
   * GET /categories/xlsx-export — admin-only. Active categories in template
   * shape. Read-only snapshot — re-importing creates duplicates.
   */
  async xlsxExport(ctx: any) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const categories: any[] = await strapi.db.query('api::category.category').findMany({
      select: ['name', 'description', 'color', 'sort_order', 'is_active'],
      populate: { image: { select: ['url'] } },
      orderBy: { sort_order: 'asc' },
      limit: 500,
    });

    const rows: TemplateRow[] = categories.map((c) => ({
      name: (c.name ?? '').toString(),
      description: (c.description ?? '').toString(),
      color: (c.color ?? '').toString(),
      sort_order: c.sort_order != null ? c.sort_order.toString() : '',
      is_active: c.is_active === false ? 'false' : 'true',
      image_filename: '',
      image_url: (c.image?.url ?? '').toString(),
    }));

    const buffer = await generateTemplate(rows);
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set(
      'Content-Disposition',
      `attachment; filename="categories-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    ctx.body = buffer;
  },

  /**
   * POST /categories/bulk-import — admin only. Multipart:
   *   - xlsx (required)
   *   - zip  (optional) — image filenames in image_filename column
   *   - dry_run (optional) — validate without writing
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

    let parsed: {
      rows: TemplateRow[];
      rowNumbers: number[];
      embeddedImagesByRow: Map<number, { buffer: Buffer; mime: string; filename: string }>;
    };
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

      const sortOrderRaw = row.sort_order?.trim();
      let sortOrder: number | undefined;
      if (sortOrderRaw) {
        const n = Number(sortOrderRaw);
        if (!Number.isFinite(n)) {
          errors.push({ row: rowNumber, error: 'sort_order must be a number' });
          continue;
        }
        sortOrder = Math.trunc(n);
      }

      const isActiveRaw = row.is_active?.trim().toLowerCase();
      const isActive = isActiveRaw == null || isActiveRaw === '' ? true : isActiveRaw !== 'false';

      const imageFilename = row.image_filename?.trim() ?? '';
      const normalizedImageFilename =
        imageFilename.split('/').pop()?.split('\\').pop() ?? imageFilename;
      const imageUrl = row.image_url?.trim() ?? '';
      const embeddedImage = parsed.embeddedImagesByRow.get(rowNumber) ?? null;
      const requestsImage =
        imageFilename.length > 0 || imageUrl.length > 0 || embeddedImage != null;
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
        zipKey = normalizedImageFilename.toLowerCase();
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

      let imageId: number | null = null;
      try {
        if (zipKey) {
          const entry = zipImages.get(zipKey)!;
          imageId = await uploadBufferToCloudinary(
            strapi,
            entry.buffer,
            normalizedImageFilename,
            entry.mime,
          );
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
        } else if (embeddedImage) {
          imageId = await uploadBufferToCloudinary(
            strapi,
            embeddedImage.buffer,
            embeddedImage.filename,
            embeddedImage.mime,
          );
        }
      } catch (err: any) {
        errors.push({
          row: rowNumber,
          error: `image upload failed: ${err?.message ?? 'unknown'}`,
        });
        continue;
      }

      try {
        await strapi.entityService.create('api::category.category', {
          data: {
            name,
            description: row.description?.trim() ?? '',
            color: row.color?.trim() ?? null,
            sort_order: sortOrder ?? 0,
            is_active: isActive,
            ...(imageId ? { image: imageId } : {}),
            publishedAt: new Date(),
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
