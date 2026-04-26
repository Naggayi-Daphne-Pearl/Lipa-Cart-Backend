import { factories } from '@strapi/strapi';
import { isAllowedUploadUrl } from '../../../services/upload-url-allowlist';
import {
  readFile,
  uploadBufferToCloudinary,
  fetchRemoteImageBuffer,
  parseDryRun,
  maxImageBytes,
} from '../../../services/bulk-import-helpers';
import { requireAdmin } from '../../../services/auth-helper';
import { generateTemplate, parseWorkbook, TemplateRow } from '../../../services/recipe-bulk-import';
import { extractZipImages } from '../../../services/product-bulk-import';

const defaultRecipePopulate = {
  image: true,
  ingredients: {
    populate: {
      product: {
        populate: { image: true },
      },
    },
  },
  instructions: true,
};

const CATEGORY_TAG_PREFIX = 'category:';

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((t) => String(t).trim()).filter((t) => t.length > 0);
  }
  if (typeof input === 'string') {
    return input
      .split('|')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  return [];
}

function normalizeCategory(input: unknown): string | null {
  const v = String(input ?? '').trim();
  return v.length > 0 ? v : null;
}

function extractCategoryFromTags(tagsInput: unknown): string | null {
  const tags = normalizeTags(tagsInput);
  const categoryTag = tags.find((t) => t.toLowerCase().startsWith(CATEGORY_TAG_PREFIX));
  if (!categoryTag) return null;
  const value = categoryTag.slice(CATEGORY_TAG_PREFIX.length).trim();
  return value.length > 0 ? value : null;
}

function upsertCategoryTag(tagsInput: unknown, category: string | null): string[] {
  const tags = normalizeTags(tagsInput).filter(
    (t) => !t.toLowerCase().startsWith(CATEGORY_TAG_PREFIX),
  );
  if (category) {
    tags.push(`${CATEGORY_TAG_PREFIX}${category}`);
  }
  return tags;
}

function normalizeDifficulty(input: unknown): 'easy' | 'medium' | 'hard' {
  const value = String(input ?? 'medium')
    .trim()
    .toLowerCase();
  if (value === 'easy' || value === 'hard') {
    return value;
  }
  return 'medium';
}

function toAdminRecipeDto(recipe: any) {
  const tags = normalizeTags(recipe?.tags);
  const category = extractCategoryFromTags(tags);
  const ingredients = (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).map(
    (ing: any) => ({
      name: String(ing?.name ?? ''),
      quantity: ing?.quantity ?? null,
      unit: String(ing?.unit ?? ''),
      notes: String(ing?.notes ?? ''),
      is_optional: Boolean(ing?.is_optional),
      product_document_id: ing?.product?.documentId ?? null,
      product_name: ing?.product?.name ?? null,
    }),
  );
  const instructions = (Array.isArray(recipe?.instructions) ? recipe.instructions : [])
    .map((ins: any, idx: number) => ({
      step_number: Number(ins?.step_number ?? idx + 1),
      description: String(ins?.description ?? ''),
      duration_minutes: ins?.duration_minutes ?? null,
    }))
    .sort((a: any, b: any) => a.step_number - b.step_number);

  return {
    ...(recipe ?? {}),
    title: recipe?.name ?? '',
    category,
    tags: tags.filter((t) => !t.toLowerCase().startsWith(CATEGORY_TAG_PREFIX)),
    ingredients,
    instructions,
  };
}

