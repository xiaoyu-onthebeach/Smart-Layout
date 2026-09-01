import { platforms } from './platforms';
import { sizePresets } from './presets';

/** A curated bundle of a platform's own presets, offered as one multi-size pick in the "Add new banners" screen. */
export type BannerSetTemplate = { id: string; platformId: string; name: string; presetIds: string[] };

// One bundle per platform today — every preset that platform already has — rather than several
// hand-curated bundles per platform, since the mock data has no existing grouping finer than that.
export const bannerSetTemplates: BannerSetTemplate[] = platforms.map((platform) => ({
  id: `${platform.id}-banner-set`,
  platformId: platform.id,
  name: `${platform.name} banner set`,
  presetIds: sizePresets.filter((p) => p.platformId === platform.id).map((p) => p.id),
}));

export function setsForPlatform(platformId: string): BannerSetTemplate[] {
  return bannerSetTemplates.filter((t) => t.platformId === platformId);
}

export function getBannerSetTemplate(id: string): BannerSetTemplate | undefined {
  return bannerSetTemplates.find((t) => t.id === id);
}
