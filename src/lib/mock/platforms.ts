import type { Platform } from '@/types';

export const platforms: Platform[] = [
  // Rakuten leads the list — and is auto-expanded, see QuickSizeMenu, which pre-expands GROUPS[0].
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
      'amazon-medium-rectangle',
      'amazon-large-rectangle',
      'amazon-leaderboard',
      'amazon-half-page',
      'amazon-wide-skyscraper',
      'amazon-billboard',
      'amazon-mobile-leaderboard',
      'amazon-300x50',
      'amazon-414x125',
      'amazon-980x55',
      'amazon-homepage-banner-stripe',
      'amazon-home-page-banner-large',
      'amazon-detail-page-banner',
      'amazon-detail-page-banner-tablet',
      'amazon-encore-banner',
    ],
  },
  {
    id: 'qoo10',
    name: 'Qoo10',
    maxFileSizeMb: 5,
    presetIds: [
      'qoo10-shop-logo',
      'qoo10-shop-cover-mobile',
      'qoo10-shop-cover-pc',
      'qoo10-featured-products-banner-mobile',
      'qoo10-menu-bar-image-pc',
      'qoo10-qspecial-main-banner',
    ],
  },
];

export function getPlatform(id: string): Platform | undefined {
  return platforms.find((p) => p.id === id);
}
