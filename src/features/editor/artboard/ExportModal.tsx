import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { Layout, LayoutElement, Platform } from '@/types';
import { getPreset } from '@/lib/mock/presets';
import { getPlatform } from '@/lib/mock/platforms';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ElementRenderer } from './ElementRenderer';
import { SelectField } from './PanelKit';

const FILE_TYPES = ['PNG', 'JPG', 'SVG'];
const SCALE_OPTIONS = [0.5, 0.75, 1, 1.5, 2, 3];

// The exact strings `create-layout.ts` seeds an empty slot with — an export preview should only
// ever show real content, never the editor's own "still needs filling in" hints.
const PLACEHOLDER_TEXT_VALUES = new Set([
  'Add headline',
  'Add sub message',
  'Add price',
  'Add CTA',
  '見出しを追加',
  'サブメッセージを追加',
  '価格を追加',
  'CTAを追加',
]);

function isPlaceholderElement(element: LayoutElement): boolean {
  if (element.kind === 'image') return !element.imageUrl;
  if (element.kind === 'text') return PLACEHOLDER_TEXT_VALUES.has(element.content ?? '');
  return false;
}

/** A believable-but-fake file size — this prototype has no real render/export pipeline, so there's
 * no actual byte count to report. Deterministic from pixel count (and the chosen export scale),
 * not random, so it stays stable. */
function estimatedFileSizeMb(layout: Layout, scale: number): number {
  return (layout.size.width * layout.size.height * scale * scale) / 1_000_000 / 0.9;
}

function formatMb(mb: number): string {
  return `${mb.toFixed(1)}MB`;
}

type ExportSettings = { fileType: string; scale: number };
const DEFAULT_EXPORT_SETTINGS: ExportSettings = { fileType: FILE_TYPES[0], scale: SCALE_OPTIONS[2] }; // PNG, 1x

/** Traces a layout back to the platform its size preset belongs to — undefined for a custom size,
 * which has no preset (and so no platform file-size limit to check against). */
function resolvePlatform(layout: Layout): Platform | undefined {
  const presetId = layout.size.presetId;
  const preset = presetId ? getPreset(presetId) : undefined;
  return preset ? getPlatform(preset.platformId) : undefined;
}

/** Live-rendered scene preview — the same element renderer used for canvas thumbnails, so the
 * export preview always matches the banner's actual current image/text content. */
function ScenePreview({ layout, className, style }: { layout: Layout; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn('relative overflow-hidden', className)} style={{ containerType: 'inline-size', background: layout.backgroundColor ?? '#131316', ...style }}>
      {layout.elements
        .filter((el) => !isPlaceholderElement(el))
        .map((el) => (
          <ElementRenderer key={el.id} element={el} layoutWidth={layout.size.width} layoutHeight={layout.size.height} />
        ))}
    </div>
  );
}

/** Fits `w`x`h` inside `maxW`x`maxH`, preserving aspect ratio. */
function fitContain(w: number, h: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / w, maxH / h);
  return { width: w * scale, height: h * scale };
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] tracking-[-0.01em] text-white/45 uppercase">{label}</span>
      <span className="truncate text-sm text-white">{value}</span>
    </div>
  );
}

/** The "Size" field in Export settings — same trigger/list shape as `SelectField`, but each row
 * (and the trigger itself) also shows that scale's estimated file size, since that's the whole
 * point of picking a scale here. */
