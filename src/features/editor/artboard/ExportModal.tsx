import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { Layout } from '@/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ElementRenderer } from './ElementRenderer';
import { SelectField } from './PanelKit';

const FILE_TYPES = ['PNG', 'JPG', 'SVG'];
const SCALES = ['1x', '2x', '3x'];

/** A believable-but-fake file size — this prototype has no real render/export pipeline, so there's
 * no actual byte count to report. Deterministic from pixel count, not random, so it stays stable. */
function estimatedFileSize(layout: Layout): string {
  const mb = (layout.size.width * layout.size.height) / 1_000_000 / 0.9;
  return `${mb.toFixed(1)} MB`;
}

/** Live-rendered scene preview — the same element renderer used for canvas thumbnails, so the
 * export preview always matches the banner's actual current image/text content. */
function ScenePreview({ layout, className, style }: { layout: Layout; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn('relative overflow-hidden', className)} style={{ containerType: 'inline-size', background: layout.backgroundColor ?? '#131316', ...style }}>
      {layout.elements.map((el) => (
        <ElementRenderer key={el.id} element={el} layoutWidth={layout.size.width} layoutHeight={layout.size.height} />
      ))}
    </div>
  );
}

/** Fits `w`x`h` inside `maxW`x`maxH`, preserving aspect ratio (same idea as ArtboardScene's own contain-fit). */
function fitContain(w: number, h: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / w, maxH / h);
  return { width: w * scale, height: h * scale };
}

function InfoRow({ checkbox, checked, onCheckedChange, label, value }: { checkbox: boolean; checked?: boolean; onCheckedChange?: (v: boolean) => void; label: string; value: string }) {
  return (
    <div className="flex h-10 items-center gap-3">
      {checkbox ? (
        <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange?.(v === true)} className="border-white/45 data-[state=checked]:border-button-primary" />
      ) : (
        <span className="size-6 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-white">{label}</span>
      <span className="shrink-0 text-sm text-white/45">{value}</span>
    </div>
  );
}

/** Export popup, opened from a panel's footer "download" button — shows the single-scene layout
 * when one scene is selected, or a multi-scene picker (sidebar + per-scene include checkboxes)
 * when several are selected together. */
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
  const [fileType, setFileType] = useState(FILE_TYPES[0]);
  const [scale, setScale] = useState(SCALES[0]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // Fresh state every time the modal opens, so a previous export's picks never linger.
  useEffect(() => {
    if (!exportOpen) return;
    setActiveIndex(0);
    setFileType(FILE_TYPES[0]);
    setScale(SCALES[0]);
    setCheckedIds(new Set(layouts.map((l) => l.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportOpen]);

  const activeLayout = layouts[Math.min(activeIndex, layouts.length - 1)] ?? null;
  const checkedCount = checkedIds.size;

  const previewSize = useMemo(() => {
    if (!activeLayout) return { width: 1, height: 1 };
    return fitContain(activeLayout.size.width, activeLayout.size.height, isMultiple ? 460 : 420, 300);
  }, [activeLayout, isMultiple]);

  if (!exportOpen || !activeLayout) return null;

  function toggleChecked(id: string, next: boolean) {
    setCheckedIds((prev) => {
      const nextSet = new Set(prev);
      if (next) nextSet.add(id);
      else nextSet.delete(id);
      return nextSet;
    });
  }

  function handleExport() {
    const count = isMultiple ? checkedCount : 1;
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

        <div className="flex shrink-0 items-center justify-between px-4 py-6">
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
                {layouts.map((layout, i) => (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className={cn('flex size-20 shrink-0 items-center justify-center rounded-lg border', i === activeIndex ? 'border-white' : 'border-[#40404A]')}
                  >
                    <ScenePreview layout={layout} className="size-16 rounded-[4px]" />
                  </button>
                ))}
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
              <div className="flex flex-col">
                <InfoRow
                  checkbox={isMultiple}
                  checked={checkedIds.has(activeLayout.id)}
                  onCheckedChange={(v) => toggleChecked(activeLayout.id, v)}
                  label={activeLayout.size.label}
                  value={`${activeLayout.size.width}x${activeLayout.size.height}`}
                />
                <InfoRow checkbox={isMultiple} checked={checkedIds.has(activeLayout.id)} onCheckedChange={(v) => toggleChecked(activeLayout.id, v)} label={t('Size')} value={estimatedFileSize(activeLayout)} />
              </div>

              <div className="h-px w-full shrink-0" style={{ background: '#40404A' }} />

              <span className="text-xs font-semibold text-white/80">{t('Export settings')}</span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">{t('File type')}</span>
                <div className="flex w-[132px] shrink-0">
                  <SelectField value={fileType} options={FILE_TYPES.map((v) => ({ value: v, label: v }))} onChange={setFileType} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">{t('Size')}</span>
                <div className="flex w-[131px] shrink-0">
                  <SelectField value={scale} options={SCALES.map((v) => ({ value: v, label: v }))} onChange={setScale} />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={isMultiple && checkedCount === 0}
              className="flex h-10 w-full shrink-0 items-center justify-center rounded-full bg-button-primary text-base font-semibold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-opacity hover:brightness-110 disabled:opacity-40"
            >
              {language === 'ja'
                ? isMultiple
                  ? `${checkedCount}件のサイズをエクスポート`
                  : 'バナーをエクスポート'
                : isMultiple
                  ? `Export ${checkedCount} sizes`
                  : 'Export banner'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
