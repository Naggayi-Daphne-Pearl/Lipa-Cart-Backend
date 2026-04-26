/**
 * Mirror of product-bulk-import.ts for the category content-type.
 * Headers: name, description, color, sort_order, is_active, image_filename,
 *          image_url.
 * No category dropdown needed — categories ARE the dropdown source. Slug is
 * derived from name on the server side (Strapi's uid attribute will fill it
 * automatically when omitted).
 */
import ExcelJS from 'exceljs';

export const TEMPLATE_HEADERS = [
  'name',
  'description',
  'color',
  'sort_order',
  'is_active',
  'image_filename',
  'image_url',
] as const;

export type TemplateRow = Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>>;

export type EmbeddedImage = { buffer: Buffer; mime: string; filename: string };

const SAMPLE_ROW: TemplateRow = {
  name: 'Vegetables',
  description: 'Fresh vegetables sourced from local markets',
  color: '#15874B',
  sort_order: '1',
  is_active: 'true',
  image_filename: 'vegetables.jpg',
  image_url: '',
};

export async function generateTemplate(
  prefilledRows: TemplateRow[] = [SAMPLE_ROW],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LipaCart Admin';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Categories');
  sheet.columns = TEMPLATE_HEADERS.map((h) => ({
    header: h,
    key: h,
    width: h === 'description' || h === 'image_url' ? 36 : 20,
  }));
  for (const row of prefilledRows) {
    sheet.addRow(row);
  }

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE3F5EC' },
  };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseWorkbook(buffer: Buffer): Promise<{
  rows: TemplateRow[];
  rowNumbers: number[];
  embeddedImagesByRow: Map<number, EmbeddedImage>;
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheets');

  const headerRow = sheet.getRow(1).values as Array<string | undefined>;
  const headers = headerRow.slice(1).map((h) => (h ?? '').toString().trim().toLowerCase());

  if (!headers.includes('name')) {
    throw new Error('Missing required column "name"');
  }

  const rows: TemplateRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const raw = sheet.getRow(r).values as Array<unknown>;
    if (!raw || raw.length <= 1) continue;
    const row: TemplateRow = {};
    let allBlank = true;
    headers.forEach((h, i) => {
      const v = raw[i + 1];
      if (v === null || v === undefined) return;
      const s = typeof v === 'object' && (v as any).text ? String((v as any).text) : String(v);
      const trimmed = s.trim();
      if (trimmed.length === 0) return;
      (row as any)[h] = trimmed;
      allBlank = false;
    });
    if (!allBlank) {
      rows.push(row);
      rowNumbers.push(r);
    }
  }

  const embeddedImagesByRow = extractEmbeddedImages(wb, sheet);

  return { rows, rowNumbers, embeddedImagesByRow };
}

/** Pull pasted/embedded images from a worksheet, keyed by 1-based anchor row. */
export function extractEmbeddedImages(
  wb: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
): Map<number, EmbeddedImage> {
  const out = new Map<number, EmbeddedImage>();
  try {
    const images = sheet.getImages() as Array<{
      imageId: string;
      range: { tl: { row: number; col: number } };
    }>;
    for (const img of images) {
      const media = wb.getImage(parseInt(img.imageId, 10) as any) as any;
      if (!media?.buffer) continue;
      const ext = (media.extension ?? '').toString().toLowerCase();
      const mime =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'gif'
              ? 'image/gif'
              : 'image/jpeg';
      const filename = (media.name ? `${media.name}.${ext || 'jpg'}` : 'pasted.jpg').toString();
      // ExcelJS anchor rows are zero-based; +1 to align with Excel row numbers.
      const rowNumber = (img.range?.tl?.row ?? 0) + 1;
      out.set(rowNumber, {
        buffer: Buffer.isBuffer(media.buffer) ? media.buffer : Buffer.from(media.buffer),
        mime,
        filename,
      });
    }
  } catch (_) {
    // Best-effort — malformed workbook drawings should not block row parsing.
  }
  return out;
}
