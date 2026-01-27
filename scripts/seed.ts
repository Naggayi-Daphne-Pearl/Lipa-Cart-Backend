import type { Core } from '@strapi/strapi';

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
  { name: 'Fresh Vegetables', slug: 'fresh-vegetables', categorySlug: 'fruits-vegetables', sort_order: 2 },
  { name: 'Herbs & Spices', slug: 'herbs-spices', categorySlug: 'fruits-vegetables', sort_order: 3 },
  { name: 'Chicken', slug: 'chicken', categorySlug: 'meat-poultry', sort_order: 1 },
  { name: 'Beef', slug: 'beef', categorySlug: 'meat-poultry', sort_order: 2 },
  { name: 'Fish & Seafood', slug: 'fish-seafood', categorySlug: 'meat-poultry', sort_order: 3 },
  { name: 'Milk & Yogurt', slug: 'milk-yogurt', categorySlug: 'dairy-eggs', sort_order: 1 },
  { name: 'Eggs', slug: 'eggs', categorySlug: 'dairy-eggs', sort_order: 2 },
  { name: 'Rice & Maize', slug: 'rice-maize', categorySlug: 'grains-cereals', sort_order: 1 },
  { name: 'Bread & Bakery', slug: 'bread-bakery', categorySlug: 'grains-cereals', sort_order: 2 },
];

