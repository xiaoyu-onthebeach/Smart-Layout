import { useState } from 'react';
import { Layers, Pencil, SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { Layout } from '@/types';
import { ImagePickerDialog } from '@/features/editor/artboard/ImagePickerDialog';
import { ColorRow, PanelCard, PanelDivider, PanelFooter, PanelSection } from '@/features/editor/artboard/PanelKit';
import { useT } from '@/lib/i18n';

type ImageUsage = { url: string; layoutIds: Set<string>; targets: { layoutId: string; elementId: string }[] };
type ColorUsage = { color: string; apply: (next: string) => void };

// The overlay elements (coupon/logo/headline/button/bottom_banner) are baked SVG graphics with
// their own text drawn in, not editable text elements — these rows are placeholder-only mirrors
// of that baked-in copy (see position-overlay-spec.md), not wired to update anything yet.
const TEXT_PLACEHOLDERS = ['毎日のスキンケア', 'クーポンで500円OFF', '詳しくはこちら', '新発売セット'];

function PlaceholderContentRow({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        placeholder={placeholder}
        className="h-11 flex-1 rounded-lg bg-[#26262C] px-3 text-sm text-chrome-fg shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02)] outline-none placeholder:text-white/45"
      />
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-white/45" style={{ borderColor: '#40404A' }}>
        <SlidersHorizontal className="size-4" />
      </span>
    </div>
  );
}

/** Right-corner panel shown while two or more scenes are selected together — every editing option
 * lives directly in one flat list (no Style/Content tabs), broadcasting each edit to every scene
 * (or every matching element/color) across the whole selection. */
export function MultiSceneContentPanel({ setIds }: { setIds: string[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const setsById = useAppStore((s) => s.setsById);
  const layoutsById = useAppStore((s) => s.layoutsById);
  const updateLayoutStyle = useAppStore((s) => s.updateLayoutStyle);
  const updateElement = useAppStore((s) => s.updateElement);
  const openExport = useAppStore((s) => s.openExport);
  const [replacingUrl, setReplacingUrl] = useState<string | null>(null);

  const layouts = setIds
    .map((id) => {
      const set = setsById[id];
      return set ? layoutsById[set.sourceLayoutId] : null;
    })
    .filter((l): l is Layout => Boolean(l));

  if (layouts.length === 0) return null;
  const allVisible = layouts.every((l) => !l.hidden);

  // Images: only the background/hero image (the required slot) across the selection, grouped by
  // URL — the decorative overlay graphics (coupon/logo/headline/button/bottom_banner, all
  // slot: null) are excluded, so a generated size's half-dozen baked SVG assets don't each get
  // their own row here.
  const imageUsages: ImageUsage[] = [];
  const imageUsageByUrl = new Map<string, ImageUsage>();
  for (const layout of layouts) {
    for (const el of layout.elements) {
      if (el.kind !== 'image' || !el.imageUrl || el.slot === null) continue;
      let usage = imageUsageByUrl.get(el.imageUrl);
      if (!usage) {
        usage = { url: el.imageUrl, layoutIds: new Set(), targets: [] };
        imageUsageByUrl.set(el.imageUrl, usage);
        imageUsages.push(usage);
      }
      usage.layoutIds.add(layout.id);
      usage.targets.push({ layoutId: layout.id, elementId: el.id });
    }
  }

  // Selection colors: every fill/border/text/stroke color across the selection, deduped by value —
  // recoloring one row updates every place that had that exact color, across every selected scene.
  const colorUsageByHex = new Map<string, ColorUsage>();
  function recordColor(color: string | undefined, apply: (next: string) => void) {
    if (!color) return;
    const key = color.toLowerCase();
    const existing = colorUsageByHex.get(key);
    if (existing) {
      const prevApply = existing.apply;
      existing.apply = (next) => {
        prevApply(next);
        apply(next);
      };
    } else {
      colorUsageByHex.set(key, { color, apply });
    }
  }
  for (const layout of layouts) {
    recordColor(layout.backgroundColor, (c) => updateLayoutStyle(layout.id, { backgroundColor: c }));
    recordColor(layout.borderColor, (c) => updateLayoutStyle(layout.id, { borderColor: c }));
    for (const el of layout.elements) {
      if (el.kind === 'text') {
        recordColor(el.style.color, (c) => updateElement(layout.id, el.id, { style: { ...el.style, color: c } }));
        recordColor(el.style.strokeColor, (c) => updateElement(layout.id, el.id, { style: { ...el.style, strokeColor: c } }));
      } else if (el.kind === 'shape') {
        recordColor(el.style.fill, (c) => updateElement(layout.id, el.id, { style: { ...el.style, fill: c } }));
        recordColor(el.style.strokeColor, (c) => updateElement(layout.id, el.id, { style: { ...el.style, strokeColor: c } }));
      }
    }
  }
  const colorUsages = [...colorUsageByHex.values()];
  const activeReplace = replacingUrl ? imageUsageByUrl.get(replacingUrl) : null;

  return (
    <PanelCard>
      <div className="flex items-center gap-1.5 px-4 pb-1">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-[4px] border border-chrome-border bg-[#26262C] text-white/70 shadow-[0_1px_8px_1px_rgba(0,0,0,0.24)]">
          <Layers className="size-3.5" />
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-white">
          {language === 'ja' ? `${setIds.length}件のサイズを選択中` : `${setIds.length} sizes selected`}
        </span>
      </div>

      <PanelSection label={t('Images')}>
        {imageUsages.length === 0 ? (
          <span className="text-xs text-white/45">{t('No images across these scenes.')}</span>
        ) : (
          <div className="flex flex-col gap-4">
            {imageUsages.map((usage) => (
              <div key={usage.url} className="flex items-start gap-6">
                <div
                  className="size-[100px] shrink-0 rounded-2xl border bg-cover bg-center"
                  style={{ backgroundImage: `url(${usage.url})`, borderColor: '#40404A', background: '#26262C' }}
                />
                <div className="flex h-[100px] flex-col justify-center gap-2">
                  <span className="text-sm text-white/70">
                    {language === 'ja' ? `${usage.layoutIds.size}件のシーンで使用中` : `Selected in ${usage.layoutIds.size} sizes`}
                  </span>
                  <button
                    type="button"
                    className="flex h-8 w-[111px] items-center justify-center gap-2 rounded-lg border text-sm text-white transition-colors hover:bg-white/5"
                    style={{ borderColor: '#40404A' }}
                  >
                    <Pencil className="size-3.5 text-white/45" />
                    {t('Edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplacingUrl(usage.url)}
                    className="flex h-8 w-[111px] items-center justify-center gap-2 rounded-lg border text-sm text-white transition-colors hover:bg-white/5"
                    style={{ borderColor: '#40404A' }}
                  >
                    <Layers className="size-4" />
                    {t('Replace')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelSection>

      <PanelSection label={t('Text')}>
        <div className="flex flex-col gap-3">
          {TEXT_PLACEHOLDERS.map((placeholder) => (
            <PlaceholderContentRow key={placeholder} placeholder={placeholder} />
          ))}
        </div>
      </PanelSection>

      <PanelDivider />

      <PanelSection label={t('Selection colors')}>
        {colorUsages.length === 0 ? (
          <span className="text-xs text-white/45">{t('No colors found.')}</span>
        ) : (
          <div className="flex flex-col gap-2">
            {colorUsages.map((usage) => (
              <ColorRow key={usage.color} color={usage.color} onChange={(next) => usage.apply(next)} />
            ))}
          </div>
        )}
      </PanelSection>

      <PanelFooter
        visible={allVisible}
        onToggleVisible={() => {
          for (const l of layouts) updateLayoutStyle(l.id, { hidden: allVisible });
        }}
        showDownload
        onDownload={openExport}
      />

      {activeReplace && (
        <ImagePickerDialog
          open
          onOpenChange={(open) => !open && setReplacingUrl(null)}
          onSelect={(url) => {
            for (const t of activeReplace.targets) updateElement(t.layoutId, t.elementId, { imageUrl: url });
            setReplacingUrl(null);
          }}
        />
      )}
    </PanelCard>
  );
}
