import type { Core } from '@strapi/strapi';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── Helper: download image from URL and upload to Strapi media library ──
async function uploadImage(strapi: Core.Strapi, url: string, name: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(os.tmpdir(), `${name}.jpg`);
    fs.writeFileSync(filePath, buffer);

    const stats = fs.statSync(filePath);
    const uploadedFiles = await strapi.plugin('upload').service('upload').upload({
      data: {},
      files: {
        filepath: filePath,
        originalFilename: `${name}.jpg`,
        mimetype: 'image/jpeg',
        size: stats.size,
      },
    });

    try { fs.unlinkSync(filePath); } catch (_) {}
    return uploadedFiles[0] ?? null;
  } catch (e) {
    console.log(`  ⚠️  Image upload failed for ${name}`);
    return null;
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
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400',
  },
  {
    name: 'Meat & Poultry',
    slug: 'meat-poultry',
    description: 'Fresh meat, chicken, and poultry products',
    color: '#E53935',
    sort_order: 2,
    is_active: true,
    imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400',
  },
  {
    name: 'Dairy & Eggs',
    slug: 'dairy-eggs',
    description: 'Milk, cheese, yogurt, and eggs',
    color: '#FFC107',
    sort_order: 3,
    is_active: true,
    imageUrl: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400',
  },
  {
    name: 'Grains & Cereals',
    slug: 'grains-cereals',
    description: 'Rice, maize flour, wheat, and breakfast cereals',
    color: '#FF9800',
    sort_order: 4,
    is_active: true,
    imageUrl: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400',
  },
  {
    name: 'Beverages',
    slug: 'beverages',
    description: 'Juices, water, sodas, and other drinks',
    color: '#2196F3',
    sort_order: 5,
    is_active: true,
    imageUrl: 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400',
  },
  {
    name: 'Household & Cleaning',
    slug: 'household-cleaning',
    description: 'Cleaning supplies and household essentials',
    color: '#9C27B0',
    sort_order: 6,
    is_active: true,
    imageUrl: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400',
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

// ── Products (with descriptions and image URLs from frontend) ──
const products = [
  // Fruits
  { name: 'Bananas (Matooke)', slug: 'bananas-matooke', description: 'Fresh green bananas for cooking. The staple food of Uganda — steam and mash for the perfect matoke.', estimated_price: 5000, common_units: ['bunch', 'kg', 'piece'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits', imageUrl: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=400' },
  { name: 'Mangoes', slug: 'mangoes', description: 'Sweet, juicy mangoes sourced from local farms. Perfect for snacking or fresh juice.', estimated_price: 2000, common_units: ['piece', 'kg'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits', imageUrl: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400' },
  { name: 'Pineapple', slug: 'pineapple', description: 'Ripe, sweet pineapple from Eastern Uganda. Great for juice, desserts, or eating fresh.', estimated_price: 3000, common_units: ['piece'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits', imageUrl: 'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=400' },
  { name: 'Watermelon', slug: 'watermelon', description: 'Large, refreshing watermelon. Perfect for hot days and fresh juice.', estimated_price: 8000, common_units: ['piece', 'half'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits', imageUrl: 'https://images.unsplash.com/photo-1589984662646-e7b2e4962f18?w=400' },
  { name: 'Passion Fruit', slug: 'passion-fruit', description: 'Tangy passion fruit for fresh juice or desserts. Rich in vitamins.', estimated_price: 500, common_units: ['piece', 'kg'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-fruits', imageUrl: 'https://images.unsplash.com/photo-1604495772376-9657f0035eb5?w=400' },
  // Vegetables
  { name: 'Tomatoes', slug: 'tomatoes', description: 'Ripe red tomatoes from local farms. Perfect for salads, cooking, and sauces.', estimated_price: 3000, common_units: ['kg', 'piece', 'tin'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables', imageUrl: 'https://images.unsplash.com/photo-1546470427-0d4db154ceb8?w=400' },
  { name: 'Onions', slug: 'onions', description: 'Red onions perfect for cooking and salads. A kitchen essential.', estimated_price: 3500, common_units: ['kg', 'piece'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables', imageUrl: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400' },
  { name: 'Cabbage', slug: 'cabbage', description: 'Fresh green cabbage. Great for salads, stir-fry, or steaming.', estimated_price: 2000, common_units: ['piece', 'half'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables', imageUrl: 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=400' },
  { name: 'Nakati (African Nightshade)', slug: 'nakati', description: 'Traditional Ugandan leafy green vegetable. Nutritious and delicious when steamed.', estimated_price: 1000, common_units: ['bunch'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables', imageUrl: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400' },
  { name: 'Sukuma Wiki (Collard Greens)', slug: 'sukuma-wiki', description: 'Popular East African leafy greens. A staple side dish in Kenya and Uganda.', estimated_price: 1000, common_units: ['bunch'], categorySlug: 'fruits-vegetables', subcategorySlug: 'fresh-vegetables', imageUrl: 'https://images.unsplash.com/photo-1574316071802-0d684efa7bf5?w=400' },
  // Herbs
  { name: 'Coriander (Dania)', slug: 'coriander', description: 'Fresh coriander leaves for garnishing and flavouring. Essential for East African cooking.', estimated_price: 500, common_units: ['bunch'], categorySlug: 'fruits-vegetables', subcategorySlug: 'herbs-spices', imageUrl: 'https://images.unsplash.com/photo-1592928302636-c83cf1e1c887?w=400' },
  { name: 'Ginger', slug: 'ginger', description: 'Fresh ginger root for tea, cooking, and natural remedies.', estimated_price: 2000, common_units: ['piece', 'kg'], categorySlug: 'fruits-vegetables', subcategorySlug: 'herbs-spices', imageUrl: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=400' },
  // Chicken
  { name: 'Whole Chicken', slug: 'whole-chicken', description: 'Fresh whole chicken, locally raised. Perfect for roasting or stewing.', estimated_price: 18000, common_units: ['piece'], categorySlug: 'meat-poultry', subcategorySlug: 'chicken', imageUrl: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400' },
  { name: 'Chicken Breast', slug: 'chicken-breast', description: 'Boneless chicken breast. Lean, versatile, and great for grilling or stir-fry.', estimated_price: 12000, common_units: ['kg', 'piece'], categorySlug: 'meat-poultry', subcategorySlug: 'chicken', imageUrl: 'https://images.unsplash.com/photo-1604503468506-a8da13d82571?w=400' },
  // Beef
  { name: 'Beef Stew Meat', slug: 'beef-stew-meat', description: 'Tender beef chunks ideal for slow-cooked stews and curries.', estimated_price: 15000, common_units: ['kg'], categorySlug: 'meat-poultry', subcategorySlug: 'beef', imageUrl: 'https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=400' },
  { name: 'Minced Beef', slug: 'minced-beef', description: 'Freshly minced beef. Perfect for samosas, bolognese, or chapati fillings.', estimated_price: 16000, common_units: ['kg'], categorySlug: 'meat-poultry', subcategorySlug: 'beef', imageUrl: 'https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=400' },
  // Fish
  { name: 'Tilapia', slug: 'tilapia', description: 'Freshly caught tilapia from Lake Victoria. Perfect for grilling or frying.', estimated_price: 12000, common_units: ['piece', 'kg'], categorySlug: 'meat-poultry', subcategorySlug: 'fish-seafood', imageUrl: 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400' },
  { name: 'Nile Perch', slug: 'nile-perch', description: 'Premium Nile Perch fillet from Lake Victoria. A Ugandan delicacy.', estimated_price: 18000, common_units: ['kg'], categorySlug: 'meat-poultry', subcategorySlug: 'fish-seafood', imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400' },
  // Dairy
  { name: 'Fresh Milk (1L)', slug: 'fresh-milk-1l', description: 'Pasteurized fresh milk from local dairy farms.', estimated_price: 3500, common_units: ['litre', 'packet'], categorySlug: 'dairy-eggs', subcategorySlug: 'milk-yogurt', imageUrl: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400' },
  { name: 'Yogurt (500ml)', slug: 'yogurt-500ml', description: 'Creamy natural yogurt. Great for breakfast or as a snack.', estimated_price: 3000, common_units: ['piece'], categorySlug: 'dairy-eggs', subcategorySlug: 'milk-yogurt', imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400' },
  // Eggs
  { name: 'Eggs (Tray of 30)', slug: 'eggs-tray-30', description: 'Fresh eggs from free-range chickens. A kitchen essential.', estimated_price: 12000, common_units: ['tray', 'piece'], categorySlug: 'dairy-eggs', subcategorySlug: 'eggs', imageUrl: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400' },
  // Grains
  { name: 'Rice (1kg)', slug: 'rice-1kg', description: 'High-quality long grain rice for everyday meals.', estimated_price: 5000, common_units: ['kg'], categorySlug: 'grains-cereals', subcategorySlug: 'rice-maize', imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400' },
  { name: 'Maize Flour (Posho) 2kg', slug: 'maize-flour-2kg', description: 'Fine maize flour for making posho/ugali. A staple across East Africa.', estimated_price: 4000, common_units: ['kg', 'packet'], categorySlug: 'grains-cereals', subcategorySlug: 'rice-maize', imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400' },
  { name: 'Bread (Loaf)', slug: 'bread-loaf', description: 'Freshly baked white bread loaf. Perfect for breakfast or sandwiches.', estimated_price: 5000, common_units: ['loaf'], categorySlug: 'grains-cereals', subcategorySlug: 'bread-bakery', imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400' },
  // Beverages
  { name: 'Mineral Water (1.5L)', slug: 'mineral-water-1-5l', description: 'Pure mineral water. Stay hydrated throughout the day.', estimated_price: 1500, common_units: ['bottle'], categorySlug: 'beverages', subcategorySlug: null, imageUrl: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400' },
  { name: 'Orange Juice (1L)', slug: 'orange-juice-1l', description: 'Fresh orange juice packed with vitamin C. No added sugars.', estimated_price: 5000, common_units: ['packet', 'bottle'], categorySlug: 'beverages', subcategorySlug: null, imageUrl: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400' },
  // Household
  { name: 'Washing Soap (Bar)', slug: 'washing-soap-bar', description: 'Multipurpose washing soap bar for laundry and cleaning.', estimated_price: 2000, common_units: ['piece'], categorySlug: 'household-cleaning', subcategorySlug: null, imageUrl: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400' },
  { name: 'Cooking Oil (1L)', slug: 'cooking-oil-1l', description: 'Vegetable cooking oil for everyday frying and cooking.', estimated_price: 8000, common_units: ['litre', 'bottle'], categorySlug: 'household-cleaning', subcategorySlug: null, imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eabd7875faf?w=400' },
];

// ── Recipes (Ugandan + East African + international) ──
const recipes = [
  {
    name: 'Luwombo (Steamed Chicken Stew)',
    slug: 'luwombo-steamed-chicken-stew',
    description: '**Luwombo** is a traditional Ugandan dish where chicken is steamed in banana leaves with groundnut sauce. It\'s a ceremonial favourite often served at special occasions.\n\n## Background\nOriginating from the Buganda Kingdom, Luwombo is considered a dish of honour.',
    author_name: 'Chef Aisha',
    prep_time: 30, cook_time: 90, servings: 6,
    difficulty: 'medium' as const,
    rating: 4.8, review_count: 42,
    tags: ['Traditional', 'Ugandan', 'Special Occasion'],
    imageUrl: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=800',
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
    prep_time: 5, cook_time: 10, servings: 1,
    difficulty: 'easy' as const,
    rating: 4.9, review_count: 128,
    tags: ['Quick', 'Street Food', 'Ugandan', 'Budget'],
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
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
    prep_time: 15, cook_time: 45, servings: 4,
    difficulty: 'easy' as const,
    rating: 4.6, review_count: 67,
    tags: ['Traditional', 'Ugandan', 'Staple', 'Vegetarian'],
    imageUrl: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=800',
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
  {
    name: 'Chapati',
    slug: 'chapati',
    description: 'Soft, layered flatbread perfect for scooping up stews and curries. A staple across East Africa, served with everything from beans to Luwombo.',
    author_name: 'Mama Njeri',
    prep_time: 40, cook_time: 30, servings: 8,
    difficulty: 'medium' as const,
    rating: 4.6, review_count: 198,
    tags: ['East African', 'Bread', 'Traditional', 'Vegetarian'],
    imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800',
    ingredients: [
      { name: 'All-Purpose Flour', quantity: 3, unit: 'cups', notes: null },
      { name: 'Cooking Oil', quantity: 0.5, unit: 'cup', notes: null },
      { name: 'Salt', quantity: 1, unit: 'tsp', notes: null },
      { name: 'Warm Water', quantity: 1, unit: 'cup', notes: null },
    ],
    instructions: [
      { step_number: 1, description: 'Mix flour and salt in a large bowl.', duration_minutes: 2 },
      { step_number: 2, description: 'Add oil and mix until crumbly.', duration_minutes: 3 },
      { step_number: 3, description: 'Gradually add warm water and knead into soft dough.', duration_minutes: 5 },
      { step_number: 4, description: 'Cover and rest for 30 minutes.', duration_minutes: 30 },
      { step_number: 5, description: 'Divide into 8 balls and roll each into a thin circle.', duration_minutes: 5 },
      { step_number: 6, description: 'Brush with oil, fold, and roll again.', duration_minutes: 5 },
      { step_number: 7, description: 'Cook on hot pan, turning and brushing with oil until golden.', duration_minutes: 15 },
      { step_number: 8, description: 'Stack and cover to keep warm.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Pilau',
    slug: 'pilau',
    description: 'Aromatic Swahili spiced rice dish with tender meat. A coastal East African favourite with rich flavors from pilau masala spice blend.',
    author_name: 'Mama Fatuma',
    prep_time: 20, cook_time: 50, servings: 8,
    difficulty: 'medium' as const,
    rating: 4.8, review_count: 189,
    tags: ['East African', 'Rice', 'Swahili', 'One-Pot'],
    imageUrl: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800',
    ingredients: [
      { name: 'Basmati Rice', quantity: 3, unit: 'cups', notes: null },
      { name: 'Beef Stew Meat', quantity: 500, unit: 'g', notes: null },
      { name: 'Onions', quantity: 3, unit: 'piece', notes: 'sliced' },
      { name: 'Garlic', quantity: 6, unit: 'cloves', notes: 'minced' },
      { name: 'Pilau Masala', quantity: 2, unit: 'tbsp', notes: null },
      { name: 'Potatoes', quantity: 2, unit: 'piece', notes: 'cubed (optional)' },
    ],
    instructions: [
      { step_number: 1, description: 'Wash rice and soak in water for 30 minutes, then drain.', duration_minutes: 30 },
      { step_number: 2, description: 'In a heavy pot, heat oil and fry sliced onions until deep brown.', duration_minutes: 10 },
      { step_number: 3, description: 'Add beef pieces and brown on all sides.', duration_minutes: 5 },
      { step_number: 4, description: 'Add garlic, ginger, and pilau masala. Stir for 2 minutes.', duration_minutes: 2 },
      { step_number: 5, description: 'Pour in water (double the amount of rice) and bring to boil.', duration_minutes: 5 },
      { step_number: 6, description: 'Add potatoes if using, then add the soaked rice.', duration_minutes: 2 },
      { step_number: 7, description: 'Reduce heat to low, cover tightly, and cook for 25 minutes.', duration_minutes: 25 },
      { step_number: 8, description: 'Fluff with fork and serve hot.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Posho & Beans',
    slug: 'posho-and-beans',
    description: 'The everyday Ugandan meal — maize flour porridge served with stewed beans. Affordable, filling, and packed with protein. Found at every roadside restaurant.',
    author_name: 'Chef Kamau',
    prep_time: 10, cook_time: 25, servings: 4,
    difficulty: 'easy' as const,
    rating: 4.7, review_count: 312,
    tags: ['Ugandan', 'Vegetarian', 'Traditional', 'Quick', 'Budget'],
    imageUrl: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=800',
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
      { step_number: 2, description: 'Gradually add maize flour while stirring continuously with a wooden spoon.', duration_minutes: 5 },
      { step_number: 3, description: 'Keep stirring until mixture thickens and pulls away from pot sides.', duration_minutes: 10 },
      { step_number: 4, description: 'For beans: heat oil and sauté onions until translucent.', duration_minutes: 3 },
      { step_number: 5, description: 'Add diced tomatoes and cook for 3 minutes.', duration_minutes: 3 },
      { step_number: 6, description: 'Add cooked beans and simmer for 10 minutes. Season with salt.', duration_minutes: 10 },
      { step_number: 7, description: 'Serve posho alongside the beans stew.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Chicken Tikka Masala',
    slug: 'chicken-tikka-masala',
    description: 'Creamy, spiced tomato-based curry with tender chicken pieces. Popular in Kampala restaurants and a family favourite for special dinners.',
    author_name: 'Chef Patel',
    prep_time: 25, cook_time: 35, servings: 4,
    difficulty: 'medium' as const,
    rating: 4.8, review_count: 276,
    tags: ['Indian', 'Curry', 'Chicken', 'Creamy'],
    imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800',
    ingredients: [
      { name: 'Chicken Breast', quantity: 600, unit: 'g', notes: 'cubed' },
      { name: 'Yogurt', quantity: 1, unit: 'cup', notes: 'for marinade' },
      { name: 'Tomatoes', quantity: 400, unit: 'g', notes: 'canned or fresh, blended' },
      { name: 'Onion', quantity: 1, unit: 'piece', notes: 'diced' },
      { name: 'Garlic', quantity: 4, unit: 'cloves', notes: 'minced' },
      { name: 'Ginger', quantity: 1, unit: 'piece', notes: 'grated' },
    ],
    instructions: [
      { step_number: 1, description: 'Marinate chicken in yogurt and spices for at least 2 hours.', duration_minutes: 120 },
      { step_number: 2, description: 'Grill or pan-fry chicken until cooked through. Set aside.', duration_minutes: 10 },
      { step_number: 3, description: 'Sauté onions until golden, add garlic and ginger.', duration_minutes: 5 },
      { step_number: 4, description: 'Add tomato puree and cook for 10 minutes.', duration_minutes: 10 },
      { step_number: 5, description: 'Add chicken pieces and heat through for 5 minutes.', duration_minutes: 5 },
      { step_number: 6, description: 'Garnish with fresh coriander and serve with chapati or rice.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Avocado Toast',
    slug: 'avocado-toast',
    description: 'Simple, nutritious breakfast with creamy avocado on crusty bread. Uganda grows some of the best avocados — this is the easiest way to enjoy them.',
    author_name: 'Chef Sarah',
    prep_time: 5, cook_time: 5, servings: 2,
    difficulty: 'easy' as const,
    rating: 4.5, review_count: 156,
    tags: ['Breakfast', 'Quick', 'Healthy', 'Vegetarian'],
    imageUrl: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=800',
    ingredients: [
      { name: 'Avocado', quantity: 2, unit: 'piece', notes: 'ripe' },
      { name: 'Bread', quantity: 4, unit: 'slices', notes: 'toasted' },
      { name: 'Eggs', quantity: 2, unit: 'piece', notes: 'poached (optional)' },
      { name: 'Tomatoes', quantity: 2, unit: 'piece', notes: 'sliced (optional)' },
    ],
    instructions: [
      { step_number: 1, description: 'Toast bread slices until golden and crispy.', duration_minutes: 2 },
      { step_number: 2, description: 'Cut avocados in half and remove the pit.', duration_minutes: 1 },
      { step_number: 3, description: 'Scoop out flesh and mash with a fork.', duration_minutes: 1 },
      { step_number: 4, description: 'Season with salt, pepper, and a squeeze of lemon.', duration_minutes: 1 },
      { step_number: 5, description: 'Spread mashed avocado on toast.', duration_minutes: 1 },
      { step_number: 6, description: 'Top with poached egg and tomato slices if desired. Serve immediately.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Fruit Smoothie Bowl',
    slug: 'fruit-smoothie-bowl',
    description: 'Refreshing blend of tropical fruits topped with granola and fresh fruits. Perfect Kampala morning breakfast using local bananas and passion fruit.',
    author_name: 'Chef Lisa',
    prep_time: 10, cook_time: 0, servings: 2,
    difficulty: 'easy' as const,
    rating: 4.7, review_count: 142,
    tags: ['Breakfast', 'Healthy', 'Quick', 'Vegetarian'],
    imageUrl: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800',
    ingredients: [
      { name: 'Bananas', quantity: 2, unit: 'piece', notes: 'frozen' },
      { name: 'Passion Fruit', quantity: 3, unit: 'piece', notes: 'pulp scooped out' },
      { name: 'Yogurt', quantity: 0.5, unit: 'cup', notes: null },
      { name: 'Honey', quantity: 2, unit: 'tbsp', notes: null },
      { name: 'Mangoes', quantity: 1, unit: 'piece', notes: 'sliced for topping' },
    ],
    instructions: [
      { step_number: 1, description: 'Add frozen bananas and passion fruit pulp to a blender.', duration_minutes: 2 },
      { step_number: 2, description: 'Add yogurt and blend until thick and smooth.', duration_minutes: 2 },
      { step_number: 3, description: 'Pour into bowls.', duration_minutes: 1 },
      { step_number: 4, description: 'Top with fresh mango slices, a drizzle of honey, and granola if available.', duration_minutes: 2 },
      { step_number: 5, description: 'Serve immediately.', duration_minutes: 1 },
    ],
  },
  {
    name: 'Beef Stir Fry',
    slug: 'beef-stir-fry',
    description: 'Quick and flavourful beef with colourful vegetables. Ready in under 30 minutes — perfect for busy weeknight dinners in Kampala.',
    author_name: 'Chef Chen',
    prep_time: 15, cook_time: 10, servings: 4,
    difficulty: 'easy' as const,
    rating: 4.6, review_count: 167,
    tags: ['Asian', 'Quick', 'Meat', 'Healthy'],
    imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800',
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
      { step_number: 2, description: 'Cut vegetables into bite-sized pieces.', duration_minutes: 5 },
      { step_number: 3, description: 'Heat oil in a wok or large pan over high heat.', duration_minutes: 2 },
      { step_number: 4, description: 'Stir-fry beef for 2 minutes. Remove and set aside.', duration_minutes: 2 },
      { step_number: 5, description: 'Add vegetables and stir-fry for 3-4 minutes.', duration_minutes: 4 },
      { step_number: 6, description: 'Return beef to wok with garlic and ginger.', duration_minutes: 1 },
      { step_number: 7, description: 'Season with salt and soy sauce, toss everything together.', duration_minutes: 1 },
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

// ── Main seed function ──
async function seed(strapi: Core.Strapi) {
  console.log('🌱 Seeding database...');

  // Check if data already exists
  const existingCategories = await strapi.documents('api::category.category').findMany();
  if (existingCategories.length > 0) {
    if (process.env.FORCE_SEED === 'true') {
      console.log('🗑️  FORCE_SEED=true — clearing existing data before re-seeding...');
      // Delete in reverse dependency order
      const existingRecipes = await strapi.documents('api::recipe.recipe').findMany();
      for (const r of existingRecipes) await strapi.documents('api::recipe.recipe').delete({ documentId: r.documentId });
      const existingLists = await strapi.documents('api::shopping-list.shopping-list').findMany();
      for (const l of existingLists) await strapi.documents('api::shopping-list.shopping-list').delete({ documentId: l.documentId });
      const existingProducts = await strapi.documents('api::product.product').findMany();
      for (const p of existingProducts) await strapi.documents('api::product.product').delete({ documentId: p.documentId });
      const existingSubs = await strapi.documents('api::subcategory.subcategory').findMany();
      for (const s of existingSubs) await strapi.documents('api::subcategory.subcategory').delete({ documentId: s.documentId });
      for (const c of existingCategories) await strapi.documents('api::category.category').delete({ documentId: c.documentId });
      console.log('🗑️  Existing data cleared.');
    } else {
      console.log('⏭️  Data already exists, skipping seed. Set FORCE_SEED=true to re-seed.');
      return;
    }
  }

  // Seed categories (with images)
  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    const { imageUrl, ...data } = cat;
    const created = await strapi.documents('api::category.category').create({
      data,
      status: 'published',
    });
    categoryMap[cat.slug] = created.documentId;

    const image = await uploadImage(strapi, imageUrl, cat.slug);
    if (image) {
      await strapi.db.query('api::category.category').update({
        where: { documentId: created.documentId },
        data: { image: image.id },
      });
    }
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

  // Seed products (with images and descriptions)
  for (const prod of products) {
    const { categorySlug, subcategorySlug, imageUrl, ...data } = prod;
    const created = await strapi.documents('api::product.product').create({
      data: {
        ...data,
        is_active: true,
        category: { documentId: categoryMap[categorySlug] },
        ...(subcategorySlug ? { subcategory: { documentId: subcategoryMap[subcategorySlug] } } : {}),
      } as any,
      status: 'published',
    });

    const image = await uploadImage(strapi, imageUrl, prod.slug);
    if (image) {
      await strapi.db.query('api::product.product').update({
        where: { documentId: created.documentId },
        data: { image: image.id },
      });
    }
    console.log(`  ✅ Product: ${prod.name}`);
  }

  // Seed recipes (with images)
  for (const recipe of recipes) {
    const { imageUrl, ...data } = recipe;
    const created = await strapi.documents('api::recipe.recipe').create({
      data: data as any,
      status: 'published',
    });

    const image = await uploadImage(strapi, imageUrl, recipe.slug);
    if (image) {
      await strapi.db.query('api::recipe.recipe').update({
        where: { documentId: created.documentId },
        data: { image: image.id },
      });
    }
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
