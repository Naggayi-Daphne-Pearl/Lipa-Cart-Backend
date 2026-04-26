/**
 * Helpers for the admin "bulk product import" flow:
 *   - generateTemplate(categoryNames) → Buffer of an .xlsx with a Products
 *     sheet, sample row, and a data-validation dropdown on category_name
 *     backed by a hidden _Categories sheet.
 *   - parseWorkbook(buffer) → header-keyed row maps.
 *   - extractZipImages(buffer) → Map<filename(lower), Buffer> for the optional
 *     companion .zip of product images.
 *
 * The controller composes these. They are pure functions so they can be unit
 * tested without spinning up Strapi.
 */
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import path from 'path';

export const TEMPLATE_HEADERS = [
  'name',
  'description',
  'estimated_price',
  'common_units',
  'category_name',
  'image_filename',
  'image_url',
] as const;

export type TemplateRow = Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>>;

const SAMPLE_ROW: TemplateRow = {
  name: 'Avocado (Hass)',
  description: 'Locally grown ripe Hass avocado',
  estimated_price: '4500',
  common_units: 'piece',
  category_name: '<pick from dropdown>',
  image_filename: 'avocado.jpg',
  image_url: '',
};

/**
 * Build an .xlsx with a dropdown-validated category_name column.
 * Pass the current list of category names so the dropdown stays in sync.
 */
export async function generateTemplate(categoryNames: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LipaCart Admin';
  wb.created = new Date();

  const products = wb.addWorksheet('Products');
  products.columns = TEMPLATE_HEADERS.map((h) => ({
    header: h,
    key: h,
    width: h === 'description' || h === 'image_url' ? 36 : 20,
  }));
  products.addRow(SAMPLE_ROW);

  // Header style.
  products.getRow(1).font = { bold: true };
  products.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE3F5EC' },
  };

  // Hidden sheet that backs the dropdown source so admins can't accidentally
  // edit the list. Keeps the generated workbook self-contained — no external
  // named ranges needed.
  const categories = wb.addWorksheet('_Categories');
  categories.state = 'veryHidden';
  categoryNames.forEach((name, i) => {
    categories.getCell(`A${i + 1}`).value = name;
  });

  // Apply Excel data validation to category_name column for rows 2–501.
  const colIndex = TEMPLATE_HEADERS.indexOf('category_name') + 1;
  const colLetter = products.getColumn(colIndex).letter;
  const lastCatRow = Math.max(categoryNames.length, 1);
  for (let r = 2; r <= 501; r++) {
    products.getCell(`${colLetter}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=_Categories!$A$1:$A$${lastCatRow}`],
      showErrorMessage: true,
      errorStyle: 'error',
      error: 'Pick a category from the list.',
      errorTitle: 'Unknown category',
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Parse the first worksheet of an uploaded .xlsx into header-keyed rows.
 * Throws if required headers are missing.
 */
export async function parseWorkbook(
  buffer: Buffer,
): Promise<{ rows: TemplateRow[]; rowNumbers: number[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheets');

  const headerRow = sheet.getRow(1).values as Array<string | undefined>;
  // ExcelJS row.values is 1-indexed; index 0 is always undefined.
  const headers = headerRow.slice(1).map((h) => (h ?? '').toString().trim().toLowerCase());

  const required = ['name', 'estimated_price', 'category_name'];
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
  return { rows, rowNumbers };
}

/**
 * Extract images from a companion .zip into a filename → buffer map (lowercased
 * keys for case-insensitive matching). Skips directories and non-image files.
 */
export function extractZipImages(buffer: Buffer): Map<string, { buffer: Buffer; mime: string }> {
  const zip = new AdmZip(buffer);
  const out = new Map<string, { buffer: Buffer; mime: string }>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = path.basename(entry.entryName);
    const ext = path.extname(name).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : null;
    if (!mime) continue; // skip non-image entries — we only want product photos
    out.set(name.toLowerCase(), { buffer: entry.getData(), mime });
  }
  return out;
}
