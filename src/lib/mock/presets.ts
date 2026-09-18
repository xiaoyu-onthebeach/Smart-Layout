import type { SizePreset } from '@/types';
import { NO_RULES_ID } from './rulesets';

export const sizePresets: SizePreset[] = [
  // Amazon
  { id: 'amazon-medium-rectangle', platformId: 'amazon', label: 'Medium Rectangle', width: 300, height: 250, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-large-rectangle', platformId: 'amazon', label: 'Large Rectangle', width: 336, height: 280, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-leaderboard', platformId: 'amazon', label: 'Leaderboard', width: 728, height: 90, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-half-page', platformId: 'amazon', label: 'Half Page', width: 300, height: 600, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-wide-skyscraper', platformId: 'amazon', label: 'Wide Skyscraper', width: 160, height: 600, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-billboard', platformId: 'amazon', label: 'Billboard', width: 970, height: 250, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-mobile-leaderboard', platformId: 'amazon', label: 'Mobile Leaderboard', width: 320, height: 50, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-300x50', platformId: 'amazon', label: '300x50', width: 300, height: 50, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-414x125', platformId: 'amazon', label: '414x125', width: 414, height: 125, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-980x55', platformId: 'amazon', label: '980x55', width: 980, height: 55, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-homepage-banner-stripe', platformId: 'amazon', label: 'Homepage Banner (Stripe)', width: 640, height: 100, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-home-page-banner-large', platformId: 'amazon', label: 'Home Page Banner (Large)', width: 600, height: 500, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-detail-page-banner', platformId: 'amazon', label: 'Detail Page Banner', width: 828, height: 250, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-detail-page-banner-tablet', platformId: 'amazon', label: 'Detail Page Banner (Tablet)', width: 1940, height: 500, required: false, ruleSetId: NO_RULES_ID },
  { id: 'amazon-encore-banner', platformId: 'amazon', label: 'Encore Banner', width: 2560, height: 2560, required: false, ruleSetId: NO_RULES_ID },

  // Rakuten
  { id: 'rakuten-billboard-banner', platformId: 'rakuten', label: 'Billboard banner', width: 1280, height: 200, required: false, ruleSetId: NO_RULES_ID },
  { id: 'rakuten-tall-banner', platformId: 'rakuten', label: 'Tall banner', width: 400, height: 800, required: false, ruleSetId: NO_RULES_ID },
  { id: 'rakuten-wide-banner', platformId: 'rakuten', label: 'Wide banner', width: 880, height: 320, required: false, ruleSetId: NO_RULES_ID },
  { id: 'rakuten-promo-banner', platformId: 'rakuten', label: 'Promo banner', width: 480, height: 360, required: false, ruleSetId: NO_RULES_ID },

  // Qoo10
  { id: 'qoo10-shop-logo', platformId: 'qoo10', label: 'Shop Logo', width: 220, height: 220, required: false, ruleSetId: NO_RULES_ID },
  { id: 'qoo10-shop-cover-mobile', platformId: 'qoo10', label: 'Shop Cover Image (Mobile)', width: 750, height: 150, required: false, ruleSetId: NO_RULES_ID },
  { id: 'qoo10-shop-cover-pc', platformId: 'qoo10', label: 'Shop Cover Image (PC)', width: 980, height: 150, required: false, ruleSetId: NO_RULES_ID },
  { id: 'qoo10-featured-products-banner-mobile', platformId: 'qoo10', label: 'Featured Products Banner (Mobile)', width: 686, height: 300, required: false, ruleSetId: NO_RULES_ID },
  { id: 'qoo10-menu-bar-image-pc', platformId: 'qoo10', label: 'Menu Bar Image (PC only)', width: 240, height: 100, required: false, ruleSetId: NO_RULES_ID },
  { id: 'qoo10-qspecial-main-banner', platformId: 'qoo10', label: 'Qspecial Main Banner', width: 1440, height: 676, required: false, ruleSetId: NO_RULES_ID },
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
