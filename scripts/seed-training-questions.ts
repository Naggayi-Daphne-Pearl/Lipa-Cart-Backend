/**
 * Standalone seeder for the 10 training quiz questions (5 rider + 5 shopper).
 *
 * Idempotent: matches existing rows on (role, order) and updates instead of
 * inserting duplicates, so it is safe to re-run.
 *
 * Usage (after build):  node dist/scripts/seed-training-questions.js
 */

import { createStrapi } from '@strapi/strapi';

type Role = 'rider' | 'shopper';

interface Question {
  role: Role;
  order: number;
  prompt: string;
  option_a: string;
  option_b: string;
  option_c: string;
  correct_option: 'a' | 'b' | 'c';
  explanation: string;
}

const QUESTIONS: Question[] = [
  // Rider — Safe rides, happy customers
  {
    role: 'rider',
    order: 1,
    prompt: 'You are riding and it starts to rain hard. What do you do?',
    option_a: 'Ride faster so the order doesnt delay',
    option_b: 'Slow down and ride carefully',
    option_c: 'Stop riding and cancel the order',
    correct_option: 'b',
    explanation:
      'Wet roads are slippery. The customer would rather wait 10 minutes than have an accident.',
  },
  {
    role: 'rider',
    order: 2,
    prompt: 'Before every trip, you must wear:',
    option_a: 'Just a helmet',
    option_b: 'Helmet and reflective jacket',
    option_c: 'Nothing, if it is a short trip',
    correct_option: 'b',
    explanation: 'The helmet protects your head. The jacket helps cars see you, day or night.',
  },
  {
    role: 'rider',
    order: 3,
    prompt: "You arrive at the customer's place but the gate is locked. What do you do first?",
    option_a: 'Leave the order at the gate and mark "Delivered"',
    option_b: 'Call the customer using the app',
    option_c: 'Take the order back to the shopper',
    correct_option: 'b',
    explanation: 'Always call first. Never leave food where it can be stolen or eaten by animals.',
  },
  {
    role: 'rider',
    order: 4,
    prompt: 'When do you mark the order as "Delivered" in the app?',
    option_a: 'When the shopper gives me the order',
    option_b: "When I am near the customer's house",
    option_c: 'After the customer has the order in their hand',
    correct_option: 'c',
    explanation: 'Marking too early can confuse the customer and the shopper.',
  },
  {
    role: 'rider',
    order: 5,
    prompt: 'The package bag is open or leaking when you pick it up. What do you do?',
    option_a: 'Deliver it anyway, it is not my problem',
    option_b: 'Tell the shopper before you leave to replace the packaging',
    option_c: 'Throw the order away',
    correct_option: 'b',
    explanation:
      'The shopper can repack or replace before you ride. Solving it early saves the customer.',
  },

  // Shopper — Picking the best, talking the best
  {
    role: 'shopper',
    order: 1,
    prompt: 'The customer ordered tomatoes. Which one do you pick?',
    option_a: 'Soft, with a small dark spot',
    option_b: 'Firm, smooth skin, bright red',
    option_c: 'The cheapest one on the table',
    correct_option: 'b',
    explanation: 'Firm and smooth means fresh. Soft spots mean it will go bad quickly.',
  },
  {
    role: 'shopper',
    order: 2,
    prompt: 'The customer ordered ripe avocado. How do you check?',
    option_a: 'Press very hard with my thumb',
    option_b: 'Press gently — it should give a little, not feel hard or mushy',
    option_c: 'Cut it open in the market',
    correct_option: 'b',
    explanation: 'Hard pressing bruises the fruit. A gentle press tells you if it is ready.',
  },
  {
    role: 'shopper',
    order: 3,
    prompt: 'The matooke the customer ordered is finished in the market. What do you do?',
    option_a: 'Pack a different food without telling them',
    option_b: 'Call or message the customer and suggest a replacement',
    option_c: 'Cancel the whole order',
    correct_option: 'b',
    explanation: 'The customer must always agree before you change their order.',
  },
  {
    role: 'shopper',
    order: 4,
    prompt:
      'You called the customer about a missing item but they did not pick up. What do you do?',
    option_a: 'Choose for them — I know best',
    option_b: 'Send a message in the app and wait a few minutes',
    option_c: 'Just refund them quietly',
    correct_option: 'b',
    explanation: 'A message stays on their phone. Waiting a little gives them a chance to reply.',
  },
  {
    role: 'shopper',
    order: 5,
    prompt: 'A bunch of greens (sukuma / dodo) looks yellow at the edges. Do you pack it?',
    option_a: 'Yes, the customer will not notice',
    option_b: 'No — pick a fresh green bunch instead',
    option_c: 'Yes, but cut off the yellow parts first',
    correct_option: 'b',
    explanation: 'Yellow leaves are old leaves. Pick what you would buy for your own family.',
  },
];

async function seed(strapi: any) {
  let created = 0;
  let updated = 0;

  for (const q of QUESTIONS) {
    const existing = await strapi.db
      .query('api::training-question.training-question')
      .findOne({ where: { role: q.role, order: q.order } });

    if (existing) {
      await strapi.db
        .query('api::training-question.training-question')
        .update({ where: { id: existing.id }, data: q });
      updated += 1;
    } else {
      await strapi.db.query('api::training-question.training-question').create({ data: q });
      created += 1;
    }
  }

  console.log(
    `[seed-training-questions] ${created} created, ${updated} updated, ${QUESTIONS.length} total`,
  );
}

async function main() {
  console.log('[seed-training-questions] Booting Strapi...');
  const app = await createStrapi({ distDir: './dist' }).load();
  try {
    await seed(app);
  } finally {
    await app.destroy();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-training-questions] Error:', err?.message ?? err);
  process.exit(1);
});
