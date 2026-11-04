import type { AppState, BulkEditCanvasOrder } from '@/store/types';
import { getPreset, platforms } from '@/lib/mock';
import { classifyRatioBucket } from '@/lib/size-class';

type OrderState = Pick<AppState, 'setsById' | 'layoutsById' | 'pageGroups' | 'pageGroupIdByPage'>;

/** A banner's channel: its size's own preset's, else its group's — '' for a custom size. */
export function bannerChannel(state: OrderState, setId: string): string {
  const set = state.setsById[setId];
  const layout = set ? state.layoutsById[set.sourceLayoutId] : undefined;
  if (!layout) return '';
  const groupId = state.pageGroupIdByPage[setId];
  return getPreset(layout.size.presetId ?? '')?.platformId ?? (groupId ? state.pageGroups[groupId]?.platformId : undefined) ?? '';
}

export type BannerFormat = 'square' | 'landscape' | 'portrait';

/** Square, landscape or portrait — the same split as the Banners panel's Square/Horizontal/Vertical
 * sizes (see classifyRatioBucket), so a 600×500 counts as square. */
export function bannerFormat(width: number, height: number): BannerFormat {
  const bucket = classifyRatioBucket(width, height);
  return bucket === 'horizontal' ? 'landscape' : bucket === 'vertical' ? 'portrait' : bucket;
}

const FORMAT_ORDER: BannerFormat[] = ['square', 'landscape', 'portrait'];

/** One column of Replace's preview when it isn't arranged by set. `key` is the format, the channel
 * id ('' for custom sizes) or the "WxH" size, for the caller to label. */
export type CanvasOrderGroup = { key: string; ids: string[] };

/**
 * `ids` (in their given order) split into the columns of a non-set ordering: formats as square,
 * landscape, portrait; channels in the size catalog's order, custom sizes last; sizes widest first.
 */
export function canvasOrderGroups(state: OrderState, order: Exclude<BulkEditCanvasOrder, 'set'>, ids: string[]): CanvasOrderGroup[] {
  const byKey = new Map<string, string[]>();
  const sizes = new Map<string, { width: number; height: number }>();
  for (const id of ids) {
    const set = state.setsById[id];
    const layout = set ? state.layoutsById[set.sourceLayoutId] : undefined;
    if (!layout) continue;
    const { width, height } = layout.size;
    const key = order === 'format' ? bannerFormat(width, height) : order === 'channel' ? bannerChannel(state, id) : `${width}x${height}`;
    sizes.set(key, { width, height });
    byKey.set(key, [...(byKey.get(key) ?? []), id]);
  }
  const rank = (key: string) => {
    if (order === 'format') return FORMAT_ORDER.indexOf(key as BannerFormat);
    if (order === 'channel') {
      const index = platforms.findIndex((p) => p.id === key);
      return key === '' ? Infinity : index < 0 ? platforms.length : index;
    }
    return 0;
  };
  return [...byKey.entries()]
    .map(([key, groupIds]) => ({ key, ids: groupIds }))
    .sort((a, b) => {
      if (order !== 'size') return rank(a.key) - rank(b.key);
      const sa = sizes.get(a.key)!;
      const sb = sizes.get(b.key)!;
      return sb.width - sa.width || sb.height - sa.height;
    });
}