export default factories.createCoreController('api::recipe.recipe', ({ strapi }) => ({
  async xlsxTemplate(ctx) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const buffer = await generateTemplate();
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', 'attachment; filename="recipes-template.xlsx"');
    ctx.body = buffer;
  },

  async xlsxExport(ctx) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const recipes: any[] = await strapi.db.query('api::recipe.recipe').findMany({
      select: [
        'name',
        'description',
        'author_name',
        'prep_time',
        'cook_time',
        'servings',
        'difficulty',
        'tags',
      ],
      populate: {
        image: { select: ['url'] },
        ingredients: { populate: { product: { select: ['name'] } } },
        instructions: true,
      },
      orderBy: { name: 'asc' },
      limit: 1000,
    });

    const rows: TemplateRow[] = recipes.map((r) => {
      const ingredientRows = (Array.isArray(r.ingredients) ? r.ingredients : []).map(
        (ing: any) => ({
          name: (ing?.name ?? '').toString(),
          quantity: ing?.quantity != null ? Number(ing.quantity) : undefined,
          unit: (ing?.unit ?? '').toString(),
          notes: (ing?.notes ?? '').toString(),
          product_name: (ing?.product?.name ?? '').toString(),
          is_optional: Boolean(ing?.is_optional),
        }),
      );

      const instructionRows = (Array.isArray(r.instructions) ? r.instructions : [])
        .map((ins: any, idx: number) => ({
          step_number: Number(ins?.step_number ?? idx + 1),
          description: (ins?.description ?? '').toString(),
          duration_minutes:
            ins?.duration_minutes != null ? Number(ins.duration_minutes) : undefined,
        }))
        .sort((a: any, b: any) => Number(a.step_number) - Number(b.step_number));

      const tags = Array.isArray(r.tags) ? r.tags.map((t: any) => t.toString()).join('|') : '';

      return {
        name: (r.name ?? '').toString(),
        description: (r.description ?? '').toString(),
        author_name: (r.author_name ?? '').toString(),
        prep_time: r.prep_time != null ? r.prep_time.toString() : '',
        cook_time: r.cook_time != null ? r.cook_time.toString() : '',
        servings: r.servings != null ? r.servings.toString() : '',
        difficulty: (r.difficulty ?? 'medium').toString(),
        tags,
        ingredients_json: JSON.stringify(ingredientRows),
        instructions_json: JSON.stringify(instructionRows),
        image_filename: '',
        image_url: (r.image?.url ?? '').toString(),
      } as TemplateRow;
    });

    const buffer = await generateTemplate(rows);
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set(
      'Content-Disposition',
      `attachment; filename="recipes-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    ctx.body = buffer;
  },

  async bulkImport(ctx) {
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

    const products: any[] = await strapi.db.query('api::product.product').findMany({
      select: ['id', 'name'],
      where: { is_active: true },
      limit: 5000,
    });
    const productByName = new Map<string, number>();
    for (const p of products) {
      const key = (p.name as string)?.trim().toLowerCase();
      if (key && !productByName.has(key)) {
        productByName.set(key, p.id);
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

      const prepRaw = row.prep_time?.trim() ?? '';
      const prepTime = prepRaw ? Number(prepRaw) : 0;
      if (!Number.isFinite(prepTime) || prepTime < 0) {
        errors.push({ row: rowNumber, error: 'prep_time must be a non-negative number' });
        continue;
      }

      const cookRaw = row.cook_time?.trim() ?? '';
      const cookTime = cookRaw ? Number(cookRaw) : 0;
      if (!Number.isFinite(cookTime) || cookTime < 0) {
        errors.push({ row: rowNumber, error: 'cook_time must be a non-negative number' });
        continue;
      }

      const servingsRaw = row.servings?.trim() ?? '';
      const servings = servingsRaw ? Number(servingsRaw) : 1;
      if (!Number.isFinite(servings) || servings <= 0) {
        errors.push({ row: rowNumber, error: 'servings must be a positive number' });
        continue;
      }

      const difficultyRaw = (row.difficulty?.trim().toLowerCase() ?? 'medium') as
        | 'easy'
        | 'medium'
        | 'hard';
      if (!['easy', 'medium', 'hard'].includes(difficultyRaw)) {
        errors.push({ row: rowNumber, error: 'difficulty must be easy, medium, or hard' });
        continue;
      }

      let ingredientItems: any[];
      try {
        ingredientItems = JSON.parse(row.ingredients_json?.trim() ?? '[]');
      } catch {
        errors.push({ row: rowNumber, error: 'ingredients_json must be valid JSON array' });
        continue;
      }
      if (!Array.isArray(ingredientItems) || ingredientItems.length === 0) {
        errors.push({ row: rowNumber, error: 'ingredients_json must contain at least one item' });
        continue;
      }

      const ingredients: Array<{
        name: string;
        quantity?: number;
        unit?: string;
        notes?: string;
        is_optional?: boolean;
        product: number;
      }> = [];

      let ingredientError: string | null = null;
      for (let idx = 0; idx < ingredientItems.length; idx++) {
        const ing = ingredientItems[idx] ?? {};
        const ingredientName = String(ing.name ?? '').trim();
        const productName = String(ing.product_name ?? '').trim();

        if (!ingredientName) {
          ingredientError = `ingredients_json[${idx}].name is required`;
          break;
        }
        if (!productName) {
          ingredientError = `ingredients_json[${idx}].product_name is required`;
          break;
        }

        const productId = productByName.get(productName.toLowerCase());
        if (!productId) {
          ingredientError = `ingredients_json[${idx}] product "${productName}" not found among active products`;
          break;
        }

        const quantityValue =
          ing.quantity == null || String(ing.quantity).trim() === ''
            ? undefined
            : Number(ing.quantity);

        if (quantityValue != null && (!Number.isFinite(quantityValue) || quantityValue < 0)) {
          ingredientError = `ingredients_json[${idx}].quantity must be a non-negative number`;
          break;
        }

        ingredients.push({
          name: ingredientName,
          quantity: quantityValue,
          unit: String(ing.unit ?? '').trim() || undefined,
          notes: String(ing.notes ?? '').trim() || undefined,
          is_optional: Boolean(ing.is_optional),
          product: productId,
        });
      }

      if (ingredientError) {
        errors.push({ row: rowNumber, error: ingredientError });
        continue;
      }

      let instructionItems: any[];
      try {
        instructionItems = JSON.parse(row.instructions_json?.trim() ?? '[]');
      } catch {
        errors.push({ row: rowNumber, error: 'instructions_json must be valid JSON array' });
        continue;
      }

      if (!Array.isArray(instructionItems) || instructionItems.length === 0) {
        errors.push({ row: rowNumber, error: 'instructions_json must contain at least one item' });
        continue;
      }

      const instructions: Array<{
        step_number: number;
        description: string;
        duration_minutes?: number;
      }> = [];
      let instructionError: string | null = null;
      for (let idx = 0; idx < instructionItems.length; idx++) {
        const raw = instructionItems[idx];
        const description =
          typeof raw === 'string' ? raw.trim() : String(raw?.description ?? '').trim();
        if (!description) {
          instructionError = `instructions_json[${idx}].description is required`;
          break;
        }

        const stepRaw =
          typeof raw === 'object' && raw?.step_number != null ? Number(raw.step_number) : idx + 1;
        if (!Number.isFinite(stepRaw) || stepRaw <= 0) {
          instructionError = `instructions_json[${idx}].step_number must be a positive number`;
          break;
        }

        const durationRaw =
          typeof raw === 'object' && raw?.duration_minutes != null
            ? Number(raw.duration_minutes)
            : undefined;
        if (durationRaw != null && (!Number.isFinite(durationRaw) || durationRaw < 0)) {
          instructionError = `instructions_json[${idx}].duration_minutes must be a non-negative number`;
          break;
        }

        instructions.push({
          step_number: Math.trunc(stepRaw),
          description,
          duration_minutes: durationRaw == null ? undefined : Math.trunc(durationRaw),
        });
      }

      if (instructionError) {
        errors.push({ row: rowNumber, error: instructionError });
        continue;
      }

      instructions.sort((a, b) => a.step_number - b.step_number);

      const tags = (row.tags?.trim() ?? '')
        .split('|')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

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
        await strapi.entityService.create('api::recipe.recipe', {
          data: {
            name,
            description: row.description?.trim() ?? '',
            author_name: row.author_name?.trim() ?? '',
            prep_time: Math.trunc(prepTime),
            cook_time: Math.trunc(cookTime),
            servings: Math.trunc(servings),
            difficulty: difficultyRaw,
            ingredients,
            instructions,
            tags,
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

  async adminList(ctx) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const search = String(ctx.query?.search ?? '')
      .trim()
      .toLowerCase();
    const categoryFilter = normalizeCategory(ctx.query?.category);

    const recipes: any[] = await strapi.db.query('api::recipe.recipe').findMany({
      populate: defaultRecipePopulate,
      orderBy: { createdAt: 'desc' },
      limit: 1000,
    });

    const filtered = recipes.filter((recipe) => {
      const category = extractCategoryFromTags(recipe?.tags);
      const matchesCategory = !categoryFilter || category === categoryFilter;
      if (!matchesCategory) return false;

      if (!search) return true;

      const haystack = [
        String(recipe?.name ?? ''),
        String(recipe?.description ?? ''),
        category ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });

    ctx.body = {
      data: filtered.map((r) => toAdminRecipeDto(r)),
      meta: { total: filtered.length },
    };
  },

  async adminFindOne(ctx) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const { id } = ctx.params;
    const recipe: any = await strapi.db.query('api::recipe.recipe').findOne({
      where: { documentId: id },
      populate: defaultRecipePopulate,
    });

    if (!recipe) return ctx.notFound('Recipe not found');

    ctx.body = { data: toAdminRecipeDto(recipe) };
  },

  async adminCreate(ctx) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const body = (ctx.request.body?.data ?? ctx.request.body ?? {}) as any;
    const title = String(body.title ?? body.name ?? '').trim();
    if (!title) return ctx.badRequest('title is required');
    const description = String(body.description ?? '').trim();
    if (!description) return ctx.badRequest('description is required');
    const category = normalizeCategory(body.category);
    if (!category) return ctx.badRequest('category is required');

    const products: any[] = await strapi.db.query('api::product.product').findMany({
      select: ['id', 'name', 'documentId'],
      where: { is_active: true },
      limit: 5000,
    });
    const productByDocumentId = new Map<string, number>();
    const productByName = new Map<string, number>();
    for (const p of products) {
      const docId = String(p.documentId ?? '').trim();
      const name = String(p.name ?? '')
        .trim()
        .toLowerCase();
      if (docId) productByDocumentId.set(docId, p.id);
      if (name && !productByName.has(name)) productByName.set(name, p.id);
    }

    const ingredientsInput = Array.isArray(body.ingredients) ? body.ingredients : [];
    const ingredients: any[] = [];
    for (let idx = 0; idx < ingredientsInput.length; idx++) {
      const ing = ingredientsInput[idx] ?? {};
      const ingName = String(ing.name ?? '').trim();
      if (!ingName) return ctx.badRequest(`ingredients[${idx}].name is required`);

      const docId = String(ing.product_document_id ?? '').trim();
      const productName = String(ing.product_name ?? '')
        .trim()
        .toLowerCase();

      let linkedProductId: number | undefined;
      if (docId) linkedProductId = productByDocumentId.get(docId);
      else if (productName) linkedProductId = productByName.get(productName);

      if (docId || productName) {
        if (!linkedProductId) {
          return ctx.badRequest(`ingredients[${idx}] product reference is invalid or not active`);
        }
      }

      const quantity =
        ing.quantity == null || String(ing.quantity).trim() === ''
          ? undefined
          : Number(ing.quantity);
      if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
        return ctx.badRequest(`ingredients[${idx}].quantity must be a non-negative number`);
      }

      ingredients.push({
        name: ingName,
        quantity,
        unit: String(ing.unit ?? '').trim() || undefined,
        notes: String(ing.notes ?? '').trim() || undefined,
        is_optional: Boolean(ing.is_optional),
        ...(linkedProductId ? { product: linkedProductId } : {}),
      });
    }

    const instructionsInput = Array.isArray(body.instructions) ? body.instructions : [];
    if (instructionsInput.length === 0) {
      return ctx.badRequest('instructions must contain at least one step');
    }

    let instructions: Array<{
      step_number: number;
      description: string;
      duration_minutes?: number;
    }>;
    try {
      instructions = instructionsInput.map((step: any, idx: number) => {
        const stepDescription =
          typeof step === 'string' ? step.trim() : String(step?.description ?? '').trim();
        if (!stepDescription) {
          throw new Error(`instructions[${idx}].description is required`);
        }
        const stepNumber =
          typeof step === 'object' && step?.step_number != null
            ? Number(step.step_number)
            : idx + 1;
        if (!Number.isFinite(stepNumber) || stepNumber <= 0) {
          throw new Error(`instructions[${idx}].step_number must be a positive number`);
        }

        const duration =
          typeof step === 'object' && step?.duration_minutes != null
            ? Number(step.duration_minutes)
            : undefined;
        if (duration != null && (!Number.isFinite(duration) || duration < 0)) {
          throw new Error(`instructions[${idx}].duration_minutes must be a non-negative number`);
        }

        return {
          step_number: Math.trunc(stepNumber),
          description: stepDescription,
          duration_minutes: duration == null ? undefined : Math.trunc(duration),
        };
      });
    } catch (e: any) {
      return ctx.badRequest(String(e?.message ?? 'Invalid instructions payload'));
    }

    const tags = upsertCategoryTag(body.tags, category);

    try {
      const created = await strapi.entityService.create('api::recipe.recipe', {
        data: {
          name: title,
          description,
          author_name: String(body.author_name ?? '').trim(),
          prep_time: Number(body.prep_time ?? 0) || 0,
          cook_time: Number(body.cook_time ?? 0) || 0,
          servings: Number(body.servings ?? 1) || 1,
          difficulty: normalizeDifficulty(body.difficulty),
          ingredients,
          instructions,
          tags,
          ...(body.image ? { image: body.image } : {}),
          publishedAt: new Date(),
        },
        populate: defaultRecipePopulate,
      });

      ctx.body = { data: toAdminRecipeDto(created) };
    } catch (err: any) {
      const message = String(err?.message ?? 'create failed');
      if (
        message.includes('instructions[') ||
        message.includes('ValidationError') ||
        message.includes('Invalid') ||
        message.includes('required')
      ) {
        return ctx.badRequest(message);
      }
      ctx.throw(500, `Failed to create recipe: ${message}`);
    }
  },

  async adminUpdate(ctx) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const { id } = ctx.params;
    const existing: any = await strapi.db.query('api::recipe.recipe').findOne({
      where: { documentId: id },
    });
    if (!existing) return ctx.notFound('Recipe not found');

    const body = (ctx.request.body?.data ?? ctx.request.body ?? {}) as any;

    const products: any[] = await strapi.db.query('api::product.product').findMany({
      select: ['id', 'name', 'documentId'],
      where: { is_active: true },
      limit: 5000,
    });
    const productByDocumentId = new Map<string, number>();
    const productByName = new Map<string, number>();
    for (const p of products) {
      const docId = String(p.documentId ?? '').trim();
      const name = String(p.name ?? '')
        .trim()
        .toLowerCase();
      if (docId) productByDocumentId.set(docId, p.id);
      if (name && !productByName.has(name)) productByName.set(name, p.id);
    }

    const data: any = {};

    if (body.title != null || body.name != null) {
      const title = String(body.title ?? body.name ?? '').trim();
      if (!title) return ctx.badRequest('title cannot be empty');
      data.name = title;
    }

    if (body.description != null) data.description = String(body.description ?? '').trim();
    if (body.author_name != null) data.author_name = String(body.author_name ?? '').trim();
    if (body.prep_time != null) data.prep_time = Number(body.prep_time) || 0;
    if (body.cook_time != null) data.cook_time = Number(body.cook_time) || 0;
    if (body.servings != null) data.servings = Number(body.servings) || 1;
    if (body.difficulty != null) data.difficulty = normalizeDifficulty(body.difficulty);
    if (body.image != null) data.image = body.image;

    if (body.tags != null || body.category != null) {
      const baseTags = body.tags != null ? body.tags : existing.tags;
      data.tags = upsertCategoryTag(baseTags, normalizeCategory(body.category));
    }

    if (body.ingredients != null) {
      if (!Array.isArray(body.ingredients)) {
        return ctx.badRequest('ingredients must be an array');
      }
      const ingredients: any[] = [];
      for (let idx = 0; idx < body.ingredients.length; idx++) {
        const ing = body.ingredients[idx] ?? {};
        const ingName = String(ing.name ?? '').trim();
        if (!ingName) return ctx.badRequest(`ingredients[${idx}].name is required`);

        const docId = String(ing.product_document_id ?? '').trim();
        const productName = String(ing.product_name ?? '')
          .trim()
          .toLowerCase();

        let linkedProductId: number | undefined;
        if (docId) linkedProductId = productByDocumentId.get(docId);
        else if (productName) linkedProductId = productByName.get(productName);

        if (docId || productName) {
          if (!linkedProductId) {
            return ctx.badRequest(`ingredients[${idx}] product reference is invalid or not active`);
          }
        }

        const quantity =
          ing.quantity == null || String(ing.quantity).trim() === ''
            ? undefined
            : Number(ing.quantity);
        if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
          return ctx.badRequest(`ingredients[${idx}].quantity must be a non-negative number`);
        }

        ingredients.push({
          name: ingName,
          quantity,
          unit: String(ing.unit ?? '').trim() || undefined,
          notes: String(ing.notes ?? '').trim() || undefined,
          is_optional: Boolean(ing.is_optional),
          ...(linkedProductId ? { product: linkedProductId } : {}),
        });
      }
      data.ingredients = ingredients;
    }

    if (body.instructions != null) {
      if (!Array.isArray(body.instructions) || body.instructions.length === 0) {
        return ctx.badRequest('instructions must contain at least one step');
      }
      try {
        data.instructions = body.instructions.map((step: any, idx: number) => {
          const description =
            typeof step === 'string' ? step.trim() : String(step?.description ?? '').trim();
          if (!description) {
            throw new Error(`instructions[${idx}].description is required`);
          }
          const stepNumber =
            typeof step === 'object' && step?.step_number != null
              ? Number(step.step_number)
              : idx + 1;
          if (!Number.isFinite(stepNumber) || stepNumber <= 0) {
            throw new Error(`instructions[${idx}].step_number must be a positive number`);
          }
          const duration =
            typeof step === 'object' && step?.duration_minutes != null
              ? Number(step.duration_minutes)
              : undefined;
          if (duration != null && (!Number.isFinite(duration) || duration < 0)) {
            throw new Error(`instructions[${idx}].duration_minutes must be a non-negative number`);
          }

          return {
            step_number: Math.trunc(stepNumber),
            description,
            duration_minutes: duration == null ? undefined : Math.trunc(duration),
          };
        });
      } catch (e: any) {
        return ctx.badRequest(String(e?.message ?? 'Invalid instructions payload'));
      }
    }

    const updated = await strapi.entityService.update('api::recipe.recipe', existing.id, {
      data,
      populate: defaultRecipePopulate,
    });

    ctx.body = { data: toAdminRecipeDto(updated) };
  },

  async adminDelete(ctx) {
    const admin = await requireAdmin(ctx, strapi);
    if (!admin) return;

    const { id } = ctx.params;
    const existing: any = await strapi.db.query('api::recipe.recipe').findOne({
      where: { documentId: id },
    });
    if (!existing) return ctx.notFound('Recipe not found');

    await strapi.entityService.delete('api::recipe.recipe', existing.id);
    ctx.body = { success: true };
  },

  async find(ctx) {
    ctx.query = ctx.query || {};
    if (!(ctx.query as any).populate) {
      (ctx.query as any).populate = defaultRecipePopulate as any;
    }

    return super.find(ctx);
  },

  async findOne(ctx) {
    ctx.query = ctx.query || {};
    if (!(ctx.query as any).populate) {
      (ctx.query as any).populate = defaultRecipePopulate as any;
    }

    return super.findOne(ctx);
  },
}));
