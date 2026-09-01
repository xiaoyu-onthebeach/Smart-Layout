import type { SizePreset } from '@/types';

export const sizePresets: SizePreset[] = [
  // Amazon
  { id: 'amazon-brand-hero', platformId: 'amazon', label: 'Brand store hero', width: 1500, height: 300, required: true, ruleSetId: 'rs-amazon-brand-hero' },
  { id: 'amazon-search-banner', platformId: 'amazon', label: 'Search top banner', width: 728, height: 90, required: true, ruleSetId: 'rs-amazon-search-banner' },
  { id: 'amazon-sponsored-brand', platformId: 'amazon', label: 'Sponsored brands', width: 1200, height: 628, required: false, ruleSetId: 'rs-amazon-sponsored-brand' },
  { id: 'amazon-aplus-module', platformId: 'amazon', label: 'A+ content module', width: 970, height: 600, required: false, ruleSetId: 'rs-amazon-aplus-module' },
  { id: 'amazon-mobile-leaderboard', platformId: 'amazon', label: 'Mobile leaderboard', width: 320, height: 50, required: false, ruleSetId: 'rs-amazon-mobile-leaderboard' },
  { id: 'amazon-store-spotlight', platformId: 'amazon', label: 'Store spotlight', width: 1280, height: 720, required: false, ruleSetId: 'rs-amazon-store-spotlight' },
  { id: 'amazon-half-page', platformId: 'amazon', label: 'Half page unit', width: 300, height: 600, required: false, ruleSetId: 'rs-amazon-half-page' },

  // Rakuten
  { id: 'rakuten-ichiba-top', platformId: 'rakuten', label: 'Ichiba top banner', width: 1200, height: 800, required: true, ruleSetId: 'rs-rakuten-ichiba-top' },
  { id: 'rakuten-shop-top', platformId: 'rakuten', label: 'Shop top banner', width: 180, height: 180, required: true, ruleSetId: 'rs-rakuten-shop-top' },
  { id: 'rakuten-super-sale', platformId: 'rakuten', label: 'Super Sale banner', width: 600, height: 500, required: false, ruleSetId: 'rs-rakuten-super-sale' },
  { id: 'rakuten-mobile-banner', platformId: 'rakuten', label: 'Mobile app banner', width: 640, height: 960, required: false, ruleSetId: 'rs-rakuten-mobile-banner' },
  { id: 'rakuten-app-banner', platformId: 'rakuten', label: 'App download banner', width: 336, height: 56, required: false, ruleSetId: 'rs-rakuten-app-banner' },
  { id: 'rakuten-event-banner', platformId: 'rakuten', label: 'Event feed banner', width: 1024, height: 600, required: false, ruleSetId: 'rs-rakuten-event-banner' },
  { id: 'rakuten-category-tile', platformId: 'rakuten', label: 'Category tile', width: 320, height: 640, required: false, ruleSetId: 'rs-rakuten-category-tile' },

  // Yahoo
  { id: 'yahoo-shopping-top', platformId: 'yahoo', label: 'Shopping top banner', width: 1000, height: 500, required: true, ruleSetId: 'rs-yahoo-shopping-top' },
  { id: 'yahoo-display-mrec', platformId: 'yahoo', label: 'Display MREC', width: 300, height: 250, required: false, ruleSetId: 'rs-yahoo-display-mrec' },
  { id: 'yahoo-skyscraper', platformId: 'yahoo', label: 'Skyscraper', width: 160, height: 600, required: false, ruleSetId: 'rs-yahoo-skyscraper' },
  { id: 'yahoo-square-tile', platformId: 'yahoo', label: 'Square tile', width: 300, height: 300, required: false, ruleSetId: 'rs-yahoo-square-tile' },
  { id: 'yahoo-native-ad', platformId: 'yahoo', label: 'Native ad unit', width: 300, height: 100, required: false, ruleSetId: 'rs-yahoo-native-ad' },
  { id: 'yahoo-billboard', platformId: 'yahoo', label: 'Billboard', width: 960, height: 540, required: false, ruleSetId: 'rs-yahoo-billboard' },
  { id: 'yahoo-half-page', platformId: 'yahoo', label: 'Half page unit', width: 320, height: 600, required: false, ruleSetId: 'rs-yahoo-half-page' },

  // Qoo10
  { id: 'qoo10-mega-banner', platformId: 'qoo10', label: 'Mega banner', width: 940, height: 220, required: true, ruleSetId: 'rs-qoo10-mega-banner' },
  { id: 'qoo10-shop-banner', platformId: 'qoo10', label: 'Shop banner', width: 750, height: 100, required: true, ruleSetId: 'rs-qoo10-shop-banner' },
  { id: 'qoo10-promo-tile', platformId: 'qoo10', label: 'Promo tile', width: 300, height: 300, required: false, ruleSetId: 'rs-qoo10-promo-tile' },
  { id: 'qoo10-category-banner', platformId: 'qoo10', label: 'Category banner', width: 480, height: 270, required: false, ruleSetId: 'rs-qoo10-category-banner' },
  { id: 'qoo10-mobile-banner', platformId: 'qoo10', label: 'Mobile banner', width: 320, height: 60, required: false, ruleSetId: 'rs-qoo10-mobile-banner' },
  { id: 'qoo10-hero-banner', platformId: 'qoo10', label: 'Hero banner', width: 1000, height: 560, required: false, ruleSetId: 'rs-qoo10-hero-banner' },
  { id: 'qoo10-half-page', platformId: 'qoo10', label: 'Half page unit', width: 300, height: 620, required: false, ruleSetId: 'rs-qoo10-half-page' },

  // TikTok Shop
  { id: 'tiktok-product-card', platformId: 'tiktok', label: 'Product card', width: 800, height: 800, required: true, ruleSetId: 'rs-tiktok-product-card' },
  { id: 'tiktok-story-banner', platformId: 'tiktok', label: 'Story banner', width: 1080, height: 1920, required: true, ruleSetId: 'rs-tiktok-story-banner' },
  { id: 'tiktok-feed-banner', platformId: 'tiktok', label: 'Feed banner', width: 1200, height: 628, required: false, ruleSetId: 'rs-tiktok-feed-banner' },
  { id: 'tiktok-live-cover', platformId: 'tiktok', label: 'Live cover', width: 720, height: 1280, required: false, ruleSetId: 'rs-tiktok-live-cover' },
  { id: 'tiktok-mini-banner', platformId: 'tiktok', label: 'In-feed mini banner', width: 300, height: 50, required: false, ruleSetId: 'rs-tiktok-mini-banner' },
  { id: 'tiktok-collection-ad', platformId: 'tiktok', label: 'Collection ad', width: 1200, height: 675, required: false, ruleSetId: 'rs-tiktok-collection-ad' },
  { id: 'tiktok-spark-cover', platformId: 'tiktok', label: 'Spark ad cover', width: 320, height: 640, required: false, ruleSetId: 'rs-tiktok-spark-cover' },
];

export function getPreset(id: string): SizePreset | undefined {
  return sizePresets.find((p) => p.id === id);
}

export function presetsForPlatform(platformId: string): SizePreset[] {
  return sizePresets.filter((p) => p.platformId === platformId);
}

/** Finds the closest preset by aspect ratio + scale, for the custom-size "snap to" suggestion. */
export function nearestPreset(width: number, height: number): { preset: SizePreset; distance: number } | undefined {
  if (sizePresets.length === 0) return undefined;
  const targetRatio = width / height;
  let best: { preset: SizePreset; distance: number } | undefined;
  for (const preset of sizePresets) {
    const ratio = preset.width / preset.height;
    const ratioDelta = Math.abs(Math.log(ratio) - Math.log(targetRatio));
    const scaleDelta = Math.abs(preset.width - width) / preset.width + Math.abs(preset.height - height) / preset.height;
    const distance = ratioDelta * 2 + scaleDelta;
    if (!best || distance < best.distance) best = { preset, distance };
  }
  return best;
}
