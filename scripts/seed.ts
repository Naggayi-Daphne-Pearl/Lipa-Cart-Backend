import type { Core } from '@strapi/strapi';
import fs from 'fs';
import path from 'path';

// ── Image upload helpers ────────────────────────────────────────────────
// Seed images live in public/uploads/. Filenames follow Strapi's
// `<basename>_<hash>.<ext>` convention, so we strip the trailing hash
// to index them by basename and look them up from each entity's slug
// (dashes → underscores).

// Note: Strapi always runs from the project root, so process.cwd() is stable.
// Avoid __dirname because it points into dist/scripts/ when compiled.
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

function buildLocalImageMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(UPLOADS_DIR)) return map;
  for (const file of fs.readdirSync(UPLOADS_DIR)) {
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    const base = file.replace(/_[a-f0-9]+\.[a-z]+$/i, '').toLowerCase();
    if (!map.has(base)) {
      map.set(base, path.join(UPLOADS_DIR, file));
    }
  }
  return map;
}

function slugToBaseName(slug: string): string {
  return slug.toLowerCase().replace(/-/g, '_');
}

// Slug → image basename aliases for seeds whose canonical file was renamed
// or shared with a sibling entity. Keeps the seed script resilient without
// forcing a rename of the existing public/uploads/ assets.
const IMAGE_BASENAME_ALIASES: Record<string, string> = {
  chicken: 'chicken_tikka_masala',
  beef: 'beef_stir_fry',
  bread_bakery: 'bread_loaf',
  milk_yogurt: 'fresh_milk_1l',
  fish_seafood: 'tilapia',
  rice_maize: 'grains_cereals',
  rice_1kg: 'grains_cereals',
  maize_flour_2kg: 'grains_cereals',
  eggs: 'dairy_eggs',
  eggs_tray_30: 'dairy_eggs',
  watermelon: 'fruits_vegetables',
  nakati: 'fruits_vegetables',
  sukuma_wiki: 'fruits_vegetables',
  coriander: 'fruits_vegetables',
  ginger: 'fruits_vegetables',
  fresh_fruits: 'fruits_vegetables',
  fresh_vegetables: 'fruits_vegetables',
  herbs_spices: 'fruits_vegetables',
  whole_chicken: 'chicken_tikka_masala',
  chicken_breast: 'chicken_tikka_masala',
  beef_stew_meat: 'beef_stir_fry',
  minced_beef: 'beef_stir_fry',
  luwombo_steamed_chicken_stew: 'chicken_tikka_masala',
  pilau: 'beef_stir_fry',
  posho_and_beans: 'grains_cereals',
};

function resolveLocalImage(slug: string, imageMap: Map<string, string>): string | null {
  const base = slugToBaseName(slug);
  if (imageMap.has(base)) return imageMap.get(base)!;

  const alias = IMAGE_BASENAME_ALIASES[base];
  if (alias && imageMap.has(alias)) return imageMap.get(alias)!;

  return null;
}

/// Uploads a local image and links it to a target entity's media field in
/// one atomic operation. We pass `ref`/`refId`/`field` to the upload service
/// so Strapi's upload plugin handles the morph join itself — calling
/// `strapi.documents().update({ image: id })` on top of a freshly uploaded
/// file triggers a delete-then-insert inside the Document API transaction
/// that aborts on Postgres for single-media fields.
async function attachSeedImage(
  strapi: Core.Strapi,
  uid: string,
  documentId: string,
  slug: string,
  imageMap: Map<string, string>,
): Promise<boolean> {
  const localPath = resolveLocalImage(slug, imageMap);
  if (!localPath) {
    console.log(`  🖼️  ${slug} ⚠️  no local file (skipping)`);
    return false;
  }

  // Upload plugin needs a numeric entity id, not a documentId.
  const entity = await (strapi.db.query as any)(uid).findOne({
    where: { documentId },
  });
  if (!entity) {
    console.log(`  🖼️  ${slug} ❌ entity not found for documentId=${documentId}`);
    return false;
  }

  try {
    const stats = fs.statSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    await (strapi as any)
      .plugin('upload')
      .service('upload')
      .upload({
        data: {
          fileInfo: {
            name: slug,
            alternativeText: slug,
            caption: slug,
          },
          ref: uid,
          refId: entity.id,
          field: 'image',
        },
        files: {
          filepath: localPath,
          originalFilename: path.basename(localPath),
          mimetype: mime,
          size: stats.size,
        },
      });
    return true;
  } catch (e) {
    console.log(`  🖼️  ${slug} ❌ upload failed: ${(e as Error).message}`);
    return false;
  }
}

// ── Categories ──
const categories = [
  {
    name: 'Fruits & Vegetables',
    slug: 'fruits-vegetables',
    description: 'Fresh fruits and vegetables sourced locally',
    color: '#4CAF50',
    sort_order: 1,
    is_active: true,
  },
  {
    name: 'Meat & Poultry',
    slug: 'meat-poultry',
    description: 'Fresh meat, chicken, and poultry products',
    color: '#E53935',
    sort_order: 2,
    is_active: true,
  },
  {
    name: 'Dairy & Eggs',
    slug: 'dairy-eggs',
    description: 'Milk, cheese, yogurt, and eggs',
    color: '#FFC107',
    sort_order: 3,
    is_active: true,
  },
  {
    name: 'Grains & Cereals',
    slug: 'grains-cereals',
    description: 'Rice, maize flour, wheat, and breakfast cereals',
    color: '#FF9800',
    sort_order: 4,
    is_active: true,
  },
  {
    name: 'Beverages',
    slug: 'beverages',
    description: 'Juices, water, sodas, and other drinks',
    color: '#2196F3',
    sort_order: 5,
    is_active: true,
  },
  {
    name: 'Household & Cleaning',
    slug: 'household-cleaning',
    description: 'Cleaning supplies and household essentials',
    color: '#9C27B0',
    sort_order: 6,
    is_active: true,
  },
];

