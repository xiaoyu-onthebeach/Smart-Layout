import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { createEmptyLayout, nextId } from '@/lib/create-layout';
import { genericSizeName } from '@/lib/generic-size-name';
import { getPlatform, getPreset, nearestPreset, platforms, presetsForPlatform, sizePresets } from '@/lib/mock';
import { NO_RULES_ID } from '@/lib/mock/rulesets';
import type { BannerSet } from '@/types';
import { PlatformSizeCard } from './SizeTile';

const ALL_SIZES_ID = 'all';

/** True for whichever preset is first within its own platform's list — the "Recommended Size" pill. */
function isRecommended(presetId: string, platformId: string): boolean {
  return presetsForPlatform(platformId)[0]?.id === presetId;
}

/** Screen — a full-page "choose the primary banner size" overlay, opened from CanvasStart (or the
 * left panel's "+"). Picking a size just creates that one primary banner; additional sizes are
 * spun off afterwards from the canvas itself, not from here. */
export function AddBannersPanel() {
  const sizeSelectOpen = useAppStore((s) => s.sizeSelectOpen);
  const closeSizeSelect = useAppStore((s) => s.closeSizeSelect);
  const upsertLayout = useAppStore((s) => s.upsertLayout);
  const loadSet = useAppStore((s) => s.loadSet);
  const setActiveLayout = useAppStore((s) => s.setActiveLayout);
  const setCanvasMode = useAppStore((s) => s.setCanvasMode);
  const setActiveCanvas = useAppStore((s) => s.setActiveCanvas);
  const language = useAppStore((s) => s.language);
  const t = useT();

  const [query, setQuery] = useState('');
  const [activeNavId, setActiveNavId] = useState<string>(platforms[0].id);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [customSize, setCustomSize] = useState<{ width: number; height: number } | null>(null);
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');

  // Fresh state every time the screen is opened, so a previous session's picks never linger.
  useEffect(() => {
    if (!sizeSelectOpen) return;
    setQuery('');
    setActiveNavId(platforms[0].id);
    setSelectedPresetId(null);
    setCustomSize(null);
    setCustomWidth('');
    setCustomHeight('');
  }, [sizeSelectOpen]);

  useEffect(() => {
    if (!sizeSelectOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeSizeSelect();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sizeSelectOpen, closeSizeSelect]);

  const q = query.trim().toLowerCase();
  const qCompact = q.replace(/\s+/g, '');
  const visiblePresets = useMemo(() => {
    const list = activeNavId === ALL_SIZES_ID ? sizePresets : presetsForPlatform(activeNavId);
    return list.filter((p) => {
      if (!q) return true;
      const size = `${p.width}x${p.height}`;
      return p.label.toLowerCase().includes(q) || size.includes(qCompact);
    });
  }, [activeNavId, q, qCompact]);

  function selectNav(id: string) {
    setActiveNavId(id);
    setCustomSize(null);
    setSelectedPresetId(null);
  }

  function selectPreset(id: string) {
    setCustomSize(null);
    setSelectedPresetId(id);
  }

  function addCustomEntry() {
    const width = Math.max(1, Math.round(Number(customWidth)));
    const height = Math.max(1, Math.round(Number(customHeight)));
    if (!width || !height) return;
    setSelectedPresetId(null);
    setCustomSize({ width, height });
    setCustomWidth('');
    setCustomHeight('');
  }

  const canCreate = Boolean(selectedPresetId || customSize);

  function handleCreate() {
    const item = selectedPresetId
      ? (() => {
          const preset = getPreset(selectedPresetId);
          return preset ? { width: preset.width, height: preset.height, label: preset.label, presetId: preset.id, ruleSetId: preset.ruleSetId } : null;
        })()
      : customSize
        ? {
            width: customSize.width,
            height: customSize.height,
            label: genericSizeName(customSize.width, customSize.height, language),
            presetId: undefined as string | undefined,
            ruleSetId: nearestPreset(customSize.width, customSize.height)?.preset.ruleSetId ?? NO_RULES_ID,
          }
        : null;
    if (!item) return;

    const setId = nextId('set');
    const productId = nextId('product');
    const layout = createEmptyLayout({
      setId,
      productId,
      width: item.width,
      height: item.height,
      label: item.label,
      presetId: item.presetId,
      ruleSetId: item.ruleSetId,
      language,
    });
    const bannerSet: BannerSet = { id: setId, name: item.label, sourceLayoutId: layout.id, layoutIds: [layout.id], productIds: [] };
    upsertLayout(layout);
    loadSet(bannerSet);
    setActiveCanvas(setId);
    setActiveLayout(layout.id);
    setCanvasMode('viewAll');
    closeSizeSelect();
  }

  if (!sizeSelectOpen) return null;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.9)' }}>
      <div className="mx-auto flex min-h-full w-full max-w-[1902px] flex-col gap-6 px-[50px] py-[50px] text-chrome-fg">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-[30px] font-bold text-white">{t('Choose the primary banner size')}</h1>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate}
                className="flex h-10 items-center rounded-full bg-button-primary px-6 text-base font-semibold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-opacity disabled:opacity-40"
              >
                {t('Create new banner')}
              </button>
              <button
                type="button"
                onClick={closeSizeSelect}
                className="flex h-10 items-center rounded-full border px-6 text-base font-semibold text-white transition-colors hover:bg-white/5"
                style={{ borderColor: '#40404A' }}
              >
                {t('Cancel')}
              </button>
            </div>
          </div>
          <p className="text-base text-white">
            {t(
              'Each platform size brings its own rules — safe zones, font minimums and text limits appear on the banner scene as you design.',
            )}
          </p>
        </div>

        <div className="h-px w-full shrink-0" style={{ background: '#40404A' }} />

        <div className="flex min-h-0 flex-1 gap-12">
          <div className="flex w-[260px] shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => selectNav(ALL_SIZES_ID)}
              className={cn(
                'flex h-14 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-sm text-white transition-colors',
                activeNavId === ALL_SIZES_ID ? 'bg-[#212128]' : 'hover:bg-white/5',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ background: '#2F2F37' }}>
                <LayoutGrid className="size-5 text-white/45" />
              </span>
              {t('All sizes')}
            </button>

            {platforms.map((platform) => (
              <button
                key={platform.id}
                type="button"
                onClick={() => selectNav(platform.id)}
                className={cn(
                  'flex h-14 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-sm text-white transition-colors',
                  activeNavId === platform.id ? 'bg-[#212128]' : 'hover:bg-white/5',
                )}
              >
                <img src={`/icons/ec-platform-icon/${platform.id}.svg`} alt="" className="size-10 shrink-0 rounded-lg" />
                {platform.name}
              </button>
            ))}

            <div className="flex items-center justify-center gap-2 py-2">
              <div className="h-px flex-1" style={{ background: '#40404A' }} />
              <div className="h-px flex-1" style={{ background: '#40404A' }} />
            </div>

            <span className="px-1 text-sm text-white">{t('Custom size')}</span>
            <div className="flex h-11 shrink-0 items-center gap-2">
              <input
                type="number"
                min={1}
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                placeholder={t('Width')}
                className="h-8 w-[94px] rounded-lg border border-[#50505D] bg-[#26262C] px-2 text-center text-sm text-white outline-none placeholder:text-white/45"
              />
              <input
                type="number"
                min={1}
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                placeholder={t('Height')}
                onKeyDown={(e) => e.key === 'Enter' && addCustomEntry()}
                className="h-8 w-[94px] rounded-lg border border-[#50505D] bg-[#26262C] px-2 text-center text-sm text-white outline-none placeholder:text-white/45"
              />
              <button
                type="button"
                aria-label={t('Use custom size')}
                onClick={addCustomEntry}
                disabled={!(Number(customWidth) > 0 && Number(customHeight) > 0)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2D88FF] text-white transition-opacity disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {customSize && (
              <span className="px-1 text-xs text-white/65">
                {language === 'ja'
                  ? `カスタム ${customSize.width}x${customSize.height} を選択中`
                  : `Custom ${customSize.width}x${customSize.height} selected`}
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-9">
            <div
              className="flex h-[47px] shrink-0 items-center gap-2 rounded-full border px-4"
              style={{ background: 'rgba(38,38,44,0.88)', borderColor: '#2F2F37' }}
            >
              <Search className="size-4 text-white/45" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Find the banner size')}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-wrap content-start gap-10 overflow-y-auto pb-2">
              {visiblePresets.length === 0 ? (
                <span className="w-full py-10 text-center text-sm text-white/45">
                  {language === 'ja' ? `"${query}" に一致するサイズがありません` : `No sizes match "${query}"`}
                </span>
              ) : (
                visiblePresets.map((preset) => (
                  <PlatformSizeCard
                    key={preset.id}
                    preset={preset}
                    platformName={getPlatform(preset.platformId)?.name ?? ''}
                    recommended={isRecommended(preset.id, preset.platformId)}
                    selected={selectedPresetId === preset.id}
                    onSelect={() => selectPreset(preset.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
