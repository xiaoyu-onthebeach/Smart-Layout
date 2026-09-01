import type { Platform } from '@/types';

export const platforms: Platform[] = [
  {
    id: 'amazon',
    name: 'Amazon',
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
    id: 'rakuten',
    name: 'Rakuten',
    presetIds: [
      'rakuten-ichiba-top',
      'rakuten-shop-top',
      'rakuten-super-sale',
      'rakuten-mobile-banner',
      'rakuten-app-banner',
      'rakuten-event-banner',
      'rakuten-category-tile',
    ],
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
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
