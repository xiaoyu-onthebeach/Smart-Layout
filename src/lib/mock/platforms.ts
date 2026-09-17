import type { Platform } from '@/types';

export const platforms: Platform[] = [
  // Rakuten leads the list (and is auto-expanded — see QuickSizeMenu, which pre-expands
  // GROUPS[0]) for the Lancome demo, whose sizes are all Rakuten presets.
  {
    id: 'rakuten',
    name: 'Rakuten',
    maxFileSizeMb: 5,
    presetIds: ['rakuten-billboard-banner', 'rakuten-wide-banner', 'rakuten-tall-banner', 'rakuten-promo-banner'],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    maxFileSizeMb: 5,
    presetIds: [
      'amazon-brand-hero',
      'amazon-search-banner',
      'amazon-sponsored-brand',
      'amazon-aplus-module',
      'amazon-mobile-leaderboard',
      'amazon-store-spotlight',
      'amazon-half-page',
    ],
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    maxFileSizeMb: 5,
    presetIds: [
      'yahoo-shopping-top',
      'yahoo-display-mrec',
      'yahoo-skyscraper',
      'yahoo-square-tile',
      'yahoo-native-ad',
      'yahoo-billboard',
      'yahoo-half-page',
    ],
  },
  {
    id: 'qoo10',
    name: 'Qoo10',
    maxFileSizeMb: 5,
    presetIds: [
      'qoo10-mega-banner',
      'qoo10-shop-banner',
      'qoo10-promo-tile',
      'qoo10-category-banner',
      'qoo10-mobile-banner',
      'qoo10-hero-banner',
      'qoo10-half-page',
    ],
  },
  {
    id: 'tiktok',
    name: 'TikTok Shop',
    maxFileSizeMb: 5,
    presetIds: [
      'tiktok-product-card',
      'tiktok-story-banner',
      'tiktok-feed-banner',
      'tiktok-live-cover',
      'tiktok-mini-banner',
      'tiktok-collection-ad',
      'tiktok-spark-cover',
    ],
  },
];

export function getPlatform(id: string): Platform | undefined {
  return platforms.find((p) => p.id === id);
}
