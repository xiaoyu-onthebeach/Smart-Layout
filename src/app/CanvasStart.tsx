import { useAppStore } from '@/store/useAppStore';
import { createEmptyLayout, nextId } from '@/lib/create-layout';
import { nearestPreset } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import type { BannerSet } from '@/types';
import { useT } from '@/lib/i18n';

// The default first banner — a plain square, no platform/preset attached, so there are no
// platform-specific safe zones or rules to satisfy while getting started.
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 600;

/** Screen 1 — the empty Beachside canvas, before any banner exists. No dialog, just an
 * illustration and a single way forward: straight into the canvas with one blank custom-size
 * scene, skipping the "choose the primary banner size" screen entirely (that screen is still
 * reachable afterward from the left panel's own "+"). */
export function CanvasStart() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const upsertLayout = useAppStore((s) => s.upsertLayout);
  const loadSet = useAppStore((s) => s.loadSet);
  const setActiveLayout = useAppStore((s) => s.setActiveLayout);
  const setActiveCanvas = useAppStore((s) => s.setActiveCanvas);

  function handleCreate() {
    const setId = nextId('set');
    const productId = nextId('product');
    const label = t('Main Square');
    const layout = createEmptyLayout({
      setId,
      productId,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      label,
      presetId: undefined,
      ruleSetId: nearestPreset(DEFAULT_WIDTH, DEFAULT_HEIGHT)?.preset.ruleSetId ?? NO_RULES_ID,
      language,
    });
    const bannerSet: BannerSet = { id: setId, name: label, sourceLayoutId: layout.id, layoutIds: [layout.id], productIds: [] };
    upsertLayout(layout);
    loadSet(bannerSet);
    setActiveCanvas(setId);
    setActiveLayout(layout.id);
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <img src="/icons/start_illustration.svg" alt="" className="h-[222px] w-[446px]" />
      <div className="flex flex-col items-center gap-3">
        <h2 className="text-[28px] font-bold text-white">{t('Create your first banner')}</h2>
        <p className="max-w-[440px] text-base text-white/70">
          {t('Create a primary banner, and adapt to all requried sizes easily.')}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCreate}
        className="flex h-11 items-center rounded-full bg-button-primary px-6 text-base font-semibold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:brightness-110"
      >
        {t('Create new banner')}
      </button>
    </div>
  );
}
