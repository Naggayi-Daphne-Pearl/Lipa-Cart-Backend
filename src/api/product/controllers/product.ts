import { factories } from '@strapi/strapi';
import https from 'https';
import http from 'http';
import path from 'path';
import { Readable } from 'stream';
import { isAllowedUploadUrl } from '../../../services/upload-url-allowlist';

const TEMPLATE_HEADERS = [
  'name',
  'description',
  'estimated_price',
  'common_units',
  'category_id',
  'image_url',
];

/**
 * Minimal CSV parser that supports quoted fields with embedded commas and
 * escaped double quotes ("") inside quoted fields. Returns an array of rows
 * (each row a string[]). Discards a trailing empty line.
 */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Pull a remote URL into Strapi's upload plugin. Returns the new media id.
 * The URL must satisfy isAllowedUploadUrl OR be a public Cloudinary URL —
 * but we still cap the bytes downloaded to avoid an attacker pointing us
 * at a 5GB file as a DoS vector.
 */
async function importImageFromUrl(
  strapi: any,
  url: string,
  maxBytes: number,
): Promise<number | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const client = parsed.protocol === 'https:' ? https : http;

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const req = client.get(url, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`Upstream ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(new Error('image exceeds size limit'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('image fetch timeout')));
  });

  const filename = decodeURIComponent(path.basename(parsed.pathname)) || 'product.jpg';
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  // Strapi upload plugin accepts a temp file or a stream. Use the upload
  // service's add() to register the asset; the configured Cloudinary
  // provider does the actual push.
  const fileService = strapi.plugin('upload').service('upload');
  const uploaded = await fileService.upload({
    data: {},
    files: {
      path: '',
      name: filename,
      type: mime,
      size: buffer.length,
      stream: Readable.from(buffer),
      buffer,
    },
  });

  const created = Array.isArray(uploaded) ? uploaded[0] : uploaded;
  return created?.id ?? null;
}

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  /**
   * GET /products/csv-template — returns the canonical CSV template.
   */
  async csvTemplate(ctx: any) {
    const sample = [
      'Avocado (Hass)',
      'Locally grown ripe Hass avocado',
      '4500',
      'piece',
      '<paste-category-documentId-here>',
      'https://res.cloudinary.com/<cloud_name>/image/upload/...avocado.jpg',
    ]
      .map((c) => (c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c))
      .join(',');

    ctx.set('Content-Type', 'text/csv; charset=utf-8');
    ctx.set('Content-Disposition', 'attachment; filename="products-template.csv"');
    ctx.body = `${TEMPLATE_HEADERS.join(',')}\n${sample}\n`;
  },

  /**
   * POST /products/bulk-import — admin only.
   * Body: { csv: "<raw csv text>" }
   * Returns: { created, skipped, errors: [{ row, error }] }
   *
   * Image URLs go through the Cloudinary allowlist OR are imported through
   * Strapi's upload plugin (which routes them to our Cloudinary tenant).
   * Hard cap of 200 rows per request to keep the request bounded; chunk
   * larger imports client-side.
   */
  async bulkImport(ctx: any) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized('Authentication required');

    const requester: any = await strapi.db.query('api::user.user').findOne({
      where: { phone: authUser.username },
    });
    if (!requester || requester.user_type !== 'admin') {
      return ctx.forbidden('Admin only');
    }

    const csv = ctx.request.body?.csv;
    if (typeof csv !== 'string' || csv.trim().length === 0) {
      return ctx.badRequest('csv field (raw text) is required');
    }

    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return ctx.badRequest('CSV must include a header row and at least one product row');
    }

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const expected = TEMPLATE_HEADERS.map((h) => h.toLowerCase());
    const missing = expected.filter((h) => !headers.includes(h) && h !== 'image_url');
    if (missing.length > 0) {
      return ctx.badRequest(`Missing required columns: ${missing.join(', ')}`);
    }

    const dataRows = rows.slice(1);
    if (dataRows.length > 200) {
      return ctx.badRequest('Max 200 rows per import. Split the file and try again.');
    }

    const idx = (col: string) => headers.indexOf(col);
    const maxImageBytes = parseInt(process.env.UPLOAD_MAX_BYTES ?? '', 10) || 10 * 1024 * 1024;

    let created = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const rowNumber = i + 2;
      const name = r[idx('name')]?.trim();
      const description = r[idx('description')]?.trim() ?? '';
      const priceRaw = r[idx('estimated_price')]?.trim();
      const unitsRaw = r[idx('common_units')]?.trim() ?? '';
      const categoryId = r[idx('category_id')]?.trim();
      const imageUrl = idx('image_url') >= 0 ? r[idx('image_url')]?.trim() : '';

      if (!name) {
        errors.push({ row: rowNumber, error: 'name is required' });
        continue;
      }
      const price = Number(priceRaw);
      if (!Number.isFinite(price) || price < 0) {
        errors.push({ row: rowNumber, error: 'estimated_price must be a positive number' });
        continue;
      }
      if (!categoryId) {
        errors.push({ row: rowNumber, error: 'category_id is required' });
        continue;
      }
      const category: any = await strapi.db
        .query('api::category.category')
        .findOne({ where: { documentId: categoryId } });
      if (!category) {
        errors.push({ row: rowNumber, error: `unknown category_id "${categoryId}"` });
        continue;
      }

      let imageId: number | null = null;
      if (imageUrl) {
        try {
          if (!isAllowedUploadUrl(imageUrl)) {
            errors.push({
              row: rowNumber,
              error: 'image_url must be a Cloudinary URL on our tenant',
            });
            continue;
          }
          imageId = await importImageFromUrl(strapi, imageUrl, maxImageBytes);
          if (!imageId) {
            errors.push({ row: rowNumber, error: 'image fetch failed' });
            continue;
          }
        } catch (err: any) {
          errors.push({
            row: rowNumber,
            error: `image fetch failed: ${err?.message ?? 'unknown'}`,
          });
          continue;
        }
      }

      const units = unitsRaw
        .split('|')
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      try {
        await strapi.entityService.create('api::product.product', {
          data: {
            name,
            description,
            estimated_price: price,
            common_units: units.length > 0 ? units : ['piece'],
            category: category.id,
            ...(imageId ? { image: imageId } : {}),
            is_active: true,
          },
        });
        created++;
      } catch (err: any) {
        errors.push({
          row: rowNumber,
          error: err?.message ?? 'create failed',
        });
      }
    }

    ctx.body = {
      data: {
        created,
        skipped: errors.length,
        total: dataRows.length,
        errors,
      },
    };
  },
}));