const subcategories = [
  { name: 'Fresh Fruits', slug: 'fresh-fruits', categorySlug: 'fruits-vegetables', sort_order: 1 },
  {
    name: 'Fresh Vegetables',
    slug: 'fresh-vegetables',
    categorySlug: 'fruits-vegetables',
    sort_order: 2,
  },
  {
    name: 'Herbs & Spices',
    slug: 'herbs-spices',
    categorySlug: 'fruits-vegetables',
    sort_order: 3,
  },
  { name: 'Chicken', slug: 'chicken', categorySlug: 'meat-poultry', sort_order: 1 },
  { name: 'Beef', slug: 'beef', categorySlug: 'meat-poultry', sort_order: 2 },
  { name: 'Fish & Seafood', slug: 'fish-seafood', categorySlug: 'meat-poultry', sort_order: 3 },
  { name: 'Milk & Yogurt', slug: 'milk-yogurt', categorySlug: 'dairy-eggs', sort_order: 1 },
  { name: 'Eggs', slug: 'eggs', categorySlug: 'dairy-eggs', sort_order: 2 },
  { name: 'Rice & Maize', slug: 'rice-maize', categorySlug: 'grains-cereals', sort_order: 1 },
  { name: 'Bread & Bakery', slug: 'bread-bakery', categorySlug: 'grains-cereals', sort_order: 2 },
];

