import type { Rule, RuleSet, SlotKind } from '@/types';

// Small builders to keep the 20 rulesets below readable — not a shared
// "size-class" abstraction, just authoring sugar for this mock data file.
const safeMargin = (px: number): Rule => ({ type: 'safeMargin', px });
const maxChars = (slot: SlotKind, max: number): Rule => ({ type: 'maxChars', slot, max });
const minFontSize = (slot: SlotKind, px: number): Rule => ({ type: 'minFontSize', slot, px });
const maxTextCoverage = (pct: number): Rule => ({ type: 'maxTextCoverage', pct });
const requiredSlot = (slot: SlotKind): Rule => ({ type: 'requiredSlot', slot });
const reservedZone = (edge: 'top' | 'bottom' | 'left' | 'right', px: number, label: string): Rule => ({
  type: 'reservedZone',
  edge,
  px,
  label,
});

export const NO_RULES_ID = 'rs-none';

export const ruleSets: RuleSet[] = [
  // Explicit "no rules" record, so custom sizes that opt out still carry a
  // visible, real RuleSet rather than a null/absent one.
  { id: NO_RULES_ID, name: 'No rules', rules: [] },

  // --- Amazon: ad policy caps how much of the creative can be text ---
  {
    id: 'rs-amazon-brand-hero',
    name: 'Amazon brand hero',
    rules: [
      safeMargin(24),
      requiredSlot('image'),
      requiredSlot('headline'),
      maxChars('headline', 40),
      maxChars('subMessage', 60),
      minFontSize('headline', 22),
      maxTextCoverage(25),
    ],
  },
  {
    id: 'rs-amazon-search-banner',
    name: 'Amazon search banner',
    rules: [
      safeMargin(12),
      requiredSlot('image'),
      requiredSlot('cta'),
      maxChars('headline', 24),
      maxChars('cta', 12),
      minFontSize('headline', 16),
      maxTextCoverage(20),
    ],
  },
  {
    id: 'rs-amazon-sponsored-brand',
    name: 'Amazon sponsored brand',
    rules: [
      safeMargin(20),
      requiredSlot('image'),
      requiredSlot('headline'),
      requiredSlot('cta'),
      maxChars('headline', 35),
      maxChars('subMessage', 50),
      maxChars('cta', 14),
      minFontSize('headline', 18),
      maxTextCoverage(30),
    ],
  },
  {
    id: 'rs-amazon-aplus-module',
    name: 'Amazon A+ module',
    rules: [
      safeMargin(20),
      requiredSlot('image'),
      requiredSlot('headline'),
      maxChars('headline', 45),
      maxChars('subMessage', 70),
      maxChars('price', 10),
      minFontSize('headline', 18),
      maxTextCoverage(35),
    ],
  },
  {
    id: 'rs-amazon-mobile-leaderboard',
    name: 'Amazon mobile leaderboard',
    rules: [safeMargin(4), requiredSlot('image'), maxChars('cta', 8), minFontSize('cta', 10), maxTextCoverage(20)],
  },
  {
    id: 'rs-amazon-store-spotlight',
    name: 'Amazon store spotlight',
    rules: [
      safeMargin(24),
      requiredSlot('image'),
      requiredSlot('headline'),
      requiredSlot('cta'),
      maxChars('headline', 40),
      maxChars('cta', 14),
      minFontSize('headline', 24),
      maxTextCoverage(25),
    ],
  },
  {
    id: 'rs-amazon-half-page',
    name: 'Amazon half page unit',
    rules: [
      safeMargin(12),
      requiredSlot('image'),
      requiredSlot('headline'),
      maxChars('headline', 26),
      maxChars('price', 10),
      minFontSize('headline', 16),
      maxTextCoverage(30),
    ],
  },

  // --- Rakuten: text-heavy banner culture, more generous limits ---
  {
    id: 'rs-rakuten-ichiba-top',
    name: 'Rakuten Ichiba top banner',
    rules: [
      safeMargin(16),
      requiredSlot('image'),
      requiredSlot('headline'),
      requiredSlot('cta'),
      maxChars('headline', 50),
      maxChars('subMessage', 80),
      maxChars('price', 12),
      maxChars('cta', 16),
      minFontSize('headline', 20),
      maxTextCoverage(45),
    ],
  },
  {
    id: 'rs-rakuten-shop-top',
    name: 'Rakuten shop top',
    rules: [
      safeMargin(8),
      requiredSlot('image'),
      maxChars('headline', 18),
      maxChars('price', 10),
      minFontSize('headline', 14),
      maxTextCoverage(40),
    ],
  },
  {
    id: 'rs-rakuten-super-sale',
    name: 'Rakuten Super Sale',
    rules: [
      safeMargin(12),
      requiredSlot('image'),
      requiredSlot('badge'),
      maxChars('headline', 30),
      maxChars('subMessage', 45),
      maxChars('badge', 12),
      minFontSize('headline', 18),
      maxTextCoverage(50),
    ],
  },
  {
    id: 'rs-rakuten-mobile-banner',
    name: 'Rakuten mobile banner',
    rules: [
      safeMargin(16),
      requiredSlot('image'),
      requiredSlot('headline'),
      maxChars('headline', 24),
      maxChars('subMessage', 36),
      maxChars('price', 10),
      minFontSize('headline', 16),
      maxTextCoverage(40),
      reservedZone('bottom', 64, 'App tab bar'),
    ],
  },
  {
    id: 'rs-rakuten-app-banner',
    name: 'Rakuten app download banner',
    rules: [safeMargin(4), requiredSlot('image'), maxChars('cta', 8), minFontSize('cta', 10), maxTextCoverage(25)],
  },
  {
    id: 'rs-rakuten-event-banner',
    name: 'Rakuten event feed banner',
    rules: [
      safeMargin(16),
      requiredSlot('image'),
      requiredSlot('headline'),
      requiredSlot('badge'),
      maxChars('headline', 36),
      maxChars('badge', 12),
      minFontSize('headline', 20),
      maxTextCoverage(40),
    ],
  },
  {
    id: 'rs-rakuten-category-tile',
    name: 'Rakuten category tile',
    rules: [safeMargin(10), requiredSlot('image'), maxChars('headline', 18), minFontSize('headline', 14), maxTextCoverage(30)],
  },

  // --- Yahoo ---
  {
    id: 'rs-yahoo-shopping-top',
    name: 'Yahoo! Shopping top banner',
    rules: [
      safeMargin(20),
      requiredSlot('image'),
      requiredSlot('headline'),
      requiredSlot('cta'),
      maxChars('headline', 32),
      maxChars('subMessage', 48),
      maxChars('cta', 14),
      minFontSize('headline', 18),
      maxTextCoverage(35),
    ],
  },
  {
    id: 'rs-yahoo-display-mrec',
    name: 'Yahoo display MREC',
    rules: [
      safeMargin(10),
      requiredSlot('image'),
      maxChars('headline', 22),
      maxChars('cta', 10),
      minFontSize('headline', 14),
      maxTextCoverage(40),
    ],
  },
  {
    id: 'rs-yahoo-skyscraper',
    name: 'Yahoo skyscraper',
    rules: [
      safeMargin(8),
      requiredSlot('image'),
      maxChars('headline', 12),
      maxChars('price', 8),
      minFontSize('headline', 12),
      maxTextCoverage(30),
      reservedZone('bottom', 40, 'Ad label'),
    ],
  },
  {
    id: 'rs-yahoo-square-tile',
    name: 'Yahoo square tile',
    rules: [
      safeMargin(12),
      requiredSlot('image'),
      maxChars('headline', 20),
      maxChars('cta', 10),
      minFontSize('headline', 14),
      maxTextCoverage(35),
    ],
  },
  {
    id: 'rs-yahoo-native-ad',
    name: 'Yahoo native ad unit',
    rules: [
      safeMargin(6),
      requiredSlot('image'),
      maxChars('headline', 20),
      maxChars('cta', 10),
      minFontSize('headline', 12),
      maxTextCoverage(30),
    ],
  },
  {
    id: 'rs-yahoo-billboard',
    name: 'Yahoo billboard',
    rules: [
      safeMargin(20),
      requiredSlot('image'),
      requiredSlot('headline'),
      requiredSlot('cta'),
      maxChars('headline', 30),
      maxChars('cta', 12),
      minFontSize('headline', 20),
      maxTextCoverage(35),
    ],
  },
  {
    id: 'rs-yahoo-half-page',
    name: 'Yahoo half page unit',
    rules: [safeMargin(12), requiredSlot('image'), maxChars('headline', 22), minFontSize('headline', 14), maxTextCoverage(35)],
  },

  // --- Qoo10 ---
  {
    id: 'rs-qoo10-mega-banner',
    name: 'Qoo10 mega banner',
    rules: [
      safeMargin(14),
      requiredSlot('image'),
      requiredSlot('headline'),
      maxChars('headline', 26),
      maxChars('price', 10),
      minFontSize('headline', 16),
      maxTextCoverage(35),
    ],
  },
  {
    id: 'rs-qoo10-shop-banner',
    name: 'Qoo10 shop banner',
    rules: [
      safeMargin(10),
      requiredSlot('image'),
      maxChars('headline', 18),
      minFontSize('headline', 14),
      maxTextCoverage(30),
    ],
  },
  {
    id: 'rs-qoo10-promo-tile',
    name: 'Qoo10 promo tile',
    rules: [
      safeMargin(12),
      requiredSlot('image'),
      requiredSlot('badge'),
      maxChars('headline', 20),
      maxChars('badge', 10),
      minFontSize('headline', 14),
      maxTextCoverage(45),
    ],
  },
  {
    id: 'rs-qoo10-category-banner',
    name: 'Qoo10 category banner',
    rules: [
      safeMargin(12),
      requiredSlot('image'),
      maxChars('headline', 24),
      maxChars('price', 10),
      minFontSize('headline', 14),
      maxTextCoverage(40),
    ],
  },
  {
    id: 'rs-qoo10-mobile-banner',
    name: 'Qoo10 mobile banner',
    rules: [safeMargin(6), requiredSlot('image'), maxChars('cta', 8), minFontSize('cta', 10), maxTextCoverage(25)],
  },
  {
    id: 'rs-qoo10-hero-banner',
    name: 'Qoo10 hero banner',
    rules: [
      safeMargin(18),
      requiredSlot('image'),
      requiredSlot('headline'),
      maxChars('headline', 30),
      maxChars('price', 10),
      minFontSize('headline', 18),
      maxTextCoverage(35),
    ],
  },
  {
    id: 'rs-qoo10-half-page',
    name: 'Qoo10 half page unit',
    rules: [safeMargin(12), requiredSlot('image'), maxChars('headline', 20), minFontSize('headline', 14), maxTextCoverage(30)],
  },

  // --- TikTok Shop: vertical formats reserve space for app chrome ---
  {
    id: 'rs-tiktok-product-card',
    name: 'TikTok product card',
    rules: [
      safeMargin(16),
      requiredSlot('image'),
      requiredSlot('price'),
      maxChars('headline', 22),
      maxChars('price', 10),
      minFontSize('headline', 16),
      maxTextCoverage(30),
    ],
  },
  {
    id: 'rs-tiktok-story-banner',
    name: 'TikTok story banner',
    rules: [
      safeMargin(20),
      requiredSlot('image'),
      requiredSlot('headline'),
      requiredSlot('cta'),
      maxChars('headline', 20),
      maxChars('subMessage', 28),
      maxChars('cta', 10),
      minFontSize('headline', 18),
      maxTextCoverage(25),
      reservedZone('top', 160, 'TikTok UI overlay'),
      reservedZone('bottom', 220, 'Caption & nav safe area'),
    ],
  },
  {
    id: 'rs-tiktok-feed-banner',
    name: 'TikTok feed banner',
    rules: [
      safeMargin(16),
      requiredSlot('image'),
      requiredSlot('cta'),
      maxChars('headline', 30),
      maxChars('cta', 12),
      minFontSize('headline', 18),
      maxTextCoverage(30),
    ],
  },
  {
    id: 'rs-tiktok-live-cover',
    name: 'TikTok live cover',
    rules: [
      safeMargin(20),
      requiredSlot('image'),
      requiredSlot('badge'),
      maxChars('headline', 18),
      maxChars('badge', 10),
      minFontSize('headline', 16),
      maxTextCoverage(25),
      reservedZone('top', 140, 'TikTok UI overlay'),
      reservedZone('bottom', 200, 'Caption & nav safe area'),
    ],
  },
  {
    id: 'rs-tiktok-mini-banner',
    name: 'TikTok in-feed mini banner',
    rules: [safeMargin(4), requiredSlot('image'), maxChars('cta', 8), minFontSize('cta', 10), maxTextCoverage(20)],
  },
  {
    id: 'rs-tiktok-collection-ad',
    name: 'TikTok collection ad',
    rules: [
      safeMargin(20),
      requiredSlot('image'),
      requiredSlot('cta'),
      maxChars('headline', 24),
      maxChars('cta', 12),
      minFontSize('headline', 18),
      maxTextCoverage(25),
    ],
  },
  {
    id: 'rs-tiktok-spark-cover',
    name: 'TikTok spark ad cover',
    rules: [
      safeMargin(16),
      requiredSlot('image'),
      requiredSlot('badge'),
      maxChars('headline', 18),
      maxChars('badge', 10),
      minFontSize('headline', 16),
      maxTextCoverage(25),
      reservedZone('bottom', 160, 'Caption & nav safe area'),
    ],
  },
];

export function getRuleSet(id: string): RuleSet | undefined {
  return ruleSets.find((r) => r.id === id);
}