const products = [
  // Fruits
  { name: 'Bananas (Matooke)', slug: 'bananas-matooke', estimated_price: 5000, common_units: ['bunch', 'kg', 'piece'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits' },
  { name: 'Mangoes', slug: 'mangoes', estimated_price: 2000, common_units: ['piece', 'kg'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits' },
  { name: 'Pineapple', slug: 'pineapple', estimated_price: 3000, common_units: ['piece'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits' },
  { name: 'Watermelon', slug: 'watermelon', estimated_price: 8000, common_units: ['piece', 'half'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits' },
  { name: 'Passion Fruit', slug: 'passion-fruit', estimated_price: 500, common_units: ['piece', 'kg'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits' },
  // Vegetables
  { name: 'Tomatoes', slug: 'tomatoes', estimated_price: 3000, common_units: ['kg', 'piece', 'tin'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables' },
  { name: 'Onions', slug: 'onions', estimated_price: 3500, common_units: ['kg', 'piece'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables' },
  { name: 'Cabbage', slug: 'cabbage', estimated_price: 2000, common_units: ['piece', 'half'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables' },
  { name: 'Nakati (African Nightshade)', slug: 'nakati', estimated_price: 1000, common_units: ['bunch'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables' },
  { name: 'Sukuma Wiki (Collard Greens)', slug: 'sukuma-wiki', estimated_price: 1000, common_units: ['bunch'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables' },
  // Herbs
  { name: 'Coriander (Dania)', slug: 'coriander', estimated_price: 500, common_units: ['bunch'], categorySlug: 'fruits-vegetables', subcategorySlug: 'herbs-spices' },
  { name: 'Ginger', slug: 'ginger', estimated_price: 2000, common_units: ['piece', 'kg'], categorySlug: 'fruits-vegetables', subcategorySlug: 'herbs-spices' },
  // Chicken
  { name: 'Whole Chicken', slug: 'whole-chicken', estimated_price: 18000, common_units: ['piece'], categorySlug: 'meat-poultry', subcategorySlug: 'chicken' },
  { name: 'Chicken Breast', slug: 'chicken-breast', estimated_price: 12000, common_units: ['kg', 'piece'], categorySlug: 'meat-poultry', subcategorySlug: 'chicken' },
  // Beef
  { name: 'Beef Stew Meat', slug: 'beef-stew-meat', estimated_price: 15000, common_units: ['kg'], categorySlug: 'meat-poultry', subcategorySlug: 'beef' },
  { name: 'Minced Beef', slug: 'minced-beef', estimated_price: 16000, common_units: ['kg'], categorySlug: 'meat-poultry', subcategorySlug: 'beef' },
  // Fish
  { name: 'Tilapia', slug: 'tilapia', estimated_price: 12000, common_units: ['piece', 'kg'], categorySlug: 'meat-poultry', subcategorySlug: 'fish-seafood' },
  { name: 'Nile Perch', slug: 'nile-perch', estimated_price: 18000, common_units: ['kg'], categorySlug: 'meat-poultry', subcategorySlug: 'fish-seafood' },
  // Dairy
  { name: 'Fresh Milk (1L)', slug: 'fresh-milk-1l', estimated_price: 3500, common_units: ['litre', 'packet'], categorySlug: 'dairy-eggs', subcategorySlug: 'milk-yogurt' },
  { name: 'Yogurt (500ml)', slug: 'yogurt-500ml', estimated_price: 3000, common_units: ['piece'], categorySlug: 'dairy-eggs', subcategorySlug: 'milk-yogurt' },
  // Eggs
  { name: 'Eggs (Tray of 30)', slug: 'eggs-tray-30', estimated_price: 12000, common_units: ['tray', 'piece'], categorySlug: 'dairy-eggs', subcategorySlug: 'eggs' },
  // Grains
  { name: 'Rice (1kg)', slug: 'rice-1kg', estimated_price: 5000, common_units: ['kg'], categorySlug: 'grains-cereals', subcategorySlug: 'rice-maize' },
  { name: 'Maize Flour (Posho) 2kg', slug: 'maize-flour-2kg', estimated_price: 4000, common_units: ['kg', 'packet'], categorySlug: 'grains-cereals', subcategorySlug: 'rice-maize' },
  { name: 'Bread (Loaf)', slug: 'bread-loaf', estimated_price: 5000, common_units: ['loaf'], categorySlug: 'grains-cereals', subcategorySlug: 'bread-bakery' },
  // Beverages
  { name: 'Mineral Water (1.5L)', slug: 'mineral-water-1-5l', estimated_price: 1500, common_units: ['bottle'], categorySlug: 'beverages', subcategorySlug: null },
  { name: 'Orange Juice (1L)', slug: 'orange-juice-1l', estimated_price: 5000, common_units: ['packet', 'bottle'], categorySlug: 'beverages', subcategorySlug: null },
  // Household
  { name: 'Washing Soap (Bar)', slug: 'washing-soap-bar', estimated_price: 2000, common_units: ['piece'], categorySlug: 'household-cleaning', subcategorySlug: null },
  { name: 'Cooking Oil (1L)', slug: 'cooking-oil-1l', estimated_price: 8000, common_units: ['litre', 'bottle'], categorySlug: 'household-cleaning', subcategorySlug: null },
];

const recipes = [
  {
    name: 'Luwombo (Steamed Chicken Stew)',
    slug: 'luwombo-steamed-chicken-stew',
    description: '**Luwombo** is a traditional Ugandan dish where chicken is steamed in banana leaves with groundnut sauce. It\'s a ceremonial favourite often served at special occasions.\n\n## Background\nOriginating from the Buganda Kingdom, Luwombo is considered a dish of honour.',
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
      { step_number: 1, description: 'Mix groundnut paste with a little water to form a smooth sauce.', duration_minutes: 5 },
      { step_number: 2, description: 'Season chicken pieces with salt and set aside.', duration_minutes: 5 },
      { step_number: 3, description: 'Soften banana leaves over an open flame until pliable.', duration_minutes: 10 },
      { step_number: 4, description: 'Place chicken, tomatoes, onions, and groundnut sauce onto banana leaves. Wrap tightly into parcels.', duration_minutes: 10 },
      { step_number: 5, description: 'Place parcels in a large pot with a little water at the bottom. Steam on low heat until chicken is tender.', duration_minutes: 90 },
    ],
  },
  {
    name: 'Rolex (Rolled Eggs)',
    slug: 'rolex-rolled-eggs',
    description: '**Rolex** is Uganda\'s beloved street food — a chapati rolled around a fried egg omelette with vegetables. The name comes from "rolled eggs". Quick, cheap, and delicious.',
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
      { step_number: 1, description: 'Beat eggs and mix with diced tomatoes, onions, and cabbage. Season with salt.', duration_minutes: 3 },
      { step_number: 2, description: 'Heat oil in a pan and pour in the egg mixture. Cook as a flat omelette.', duration_minutes: 3 },
      { step_number: 3, description: 'Warm the chapati on the pan for 30 seconds each side.', duration_minutes: 1 },
      { step_number: 4, description: 'Place the omelette on the chapati and roll tightly. Serve immediately.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Matoke (Steamed Green Bananas)',
    slug: 'matoke-steamed-green-bananas',
    description: '**Matoke** is the staple dish of Uganda — green bananas steamed and mashed, often served with a meat or groundnut sauce. Every Ugandan home has their own version.',
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
      { step_number: 1, description: 'Peel the green bananas and place in a pot lined with banana leaves or a steamer.', duration_minutes: 10 },
      { step_number: 2, description: 'Sauté onions in oil until golden, add tomatoes and cook until soft to make the sauce.', duration_minutes: 10 },
      { step_number: 3, description: 'Pour sauce over bananas, add water, cover tightly and steam on low heat.', duration_minutes: 40 },
      { step_number: 4, description: 'Mash the bananas in the pot until smooth. Serve hot.', duration_minutes: 5 },
    ],
  },
];

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

async function seed(strapi: Core.Strapi) {
  console.log('🌱 Seeding database...');

  // Check if data already exists
  const existingCategories = await strapi.documents('api::category.category').findMany();
  if (existingCategories.length > 0) {
    console.log('⏭️  Data already exists, skipping seed.');
    return;
  }

  // Seed categories
  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    const created = await strapi.documents('api::category.category').create({
      data: cat,
      status: 'published',
    });
    categoryMap[cat.slug] = created.documentId;
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

  // Seed products
  for (const prod of products) {
    const { categorySlug, subcategorySlug, ...data } = prod;
    await strapi.documents('api::product.product').create({
      data: {
        ...data,
        is_active: true,
        category: { documentId: categoryMap[categorySlug] },
        ...(subcategorySlug ? { subcategory: { documentId: subcategoryMap[subcategorySlug] } } : {}),
      } as any,
      status: 'published',
    });
    console.log(`  ✅ Product: ${prod.name}`);
  }

  // Seed recipes
  for (const recipe of recipes) {
    await strapi.documents('api::recipe.recipe').create({
      data: recipe as any,
      status: 'published',
    });
    console.log(`  ✅ Recipe: ${recipe.name}`);
  }

  // Seed shopping list templates
  for (const list of shoppingLists) {
    await strapi.documents('api::shopping-list.shopping-list').create({
      data: list as any,
      status: 'published',
    });
    console.log(`  ✅ Shopping List: ${list.name}`);
  }

  console.log('🌱 Seeding complete!');
}

export default seed;