// ── Products (with descriptions and image URLs from frontend) ──
const products = [
  // Fruits
  {
    name: 'Bananas (Matooke)',
    slug: 'bananas-matooke',
    description:
      'Fresh green bananas for cooking. The staple food of Uganda — steam and mash for the perfect matoke.',
    estimated_price: 5000,
    common_units: ['bunch', 'kg', 'piece'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-fruits',
  },
  {
    name: 'Mangoes',
    slug: 'mangoes',
    description:
      'Sweet, juicy mangoes sourced from local farms. Perfect for snacking or fresh juice.',
    estimated_price: 2000,
    common_units: ['piece', 'kg'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-fruits',
  },
  {
    name: 'Pineapple',
    slug: 'pineapple',
    description:
      'Ripe, sweet pineapple from Eastern Uganda. Great for juice, desserts, or eating fresh.',
    estimated_price: 3000,
    common_units: ['piece'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-fruits',
  },
  {
    name: 'Watermelon',
    slug: 'watermelon',
    description: 'Large, refreshing watermelon. Perfect for hot days and fresh juice.',
    estimated_price: 8000,
    common_units: ['piece', 'half'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-fruits',
  },
  {
    name: 'Passion Fruit',
    slug: 'passion-fruit',
    description: 'Tangy passion fruit for fresh juice or desserts. Rich in vitamins.',
    estimated_price: 500,
    common_units: ['piece', 'kg'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-fruits',
  },
  // Vegetables
  {
    name: 'Tomatoes',
    slug: 'tomatoes',
    description: 'Ripe red tomatoes from local farms. Perfect for salads, cooking, and sauces.',
    estimated_price: 3000,
    common_units: ['kg', 'piece', 'tin'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-vegetables',
  },
  {
    name: 'Onions',
    slug: 'onions',
    description: 'Red onions perfect for cooking and salads. A kitchen essential.',
    estimated_price: 3500,
    common_units: ['kg', 'piece'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-vegetables',
  },
  {
    name: 'Cabbage',
    slug: 'cabbage',
    description: 'Fresh green cabbage. Great for salads, stir-fry, or steaming.',
    estimated_price: 2000,
    common_units: ['piece', 'half'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-vegetables',
  },
  {
    name: 'Nakati (African Nightshade)',
    slug: 'nakati',
    description:
      'Traditional Ugandan leafy green vegetable. Nutritious and delicious when steamed.',
    estimated_price: 1000,
    common_units: ['bunch'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-vegetables',
  },
  {
    name: 'Sukuma Wiki (Collard Greens)',
    slug: 'sukuma-wiki',
    description: 'Popular East African leafy greens. A staple side dish in Kenya and Uganda.',
    estimated_price: 1000,
    common_units: ['bunch'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'fresh-vegetables',
  },
  // Herbs
  {
    name: 'Coriander (Dania)',
    slug: 'coriander',
    description:
      'Fresh coriander leaves for garnishing and flavouring. Essential for East African cooking.',
    estimated_price: 500,
    common_units: ['bunch'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'herbs-spices',
  },
  {
    name: 'Ginger',
    slug: 'ginger',
    description: 'Fresh ginger root for tea, cooking, and natural remedies.',
    estimated_price: 2000,
    common_units: ['piece', 'kg'],
    categorySlug: 'fruits-vegetables',
    subcategorySlug: 'herbs-spices',
  },
  // Chicken
  {
    name: 'Whole Chicken',
    slug: 'whole-chicken',
    description: 'Fresh whole chicken, locally raised. Perfect for roasting or stewing.',
    estimated_price: 18000,
    common_units: ['piece'],
    categorySlug: 'meat-poultry',
    subcategorySlug: 'chicken',
  },
  {
    name: 'Chicken Breast',
    slug: 'chicken-breast',
    description: 'Boneless chicken breast. Lean, versatile, and great for grilling or stir-fry.',
    estimated_price: 12000,
    common_units: ['kg', 'piece'],
    categorySlug: 'meat-poultry',
    subcategorySlug: 'chicken',
  },
  // Beef
  {
    name: 'Beef Stew Meat',
    slug: 'beef-stew-meat',
    description: 'Tender beef chunks ideal for slow-cooked stews and curries.',
    estimated_price: 15000,
    common_units: ['kg'],
    categorySlug: 'meat-poultry',
    subcategorySlug: 'beef',
  },
  {
    name: 'Minced Beef',
    slug: 'minced-beef',
    description: 'Freshly minced beef. Perfect for samosas, bolognese, or chapati fillings.',
    estimated_price: 16000,
    common_units: ['kg'],
    categorySlug: 'meat-poultry',
    subcategorySlug: 'beef',
  },
  // Fish
  {
    name: 'Tilapia',
    slug: 'tilapia',
    description: 'Freshly caught tilapia from Lake Victoria. Perfect for grilling or frying.',
    estimated_price: 12000,
    common_units: ['piece', 'kg'],
    categorySlug: 'meat-poultry',
    subcategorySlug: 'fish-seafood',
  },
  {
    name: 'Nile Perch',
    slug: 'nile-perch',
    description: 'Premium Nile Perch fillet from Lake Victoria. A Ugandan delicacy.',
    estimated_price: 18000,
    common_units: ['kg'],
    categorySlug: 'meat-poultry',
    subcategorySlug: 'fish-seafood',
  },
  // Dairy
  {
    name: 'Fresh Milk (1L)',
    slug: 'fresh-milk-1l',
    description: 'Pasteurized fresh milk from local dairy farms.',
    estimated_price: 3500,
    common_units: ['litre', 'packet'],
    categorySlug: 'dairy-eggs',
    subcategorySlug: 'milk-yogurt',
  },
  {
    name: 'Yogurt (500ml)',
    slug: 'yogurt-500ml',
    description: 'Creamy natural yogurt. Great for breakfast or as a snack.',
    estimated_price: 3000,
    common_units: ['piece'],
    categorySlug: 'dairy-eggs',
    subcategorySlug: 'milk-yogurt',
  },
  // Eggs
  {
    name: 'Eggs (Tray of 30)',
    slug: 'eggs-tray-30',
    description: 'Fresh eggs from free-range chickens. A kitchen essential.',
    estimated_price: 12000,
    common_units: ['tray', 'piece'],
    categorySlug: 'dairy-eggs',
    subcategorySlug: 'eggs',
  },
  // Grains
  {
    name: 'Rice (1kg)',
    slug: 'rice-1kg',
    description: 'High-quality long grain rice for everyday meals.',
    estimated_price: 5000,
    common_units: ['kg'],
    categorySlug: 'grains-cereals',
    subcategorySlug: 'rice-maize',
  },
  {
    name: 'Maize Flour (Posho) 2kg',
    slug: 'maize-flour-2kg',
    description: 'Fine maize flour for making posho/ugali. A staple across East Africa.',
    estimated_price: 4000,
    common_units: ['kg', 'packet'],
    categorySlug: 'grains-cereals',
    subcategorySlug: 'rice-maize',
  },
  {
    name: 'Bread (Loaf)',
    slug: 'bread-loaf',
    description: 'Freshly baked white bread loaf. Perfect for breakfast or sandwiches.',
    estimated_price: 5000,
    common_units: ['loaf'],
    categorySlug: 'grains-cereals',
    subcategorySlug: 'bread-bakery',
  },
  // Beverages
  {
    name: 'Mineral Water (1.5L)',
    slug: 'mineral-water-1-5l',
    description: 'Pure mineral water. Stay hydrated throughout the day.',
    estimated_price: 1500,
    common_units: ['bottle'],
    categorySlug: 'beverages',
    subcategorySlug: null,
  },
  {
    name: 'Orange Juice (1L)',
    slug: 'orange-juice-1l',
    description: 'Fresh orange juice packed with vitamin C. No added sugars.',
    estimated_price: 5000,
    common_units: ['packet', 'bottle'],
    categorySlug: 'beverages',
    subcategorySlug: null,
  },
  // Household
  {
    name: 'Washing Soap (Bar)',
    slug: 'washing-soap-bar',
    description: 'Multipurpose washing soap bar for laundry and cleaning.',
    estimated_price: 2000,
    common_units: ['piece'],
    categorySlug: 'household-cleaning',
    subcategorySlug: null,
  },
  {
    name: 'Cooking Oil (1L)',
    slug: 'cooking-oil-1l',
    description: 'Vegetable cooking oil for everyday frying and cooking.',
    estimated_price: 8000,
    common_units: ['litre', 'bottle'],
    categorySlug: 'household-cleaning',
    subcategorySlug: null,
  },
];

// ── Recipes (Ugandan + East African + international) ──
const recipes = [
  {
    name: 'Luwombo (Steamed Chicken Stew)',
    slug: 'luwombo-steamed-chicken-stew',
    description:
      "**Luwombo** is a traditional Ugandan dish where chicken is steamed in banana leaves with groundnut sauce. It's a ceremonial favourite often served at special occasions.\n\n## Background\nOriginating from the Buganda Kingdom, Luwombo is considered a dish of honour.",
    author_name: 'Chef Aisha',
    prep_time: 30,
    cook_time: 90,
    servings: 6,
    difficulty: 'medium' as const,
    rating: 4.8,
    review_count: 42,
    tags: ['Traditional', 'Ugandan', 'Special Occasion'],
    ingredients: [
      { name: 'Whole Chicken', quantity: 1, unit: 'piece', notes: 'cut into pieces' },
      { name: 'Groundnut Paste', quantity: 200, unit: 'g', notes: null },
      { name: 'Tomatoes', quantity: 4, unit: 'piece', notes: 'chopped' },
      { name: 'Onions', quantity: 2, unit: 'piece', notes: 'sliced' },
      { name: 'Banana Leaves', quantity: 6, unit: 'piece', notes: 'for wrapping' },
      { name: 'Salt', quantity: 1, unit: 'tsp', notes: null },
    ],
    instructions: [
      {
        step_number: 1,
        description: 'Mix groundnut paste with a little water to form a smooth sauce.',
        duration_minutes: 5,
      },
      {
        step_number: 2,
        description: 'Season chicken pieces with salt and set aside.',
        duration_minutes: 5,
      },
      {
        step_number: 3,
        description: 'Soften banana leaves over an open flame until pliable.',
        duration_minutes: 10,
      },
      {
        step_number: 4,
        description:
          'Place chicken, tomatoes, onions, and groundnut sauce onto banana leaves. Wrap tightly into parcels.',
        duration_minutes: 10,
      },
      {
        step_number: 5,
        description:
          'Place parcels in a large pot with a little water at the bottom. Steam on low heat until chicken is tender.',
        duration_minutes: 90,
      },
    ],
  },
  {
    name: 'Rolex (Rolled Eggs)',
    slug: 'rolex-rolled-eggs',
    description:
      '**Rolex** is Uganda\'s beloved street food — a chapati rolled around a fried egg omelette with vegetables. The name comes from "rolled eggs". Quick, cheap, and delicious.',
    author_name: 'Street Food Joe',
    prep_time: 5,
    cook_time: 10,
    servings: 1,
    difficulty: 'easy' as const,
    rating: 4.9,
    review_count: 128,
    tags: ['Quick', 'Street Food', 'Ugandan', 'Budget'],
    ingredients: [
      { name: 'Chapati', quantity: 1, unit: 'piece', notes: null },
      { name: 'Eggs', quantity: 2, unit: 'piece', notes: null },
      { name: 'Tomatoes', quantity: 1, unit: 'piece', notes: 'diced' },
      { name: 'Onions', quantity: 0.5, unit: 'piece', notes: 'diced' },
      { name: 'Cabbage', quantity: 1, unit: 'handful', notes: 'shredded' },
      { name: 'Cooking Oil', quantity: 2, unit: 'tbsp', notes: null },
    ],
    instructions: [
      {
        step_number: 1,
        description:
          'Beat eggs and mix with diced tomatoes, onions, and cabbage. Season with salt.',
        duration_minutes: 3,
      },
      {
        step_number: 2,
        description: 'Heat oil in a pan and pour in the egg mixture. Cook as a flat omelette.',
        duration_minutes: 3,
      },
      {
        step_number: 3,
        description: 'Warm the chapati on the pan for 30 seconds each side.',
        duration_minutes: 1,
      },
      {
        step_number: 4,
        description: 'Place the omelette on the chapati and roll tightly. Serve immediately.',
        duration_minutes: 1,
      },
    ],
  },
  {
    name: 'Matoke (Steamed Green Bananas)',
    slug: 'matoke-steamed-green-bananas',
    description:
      '**Matoke** is the staple dish of Uganda — green bananas steamed and mashed, often served with a meat or groundnut sauce. Every Ugandan home has their own version.',
    author_name: 'Mama Grace',
    prep_time: 15,
    cook_time: 45,
    servings: 4,
    difficulty: 'easy' as const,
    rating: 4.6,
    review_count: 67,
    tags: ['Traditional', 'Ugandan', 'Staple', 'Vegetarian'],
    ingredients: [
      { name: 'Green Bananas (Matooke)', quantity: 1, unit: 'bunch', notes: 'peeled' },
      { name: 'Tomatoes', quantity: 3, unit: 'piece', notes: 'chopped' },
      { name: 'Onions', quantity: 1, unit: 'piece', notes: 'chopped' },
      { name: 'Cooking Oil', quantity: 3, unit: 'tbsp', notes: null },
      { name: 'Salt', quantity: 1, unit: 'tsp', notes: null },
      { name: 'Water', quantity: 500, unit: 'ml', notes: null },
    ],
    instructions: [
      {
        step_number: 1,
        description:
          'Peel the green bananas and place in a pot lined with banana leaves or a steamer.',
        duration_minutes: 10,
      },
      {
        step_number: 2,
        description:
          'Sauté onions in oil until golden, add tomatoes and cook until soft to make the sauce.',
        duration_minutes: 10,
      },
      {
        step_number: 3,
        description: 'Pour sauce over bananas, add water, cover tightly and steam on low heat.',
        duration_minutes: 40,
      },
      {
        step_number: 4,
        description: 'Mash the bananas in the pot until smooth. Serve hot.',
        duration_minutes: 5,
      },
    ],
  },
  {
    name: 'Chapati',
    slug: 'chapati',
    description:
      'Soft, layered flatbread perfect for scooping up stews and curries. A staple across East Africa, served with everything from beans to Luwombo.',
    author_name: 'Mama Njeri',
    prep_time: 40,
    cook_time: 30,
    servings: 8,
    difficulty: 'medium' as const,
    rating: 4.6,
    review_count: 198,
    tags: ['East African', 'Bread', 'Traditional', 'Vegetarian'],
    ingredients: [
      { name: 'All-Purpose Flour', quantity: 3, unit: 'cups', notes: null },
      { name: 'Cooking Oil', quantity: 0.5, unit: 'cup', notes: null },
      { name: 'Salt', quantity: 1, unit: 'tsp', notes: null },
      { name: 'Warm Water', quantity: 1, unit: 'cup', notes: null },
    ],
    instructions: [
      { step_number: 1, description: 'Mix flour and salt in a large bowl.', duration_minutes: 2 },
      { step_number: 2, description: 'Add oil and mix until crumbly.', duration_minutes: 3 },
      {
        step_number: 3,
        description: 'Gradually add warm water and knead into soft dough.',
        duration_minutes: 5,
      },
      { step_number: 4, description: 'Cover and rest for 30 minutes.', duration_minutes: 30 },
      {
        step_number: 5,
        description: 'Divide into 8 balls and roll each into a thin circle.',
        duration_minutes: 5,
      },
      { step_number: 6, description: 'Brush with oil, fold, and roll again.', duration_minutes: 5 },
      {
        step_number: 7,
        description: 'Cook on hot pan, turning and brushing with oil until golden.',
        duration_minutes: 15,
      },
      { step_number: 8, description: 'Stack and cover to keep warm.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Pilau',
    slug: 'pilau',
    description:
      'Aromatic Swahili spiced rice dish with tender meat. A coastal East African favourite with rich flavors from pilau masala spice blend.',
    author_name: 'Mama Fatuma',
    prep_time: 20,
    cook_time: 50,
    servings: 8,
    difficulty: 'medium' as const,
    rating: 4.8,
    review_count: 189,
    tags: ['East African', 'Rice', 'Swahili', 'One-Pot'],
    ingredients: [
      { name: 'Basmati Rice', quantity: 3, unit: 'cups', notes: null },
      { name: 'Beef Stew Meat', quantity: 500, unit: 'g', notes: null },
      { name: 'Onions', quantity: 3, unit: 'piece', notes: 'sliced' },
      { name: 'Garlic', quantity: 6, unit: 'cloves', notes: 'minced' },
      { name: 'Pilau Masala', quantity: 2, unit: 'tbsp', notes: null },
      { name: 'Potatoes', quantity: 2, unit: 'piece', notes: 'cubed (optional)' },
    ],
    instructions: [
      {
        step_number: 1,
        description: 'Wash rice and soak in water for 30 minutes, then drain.',
        duration_minutes: 30,
      },
      {
        step_number: 2,
        description: 'In a heavy pot, heat oil and fry sliced onions until deep brown.',
        duration_minutes: 10,
      },
      {
        step_number: 3,
        description: 'Add beef pieces and brown on all sides.',
        duration_minutes: 5,
      },
      {
        step_number: 4,
        description: 'Add garlic, ginger, and pilau masala. Stir for 2 minutes.',
        duration_minutes: 2,
      },
      {
        step_number: 5,
        description: 'Pour in water (double the amount of rice) and bring to boil.',
        duration_minutes: 5,
      },
      {
        step_number: 6,
        description: 'Add potatoes if using, then add the soaked rice.',
        duration_minutes: 2,
      },
      {
        step_number: 7,
        description: 'Reduce heat to low, cover tightly, and cook for 25 minutes.',
        duration_minutes: 25,
      },
      { step_number: 8, description: 'Fluff with fork and serve hot.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Posho & Beans',
    slug: 'posho-and-beans',
    description:
      'The everyday Ugandan meal — maize flour porridge served with stewed beans. Affordable, filling, and packed with protein. Found at every roadside restaurant.',
    author_name: 'Chef Kamau',
    prep_time: 10,
    cook_time: 25,
    servings: 4,
    difficulty: 'easy' as const,
    rating: 4.7,
    review_count: 312,
    tags: ['Ugandan', 'Vegetarian', 'Traditional', 'Quick', 'Budget'],
    ingredients: [
      { name: 'Maize Flour', quantity: 2, unit: 'cups', notes: null },
      { name: 'Beans', quantity: 2, unit: 'cups', notes: 'pre-soaked or canned' },
      { name: 'Onion', quantity: 1, unit: 'piece', notes: 'chopped' },
      { name: 'Tomatoes', quantity: 2, unit: 'piece', notes: 'chopped' },
      { name: 'Cooking Oil', quantity: 3, unit: 'tbsp', notes: null },
      { name: 'Salt', quantity: 1, unit: 'tsp', notes: null },
    ],
    instructions: [
      { step_number: 1, description: 'Boil 3 cups of water in a heavy pot.', duration_minutes: 5 },
      {
        step_number: 2,
        description: 'Gradually add maize flour while stirring continuously with a wooden spoon.',
        duration_minutes: 5,
      },
      {
        step_number: 3,
        description: 'Keep stirring until mixture thickens and pulls away from pot sides.',
        duration_minutes: 10,
      },
      {
        step_number: 4,
        description: 'For beans: heat oil and sauté onions until translucent.',
        duration_minutes: 3,
      },
      {
        step_number: 5,
        description: 'Add diced tomatoes and cook for 3 minutes.',
        duration_minutes: 3,
      },
      {
        step_number: 6,
        description: 'Add cooked beans and simmer for 10 minutes. Season with salt.',
        duration_minutes: 10,
      },
      { step_number: 7, description: 'Serve posho alongside the beans stew.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Chicken Tikka Masala',
    slug: 'chicken-tikka-masala',
    description:
      'Creamy, spiced tomato-based curry with tender chicken pieces. Popular in Kampala restaurants and a family favourite for special dinners.',
    author_name: 'Chef Patel',
    prep_time: 25,
    cook_time: 35,
    servings: 4,
    difficulty: 'medium' as const,
    rating: 4.8,
    review_count: 276,
    tags: ['Indian', 'Curry', 'Chicken', 'Creamy'],
    ingredients: [
      { name: 'Chicken Breast', quantity: 600, unit: 'g', notes: 'cubed' },
      { name: 'Yogurt', quantity: 1, unit: 'cup', notes: 'for marinade' },
      { name: 'Tomatoes', quantity: 400, unit: 'g', notes: 'canned or fresh, blended' },
      { name: 'Onion', quantity: 1, unit: 'piece', notes: 'diced' },
      { name: 'Garlic', quantity: 4, unit: 'cloves', notes: 'minced' },
      { name: 'Ginger', quantity: 1, unit: 'piece', notes: 'grated' },
    ],
    instructions: [
      {
        step_number: 1,
        description: 'Marinate chicken in yogurt and spices for at least 2 hours.',
        duration_minutes: 120,
      },
      {
        step_number: 2,
        description: 'Grill or pan-fry chicken until cooked through. Set aside.',
        duration_minutes: 10,
      },
      {
        step_number: 3,
        description: 'Sauté onions until golden, add garlic and ginger.',
        duration_minutes: 5,
      },
      {
        step_number: 4,
        description: 'Add tomato puree and cook for 10 minutes.',
        duration_minutes: 10,
      },
      {
        step_number: 5,
        description: 'Add chicken pieces and heat through for 5 minutes.',
        duration_minutes: 5,
      },
      {
        step_number: 6,
        description: 'Garnish with fresh coriander and serve with chapati or rice.',
        duration_minutes: 1,
      },
    ],
  },
  {
    name: 'Avocado Toast',
    slug: 'avocado-toast',
    description:
      'Simple, nutritious breakfast with creamy avocado on crusty bread. Uganda grows some of the best avocados — this is the easiest way to enjoy them.',
    author_name: 'Chef Sarah',
    prep_time: 5,
    cook_time: 5,
    servings: 2,
    difficulty: 'easy' as const,
    rating: 4.5,
    review_count: 156,
    tags: ['Breakfast', 'Quick', 'Healthy', 'Vegetarian'],
    ingredients: [
      { name: 'Avocado', quantity: 2, unit: 'piece', notes: 'ripe' },
      { name: 'Bread', quantity: 4, unit: 'slices', notes: 'toasted' },
      { name: 'Eggs', quantity: 2, unit: 'piece', notes: 'poached (optional)' },
      { name: 'Tomatoes', quantity: 2, unit: 'piece', notes: 'sliced (optional)' },
    ],
    instructions: [
      {
        step_number: 1,
        description: 'Toast bread slices until golden and crispy.',
        duration_minutes: 2,
      },
      {
        step_number: 2,
        description: 'Cut avocados in half and remove the pit.',
        duration_minutes: 1,
      },
      { step_number: 3, description: 'Scoop out flesh and mash with a fork.', duration_minutes: 1 },
      {
        step_number: 4,
        description: 'Season with salt, pepper, and a squeeze of lemon.',
        duration_minutes: 1,
      },
      { step_number: 5, description: 'Spread mashed avocado on toast.', duration_minutes: 1 },
      {
        step_number: 6,
        description: 'Top with poached egg and tomato slices if desired. Serve immediately.',
        duration_minutes: 1,
      },
    ],
  },
  {
    name: 'Fruit Smoothie Bowl',
    slug: 'fruit-smoothie-bowl',
    description:
      'Refreshing blend of tropical fruits topped with granola and fresh fruits. Perfect Kampala morning breakfast using local bananas and passion fruit.',
    author_name: 'Chef Lisa',
    prep_time: 10,
    cook_time: 0,
    servings: 2,
    difficulty: 'easy' as const,
    rating: 4.7,
    review_count: 142,
    tags: ['Breakfast', 'Healthy', 'Quick', 'Vegetarian'],
    ingredients: [
      { name: 'Bananas', quantity: 2, unit: 'piece', notes: 'frozen' },
      { name: 'Passion Fruit', quantity: 3, unit: 'piece', notes: 'pulp scooped out' },
      { name: 'Yogurt', quantity: 0.5, unit: 'cup', notes: null },
      { name: 'Honey', quantity: 2, unit: 'tbsp', notes: null },
      { name: 'Mangoes', quantity: 1, unit: 'piece', notes: 'sliced for topping' },
    ],
    instructions: [
      {
        step_number: 1,
        description: 'Add frozen bananas and passion fruit pulp to a blender.',
        duration_minutes: 2,
      },
      {
        step_number: 2,
        description: 'Add yogurt and blend until thick and smooth.',
        duration_minutes: 2,
      },
      { step_number: 3, description: 'Pour into bowls.', duration_minutes: 1 },
      {
        step_number: 4,
        description: 'Top with fresh mango slices, a drizzle of honey, and granola if available.',
        duration_minutes: 2,
      },
      { step_number: 5, description: 'Serve immediately.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Beef Stir Fry',
    slug: 'beef-stir-fry',
    description:
      'Quick and flavourful beef with colourful vegetables. Ready in under 30 minutes — perfect for busy weeknight dinners in Kampala.',
    author_name: 'Chef Chen',
    prep_time: 15,
    cook_time: 10,
    servings: 4,
    difficulty: 'easy' as const,
    rating: 4.6,
    review_count: 167,
    tags: ['Asian', 'Quick', 'Meat', 'Healthy'],
    ingredients: [
      { name: 'Beef Stew Meat', quantity: 500, unit: 'g', notes: 'sliced thinly' },
      { name: 'Cabbage', quantity: 0.25, unit: 'piece', notes: 'shredded' },
      { name: 'Onions', quantity: 1, unit: 'piece', notes: 'sliced' },
      { name: 'Tomatoes', quantity: 2, unit: 'piece', notes: 'wedged' },
      { name: 'Garlic', quantity: 3, unit: 'cloves', notes: 'minced' },
      { name: 'Ginger', quantity: 1, unit: 'piece', notes: 'grated' },
      { name: 'Cooking Oil', quantity: 3, unit: 'tbsp', notes: null },
    ],
    instructions: [
      { step_number: 1, description: 'Slice beef thinly against the grain.', duration_minutes: 5 },
      {
        step_number: 2,
        description: 'Cut vegetables into bite-sized pieces.',
        duration_minutes: 5,
      },
      {
        step_number: 3,
        description: 'Heat oil in a wok or large pan over high heat.',
        duration_minutes: 2,
      },
      {
        step_number: 4,
        description: 'Stir-fry beef for 2 minutes. Remove and set aside.',
        duration_minutes: 2,
      },
      {
        step_number: 5,
        description: 'Add vegetables and stir-fry for 3-4 minutes.',
        duration_minutes: 4,
      },
      {
        step_number: 6,
        description: 'Return beef to wok with garlic and ginger.',
        duration_minutes: 1,
      },
      {
        step_number: 7,
        description: 'Season with salt and soy sauce, toss everything together.',
        duration_minutes: 1,
      },
      { step_number: 8, description: 'Serve hot over steamed rice.', duration_minutes: 1 },
    ],
  },
];

// ── Shopping List Templates ──
const shoppingLists = [
  {
    name: 'Weekly Essentials',
    slug: 'weekly-essentials',
    description: 'Basic weekly groceries for a family of 4',
    emoji: '🛒',
    color: '#4CAF50',
    items: [
      { name: 'Rice (1kg)', quantity: 2, unit: 'kg', budget_amount: 10000 },
      { name: 'Cooking Oil (1L)', quantity: 1, unit: 'bottle', budget_amount: 8000 },
      { name: 'Tomatoes', quantity: 2, unit: 'kg', budget_amount: 6000 },
      { name: 'Onions', quantity: 1, unit: 'kg', budget_amount: 3500 },
      { name: 'Eggs (Tray of 30)', quantity: 1, unit: 'tray', budget_amount: 12000 },
      { name: 'Fresh Milk (1L)', quantity: 3, unit: 'litre', budget_amount: 10500 },
      { name: 'Bread (Loaf)', quantity: 2, unit: 'loaf', budget_amount: 10000 },
      { name: 'Bananas (Matooke)', quantity: 1, unit: 'bunch', budget_amount: 5000 },
    ],
  },
  {
    name: 'Party Prep',
    slug: 'party-prep',
    description: 'Everything you need for a get-together',
    emoji: '🎉',
    color: '#FF9800',
    items: [
      { name: 'Whole Chicken', quantity: 2, unit: 'piece', budget_amount: 36000 },
      { name: 'Rice (1kg)', quantity: 3, unit: 'kg', budget_amount: 15000 },
      { name: 'Mineral Water (1.5L)', quantity: 6, unit: 'bottle', budget_amount: 9000 },
      { name: 'Orange Juice (1L)', quantity: 4, unit: 'packet', budget_amount: 20000 },
      { name: 'Tomatoes', quantity: 3, unit: 'kg', budget_amount: 9000 },
      { name: 'Onions', quantity: 2, unit: 'kg', budget_amount: 7000 },
    ],
  },
  {
    name: 'Budget Basics',
    slug: 'budget-basics',
    description: 'Affordable staples under 30,000 UGX',
    emoji: '💰',
    color: '#2196F3',
    items: [
      { name: 'Maize Flour (Posho) 2kg', quantity: 1, unit: 'packet', budget_amount: 4000 },
      { name: 'Beans', quantity: 1, unit: 'kg', budget_amount: 4000 },
      { name: 'Sukuma Wiki (Collard Greens)', quantity: 2, unit: 'bunch', budget_amount: 2000 },
      { name: 'Tomatoes', quantity: 1, unit: 'kg', budget_amount: 3000 },
      { name: 'Onions', quantity: 0.5, unit: 'kg', budget_amount: 1750 },
      { name: 'Cooking Oil (1L)', quantity: 1, unit: 'bottle', budget_amount: 8000 },
      { name: 'Salt', quantity: 1, unit: 'packet', budget_amount: 500 },
    ],
  },
];

/**
 * In-place image backfill for existing entities whose `image` media
 * relation is still null. Matches each entity's slug to a local file in
 * public/uploads/ and uploads it via Strapi's upload service (which
 * delegates to the configured Cloudinary provider).
 */
async function backfillImageUrls(
  strapi: Core.Strapi,
  _existingCategories: any[],
  _existingProducts: any[],
  _existingRecipes: any[],
  replaceExisting = false,
) {
  const imageMap = buildLocalImageMap();
  if (imageMap.size === 0) {
    console.log(`  ⚠️  public/uploads/ is empty or missing — skipping backfill.`);
    return;
  }

  // Always re-fetch WITH populate so we can correctly detect which entities
  // already have an image linked and skip them (avoiding duplicate morph entries).
  const [populatedCats, populatedProds, populatedRecipes] = await Promise.all([
    strapi
      .documents('api::category.category')
      .findMany({ limit: 100, populate: { image: true } as any }),
    strapi
      .documents('api::product.product')
      .findMany({ limit: 100, populate: { image: true } as any }),
    strapi
      .documents('api::recipe.recipe')
      .findMany({ limit: 100, populate: { image: true } as any }),
  ]);

  let success = 0;
  let skipped = 0;

  for (const cat of populatedCats) {
    if ((cat as any).image && !replaceExisting) {
      skipped++;
      continue;
    }
    const ok = await attachSeedImage(
      strapi,
      'api::category.category',
      cat.documentId,
      (cat as any).slug,
      imageMap,
    );
    if (ok) success++;
    else skipped++;
  }

  for (const prod of populatedProds) {
    if ((prod as any).image && !replaceExisting) {
      skipped++;
      continue;
    }
    const ok = await attachSeedImage(
      strapi,
      'api::product.product',
      prod.documentId,
      (prod as any).slug,
      imageMap,
    );
    if (ok) success++;
    else skipped++;
  }

  for (const recipe of populatedRecipes) {
    if ((recipe as any).image && !replaceExisting) {
      skipped++;
      continue;
    }
    const ok = await attachSeedImage(
      strapi,
      'api::recipe.recipe',
      recipe.documentId,
      (recipe as any).slug,
      imageMap,
    );
    if (ok) success++;
    else skipped++;
  }

  console.log(`🖼️  Image backfill complete: ${success} updated, ${skipped} skipped.`);
}

// ── Main seed function ──
async function seed(strapi: Core.Strapi) {
  try {
    await seedImpl(strapi);
  } catch (e) {
    // A seed failure must never crash the server — log and continue.
    console.error('🌱 Seed failed (server will still start):', (e as Error).message);
  }
}

async function seedImpl(strapi: Core.Strapi) {
  console.log('🌱 Checking seed status...');
  const shouldReplaceImages = process.env.SEED_REPLACE_IMAGES === 'true';

  const [anyCategories, anyProducts, anyRecipes, anyShoppingLists] = await Promise.all([
    strapi.documents('api::category.category').findMany({ limit: 1 }),
    strapi.documents('api::product.product').findMany({ limit: 1 }),
    strapi.documents('api::recipe.recipe').findMany({ limit: 1 }),
    strapi.documents('api::shopping-list.shopping-list').findMany({ limit: 1 }),
  ]);
  const hasAnySeedData =
    anyCategories.length > 0 ||
    anyProducts.length > 0 ||
    anyRecipes.length > 0 ||
    anyShoppingLists.length > 0;

  // Check if data already exists and is complete — only count PUBLISHED entries
  // so a failed/partial seed that left unpublished duplicates doesn't cause a false skip.
  const existingCategories = await strapi
    .documents('api::category.category')
    .findMany({ limit: 100, status: 'published' });
  const existingProducts = await strapi
    .documents('api::product.product')
    .findMany({ limit: 100, status: 'published' });

  // Full check with populate only when fast check is inconclusive
  const existingRecipes = await strapi.documents('api::recipe.recipe').findMany({
    limit: 100,
    populate: { ingredients: { populate: { product: true } } } as any,
  });
  const existingShoppingLists = await strapi
    .documents('api::shopping-list.shopping-list')
    .findMany({ limit: 100, populate: { items: true } as any });

  const templateLists = existingShoppingLists.filter((list: any) => list.customer == null);
  const templatesHaveItems =
    templateLists.length >= shoppingLists.length &&
    templateLists.every((list: any) => Array.isArray(list.items) && list.items.length > 0);
  const recipesHaveLinkedProducts =
    existingRecipes.length >= recipes.length &&
    existingRecipes.every((recipe: any) => {
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      return ingredients.some((ing: any) => Boolean(ing?.product));
    });

  const isComplete =
    existingCategories.length >= categories.length &&
    existingRecipes.length >= recipes.length &&
    existingProducts.length >= products.length &&
    existingShoppingLists.length >= shoppingLists.length &&
    templatesHaveItems &&
    recipesHaveLinkedProducts;

  // If everything is in place but the image fields are null (e.g. left over
  // from the old upload-then-reference flow), backfill the URLs in place
  // without wiping data.
  if (isComplete) {
    const [sampleCategory, sampleProduct, sampleRecipe] = await Promise.all([
      strapi
        .documents('api::category.category')
        .findMany({ limit: 1, status: 'published', populate: { image: true } as any }),
      strapi
        .documents('api::product.product')
        .findMany({ limit: 1, status: 'published', populate: { image: true } as any }),
      strapi
        .documents('api::recipe.recipe')
        .findMany({ limit: 1, populate: { image: true } as any }),
    ]);
    const imagesArePopulated =
      Boolean((sampleProduct[0] as any)?.image) &&
      Boolean((sampleCategory[0] as any)?.image) &&
      Boolean((sampleRecipe[0] as any)?.image);

    if (imagesArePopulated && !shouldReplaceImages) {
      console.log(
        `⏭️  Seed data is complete (${existingCategories.length} cats, ${existingProducts.length} prods, ${existingRecipes.length} recipes, ${existingShoppingLists.length} lists), skipping.`,
      );
      return;
    }

    if (shouldReplaceImages) {
      console.log(
        '🖼️  SEED_REPLACE_IMAGES=true — refreshing all category/product/recipe images...',
      );
    } else {
      console.log('🖼️  Existing data has null image fields — backfilling URLs...');
    }
    await backfillImageUrls(
      strapi,
      existingCategories as any[],
      existingProducts as any[],
      existingRecipes as any[],
      shouldReplaceImages,
    );
    return;
  }

  // Incomplete or outdated — clear everything and re-seed.
  // Always run the clear step when isComplete is false, even if hasAnySeedData appears
  // false. findMany() without status only returns published entries in Strapi 5, so
  // draft-only entries (e.g. from a crashed previous seed run) are invisible to the
  // check but still hold unique slug constraints in the DB. Skipping the clear in that
  // case causes "This attribute must be unique" errors during Phase 1 creation.
  console.log(
    `🔄 Clearing seed data (${existingCategories.length}/${categories.length} cats, ${existingProducts.length}/${products.length} prods, ${existingRecipes.length}/${recipes.length} recipes, ${existingShoppingLists.length}/${shoppingLists.length} lists, templatesHaveItems=${templatesHaveItems}, recipesHaveLinkedProducts=${recipesHaveLinkedProducts})...`,
  );
  const contentTypes = [
    'api::recipe.recipe',
    'api::shopping-list.shopping-list',
    'api::product.product',
    'api::subcategory.subcategory',
    'api::category.category',
  ] as const;

  for (const uid of contentTypes) {
    // Fetch both published and draft entries — findMany() without status only returns
    // published, so draft-only entries would be missed and left with conflicting slugs.
    const [publishedItems, draftItems] = await Promise.all([
      strapi.documents(uid).findMany({ limit: 1000, status: 'published' }),
      strapi.documents(uid).findMany({ limit: 1000, status: 'draft' }),
    ]);
    const allDocumentIds = [
      ...new Set([
        ...publishedItems.map((i: any) => i.documentId),
        ...draftItems.map((i: any) => i.documentId),
      ]),
    ];
    for (const documentId of allDocumentIds) {
      try {
        await strapi.documents(uid).delete({ documentId });
      } catch (e) {
        console.log(`  ⚠️  Failed to delete ${uid} ${documentId}`);
      }
    }
    console.log(`  🗑️  Cleared ${uid} (${allDocumentIds.length} items)`);
  }
  console.log('🗑️  Old data cleared.');

  // ── Phase 1: Create all entities (fast, no image downloads) ──
  console.log('🌱 Phase 1: Creating entities...');

  // Track documentIds for background image upload
  const imageQueue: { uid: string; documentId: string; name: string }[] = [];

  // Seed categories
  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    const created = await strapi.documents('api::category.category').create({
      data: cat,
      status: 'published',
    });
    categoryMap[cat.slug] = created.documentId;
    imageQueue.push({
      uid: 'api::category.category',
      documentId: created.documentId,
      name: cat.slug,
    });
    console.log(`  ✅ Category: ${cat.name}`);
  }

  // Seed subcategories
  const subcategoryMap: Record<string, string> = {};
  for (const sub of subcategories) {
    const { categorySlug, ...data } = sub;
    const created = await strapi.documents('api::subcategory.subcategory').create({
      data: {
        ...data,
        is_active: true,
        category: { documentId: categoryMap[categorySlug] },
      } as any,
      status: 'published',
    });
    subcategoryMap[sub.slug] = created.documentId;
    console.log(`  ✅ Subcategory: ${sub.name}`);
  }

  // Seed products and build name-to-documentId map
  const productMap: Record<string, string> = {};
  const productLookup: Array<{ name: string; normalized: string; documentId: string }> = [];

  const normalizeName = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const ingredientAliases: Record<string, string> = {
    eggs: 'eggs tray of 30',
    egg: 'eggs tray of 30',
    onion: 'onions',
    yogurt: 'yogurt 500ml',
    rice: 'rice 1kg',
    'basmati rice': 'rice 1kg',
    bread: 'bread loaf',
    bananas: 'bananas matooke',
    'green bananas': 'bananas matooke',
    'green bananas matooke': 'bananas matooke',
    'maize flour': 'maize flour posho 2kg',
    water: 'mineral water 1 5l',
  };

  const resolveProductDocumentId = (rawName: string): string | undefined => {
    const normalized = normalizeName(rawName);

    // Exact name match first
    const exact = productLookup.find((p) => p.normalized === normalized);
    if (exact) return exact.documentId;

    // Alias mapping for common recipe/template naming differences
    const alias = ingredientAliases[normalized];
    if (alias) {
      const aliasMatch = productLookup.find((p) => p.normalized === alias);
      if (aliasMatch) return aliasMatch.documentId;
    }

    // Fuzzy contains match as fallback
    const fuzzy = productLookup.find(
      (p) => p.normalized.includes(normalized) || normalized.includes(p.normalized),
    );
    return fuzzy?.documentId;
  };

  for (const prod of products) {
    const { categorySlug, subcategorySlug, ...data } = prod;
    const created = await strapi.documents('api::product.product').create({
      data: {
        ...data,
        is_active: true,
        category: { documentId: categoryMap[categorySlug] },
        ...(subcategorySlug
          ? { subcategory: { documentId: subcategoryMap[subcategorySlug] } }
          : {}),
      } as any,
      status: 'published',
    });
    productMap[prod.name] = created.documentId;
    productLookup.push({
      name: prod.name,
      normalized: normalizeName(prod.name),
      documentId: created.documentId,
    });
    imageQueue.push({
      uid: 'api::product.product',
      documentId: created.documentId,
      name: prod.slug,
    });
    console.log(`  ✅ Product: ${prod.name}`);
  }

  // Seed recipes with linked products
  for (const recipe of recipes) {
    // Link ingredients to actual products by name
    const linkedIngredients = (recipe.ingredients || []).map((ing: any) => {
      const productDocumentId = resolveProductDocumentId(String(ing.name || ''));
      return {
        ...ing,
        product: productDocumentId ?? undefined,
      };
    });
    const created = await strapi.documents('api::recipe.recipe').create({
      data: {
        ...recipe,
        ingredients: linkedIngredients,
      } as any,
      status: 'published',
    });
    imageQueue.push({
      uid: 'api::recipe.recipe',
      documentId: created.documentId,
      name: recipe.slug,
    });
    console.log(`  ✅ Recipe: ${recipe.name}`);
  }

  // Seed shopping list templates with linked products
  for (const list of shoppingLists) {
    // Link shopping list items to actual products by name
    const linkedItems = (list.items || []).map((item: any) => {
      const productDocumentId = resolveProductDocumentId(String(item.name || ''));
      return {
        ...item,
        product: productDocumentId ?? undefined,
      };
    });
    await strapi.documents('api::shopping-list.shopping-list').create({
      data: {
        ...list,
        items: linkedItems,
      } as any,
      status: 'published',
    });
    console.log(`  ✅ Shopping List: ${list.name}`);
  }

  console.log(
    `🌱 Phase 1 complete! All entities created. Queued ${imageQueue.length} images for direct URL backfill.`,
  );

  // ── Phase 2: Upload seed images to the configured upload provider ──
  // We read originals from public/uploads/ and push them through Strapi's
  // upload service, which delegates to the Cloudinary provider configured
  // in config/plugins.ts. This avoids Railway's ephemeral-disk problem.
  //
  // Runs inline (was previously setTimeout-wrapped) so run-seed.ts can await
  // it — otherwise app.destroy() fires before the timer and images never link.
  console.log(`🖼️  Uploading ${imageQueue.length} seed images...`);
  const imageMap = buildLocalImageMap();
  if (imageMap.size === 0) {
    console.log(`  ⚠️  public/uploads/ is empty or missing — skipping image upload.`);
    return;
  }

  let success = 0;
  let failed = 0;

  for (const item of imageQueue) {
    const ok = await attachSeedImage(strapi, item.uid, item.documentId, item.name, imageMap);
    if (ok) success++;
    else failed++;
  }

  console.log(`🖼️  Image upload complete: ${success} succeeded, ${failed} failed.`);
}

export default seed;
