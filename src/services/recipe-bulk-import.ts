import ExcelJS from 'exceljs';

export const TEMPLATE_HEADERS = [
  'name',
  'description',
  'author_name',
  'prep_time',
  'cook_time',
  'servings',
  'difficulty',
  'tags',
  'ingredients_json',
  'instructions_json',
  'image_filename',
  'image_url',
] as const;

export type TemplateRow = Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>>;

export type EmbeddedImage = { buffer: Buffer; mime: string; filename: string };

const SAMPLE_ROW: TemplateRow = {
  name: 'Matoke Stew',
  description: 'Classic Ugandan matoke with beef stew',
  author_name: 'Chef LipaCart',
  prep_time: '20',
  cook_time: '45',
  servings: '4',
  difficulty: 'medium',
  tags: 'ugandan|dinner|stew',
  ingredients_json:
    '[{"name":"Matoke","quantity":1,"unit":"bunch","product_name":"Bananas (Matooke)","is_optional":false},{"name":"Tomatoes","quantity":4,"unit":"piece","product_name":"Tomatoes","is_optional":false}]',
  instructions_json:
    '[{"step_number":1,"description":"Peel and steam matoke","duration_minutes":25},{"step_number":2,"description":"Cook stew and serve","duration_minutes":20}]',
  image_filename: 'matoke-stew.jpg',
  image_url: '',
};

export async function generateTemplate(
  prefilledRows: TemplateRow[] = [SAMPLE_ROW],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LipaCart Admin';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Recipes');
  sheet.columns = TEMPLATE_HEADERS.map((h) => ({
    header: h,
    key: h,
    width:
      h === 'description'
        ? 36
        : h === 'ingredients_json' || h === 'instructions_json'
          ? 72
          : h === 'image_filename' || h === 'image_url'
            ? 28
            : 20,
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

  const required = ['name', 'ingredients_json', 'instructions_json'];
  for (const r of required) {
    if (!headers.includes(r)) {
      throw new Error(`Missing required column "${r}"`);
    }
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
      const rowNumber = (img.range?.tl?.row ?? 0) + 1;

      out.set(rowNumber, {
        buffer: Buffer.isBuffer(media.buffer) ? media.buffer : Buffer.from(media.buffer),
        mime,
        filename,
      });
    }
  } catch (_) {
    // Best-effort extraction.
  }

  return out;
}
