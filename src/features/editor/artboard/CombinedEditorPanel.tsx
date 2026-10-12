import { Layers } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { ColorRow, PanelCard, PanelHeader, PanelSection, type EditorTarget } from './PanelKit';

function fillColorOf(target: EditorTarget): string | undefined {
  if (target.element.kind === 'text') return target.element.style.color;
  if (target.element.kind === 'shape') return target.element.style.fill;
  return undefined;
}

/** Right-corner panel shown when the selection spans mixed element kinds — only broadly-shared properties. */
export function CombinedEditorPanel({ targets }: { targets: EditorTarget[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const updateElement = useAppStore((s) => s.updateElement);
  const colorTargets = targets.filter((target) => target.element.kind !== 'image');
  const primaryColorTarget = colorTargets[0];

  function setColor(color: string) {
    for (const target of colorTargets) {
      if (target.element.kind === 'text') updateElement(target.layoutId, target.element.id, { style: { ...target.element.style, color } });
      else if (target.element.kind === 'shape') updateElement(target.layoutId, target.element.id, { style: { ...target.element.style, fill: color } });
    }
  }

  return (
    <PanelCard>
      <PanelHeader
        icon={
          <div className="flex size-6 shrink-0 items-center justify-center rounded-[4px] border border-chrome-border bg-[#26262C] text-white/70 shadow-[0_1px_8px_1px_rgba(0,0,0,0.24)]">
            <Layers className="size-3.5" />
          </div>
        }
        title={language === 'ja' ? `${targets.length}個のレイヤー` : `${targets.length} layers`}
      />

      {primaryColorTarget && (
        <PanelSection label={t('Fill')}>
          <ColorRow color={fillColorOf(primaryColorTarget) ?? '#ffffff'} onChange={setColor} />
        </PanelSection>
      )}
    </PanelCard>
  );
}