function ScaleSelect({ layout, value, onChange }: { layout: Layout; value: number; onChange: (v: number) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-[131px] shrink-0 items-center justify-between rounded-lg bg-[#26262C] px-3 text-xs text-white"
        >
          <span>{value}x</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-white/45">{formatMb(estimatedFileSizeMb(layout, value))}</span>
            <ChevronDown className="size-4 shrink-0 text-white" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[131px] border-chrome-border bg-[#26262C] p-3 text-chrome-fg">
        <div className="flex flex-col gap-2">
          {SCALE_OPTIONS.map((opt) => {
            const active = opt === value;
            return (
              <PopoverClose asChild key={opt}>
                <button type="button" onClick={() => onChange(opt)} className="flex w-full items-center gap-2 text-left">
                  <Check className={cn('size-4 shrink-0', active ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 text-xs text-white">{opt}x</span>
                  <span className="shrink-0 text-xs text-white/45">{formatMb(estimatedFileSizeMb(layout, opt))}</span>
                </button>
              </PopoverClose>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Export popup, opened from a panel's footer "download" button — shows the single-scene layout
 * when one scene is selected, or a multi-scene picker (sidebar) when several are selected together. */
export function ExportModal() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const exportOpen = useAppStore((s) => s.exportOpen);
  const closeExport = useAppStore((s) => s.closeExport);
  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);

  const layouts = selectedSceneIds
    .map((id) => {
      const set = setsById[id];
      return set ? layoutsById[set.sourceLayoutId] : null;
    })
    .filter((l): l is Layout => Boolean(l));

  const isMultiple = layouts.length > 1;

  const [activeIndex, setActiveIndex] = useState(0);
  // Keyed by layout id — each banner remembers its own file type/scale, since a size meant for one
  // platform can need different export settings than a size meant for another in the same batch.
  const [settingsByLayoutId, setSettingsByLayoutId] = useState<Record<string, ExportSettings>>({});

  // Fresh state every time the modal opens, so a previous export's picks never linger.
  useEffect(() => {
    if (!exportOpen) return;
    setActiveIndex(0);
    setSettingsByLayoutId({});
  }, [exportOpen]);

  const activeLayout = layouts[Math.min(activeIndex, layouts.length - 1)] ?? null;

  const previewSize = useMemo(() => {
    if (!activeLayout) return { width: 1, height: 1 };
    return fitContain(activeLayout.size.width, activeLayout.size.height, isMultiple ? 460 : 420, 300);
  }, [activeLayout, isMultiple]);

  if (!exportOpen || !activeLayout) return null;

  function settingsFor(layoutId: string): ExportSettings {
    return settingsByLayoutId[layoutId] ?? DEFAULT_EXPORT_SETTINGS;
  }

  function updateActiveSettings(patch: Partial<ExportSettings>) {
    if (!activeLayout) return;
    setSettingsByLayoutId((prev) => ({ ...prev, [activeLayout.id]: { ...settingsFor(activeLayout.id), ...patch } }));
  }

  const activeSettings = settingsFor(activeLayout.id);
  const activePlatform = resolvePlatform(activeLayout);
  const activeSizeMb = estimatedFileSizeMb(activeLayout, activeSettings.scale);
  const activeExceedsLimit = Boolean(activePlatform && activeSizeMb > activePlatform.maxFileSizeMb);

  function handleExport() {
    const count = layouts.length;
    if (language === 'ja') {
      toast.success(count > 1 ? `${count}件のサイズをエクスポートしました` : 'バナーをエクスポートしました');
    } else {
      toast.success(count > 1 ? `Exported ${count} sizes` : 'Exported banner');
    }
    closeExport();
  }

  return (
    <Dialog open={exportOpen} onOpenChange={(open) => !open && closeExport()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex max-w-[calc(100%-2rem)] flex-col gap-0 rounded-xl border-chrome-border-soft bg-[#131316] p-0 text-chrome-fg sm:max-w-[926px]',
          isMultiple ? 'w-[926px]' : 'w-[814px]',
        )}
      >
        <DialogTitle className="sr-only">{t('Export')}</DialogTitle>

        <div className="flex shrink-0 items-center justify-between p-4" style={{ borderBottom: '1px solid #40404A' }}>
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-white/70 uppercase">{t('Export')}</span>
          <button type="button" aria-label={t('Close')} onClick={closeExport} className="text-white/70 transition-colors hover:text-white">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex h-[487px] shrink-0">
          {isMultiple && (
            <div
              className="flex w-[112px] shrink-0 flex-col overflow-y-auto rounded-bl-xl"
              style={{ background: '#19191D', borderRight: '1px solid #2F2F37' }}
            >
              <div className="flex h-11 shrink-0 items-center justify-center border-b" style={{ borderColor: '#40404A' }}>
                <span className="text-[15px] font-bold text-white/70">
                  {activeIndex + 1} / {layouts.length}
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 py-6">
                {layouts.map((layout, i) => {
                  const platform = resolvePlatform(layout);
                  const exceedsLimit = Boolean(platform && estimatedFileSizeMb(layout, settingsFor(layout.id).scale) > platform.maxFileSizeMb);
                  return (
                    <button
                      key={layout.id}
                      type="button"
                      onClick={() => setActiveIndex(i)}
                      className={cn(
                        'relative flex size-20 shrink-0 items-center justify-center rounded-lg border',
                        i === activeIndex ? 'border-white' : 'border-[#40404A]',
                      )}
                    >
                      <ScenePreview layout={layout} className="size-16 rounded-[4px]" />
                      {exceedsLimit && <img src="/icons/warning.svg" alt="" className="absolute top-1 right-1 size-4" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-1 items-center justify-center" style={{ background: '#131316' }}>
            <ScenePreview
              layout={activeLayout}
              className={cn('shrink-0', !isMultiple && 'border-2 border-button-primary')}
              style={previewSize}
            />
          </div>

          <div
            className="flex w-[250px] shrink-0 flex-col justify-between rounded-br-xl p-4"
            style={{ background: '#19191D', borderLeft: '1px solid #40404A' }}
          >
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-white/80">{language === 'ja' ? 'バナー情報' : 'Banner info'}</span>
              <InfoRow label={t('Platform')} value={activePlatform ? activePlatform.name : t('Custom')} />
              <div className="flex items-end justify-between gap-2">
                <InfoRow label={t('Name')} value={activeLayout.size.label} />
                <span className="shrink-0 pb-0.5 text-xs text-white/45">
                  {activeLayout.size.width}x{activeLayout.size.height} px
                </span>
              </div>

              <div className="h-px w-full shrink-0" style={{ background: '#40404A' }} />

              <span className="text-xs font-semibold text-white/80">{t('Export settings')}</span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">{t('File type')}</span>
                <div className="flex w-[132px] shrink-0">
                  <SelectField
                    value={activeSettings.fileType}
                    options={FILE_TYPES.map((v) => ({ value: v, label: v }))}
                    onChange={(fileType) => updateActiveSettings({ fileType })}
                    triggerClassName="text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">{t('Size')}</span>
                  <ScaleSelect layout={activeLayout} value={activeSettings.scale} onChange={(scale) => updateActiveSettings({ scale })} />
                </div>
                {activeExceedsLimit && activePlatform && (
                  <div className="flex items-center gap-1.5">
                    <img src="/icons/warning.svg" alt="" className="size-4 shrink-0" />
                    <span className="text-xs tracking-[-0.01em] text-white/45">
                      {language === 'ja'
                        ? `${activePlatform.name}の${activePlatform.maxFileSizeMb}MB制限を超えています`
                        : `Exceed ${activePlatform.name}'s ${activePlatform.maxFileSizeMb}MB size limit`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              className="flex h-10 w-full shrink-0 items-center justify-center rounded-full bg-button-primary text-base font-semibold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-opacity hover:brightness-110"
            >
              {language === 'ja' ? (isMultiple ? `${layouts.length}件のサイズをエクスポート` : 'バナーをエクスポート') : isMultiple ? `Export ${layouts.length} sizes` : 'Export banner'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
