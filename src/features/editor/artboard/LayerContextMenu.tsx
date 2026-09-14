import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';

function MenuItem({ label, shortcut, icon, onClick }: { label: string; shortcut?: string; icon?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm text-white transition-colors hover:bg-white/10"
    >
      {icon && <img src={icon} alt="" className="size-5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <span className="shrink-0 text-sm text-white/45">{shortcut}</span>}
    </button>
  );
}

function Divider() {
  return (
    <div className="flex h-2 w-full shrink-0 items-center">
      <div className="h-px w-full" style={{ background: '#40404A' }} />
    </div>
  );
}

/** Right-click menu for an image layer on the artboard — positioned at the cursor, clamped to the viewport. */
export function LayerContextMenu({
  x,
  y,
  layoutId,
  elementId,
  onClose,
  onInsertNewImage,
}: {
  x: number;
  y: number;
  layoutId: string;
  elementId: string;
  onClose: () => void;
  onInsertNewImage: () => void;
}) {
  const element = useAppStore((s) => s.layoutsById[layoutId]?.elements.find((el) => el.id === elementId));
  const updateElement = useAppStore((s) => s.updateElement);
  const removeElement = useAppStore((s) => s.removeElement);
  const duplicateElement = useAppStore((s) => s.duplicateElement);
  const reorderElement = useAppStore((s) => s.reorderElement);
  const t = useT();

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp to the viewport once the menu's real size is known, so it never renders off-screen for a
  // right-click near the right or bottom edge.
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!element) return null;

  function act(fn: () => void) {
    return () => {
      fn();
      onClose();
    };
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex w-max flex-col gap-0 rounded-lg border p-1"
      style={{
        left: pos.left,
        top: pos.top,
        background: 'rgba(38,38,44,0.88)',
        borderColor: '#40404A',
        boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)',
        backdropFilter: 'blur(16px)',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem label={t('Copy layer')} shortcut="⌘C" onClick={act(() => navigator.clipboard?.writeText(JSON.stringify(element)).catch(() => {}))} />
      <MenuItem label={t('Duplicate layer')} shortcut="⌘D" onClick={act(() => duplicateElement(layoutId, elementId))} />
      <MenuItem label={t('Lock layer')} onClick={act(() => updateElement(layoutId, elementId, { locked: !element.locked }))} />
      <Divider />
      <MenuItem
        label={t('Bring to front')}
        shortcut="]"
        icon="/icons/dropdown/send-to-front.svg"
        onClick={act(() => reorderElement(layoutId, elementId, 'front'))}
      />
      <MenuItem
        label={t('Send to back')}
        shortcut="["
        icon="/icons/dropdown/send-to-bottom.svg"
        onClick={act(() => reorderElement(layoutId, elementId, 'back'))}
      />
      <Divider />
      <MenuItem
        label={t('Flip horizontal')}
        icon="/icons/dropdown/flip-horizontal.svg"
        onClick={act(() => updateElement(layoutId, elementId, { flipX: !element.flipX }))}
      />
      <MenuItem
        label={t('Flip vertical')}
        icon="/icons/dropdown/flip-vertical.svg"
        onClick={act(() => updateElement(layoutId, elementId, { flipY: !element.flipY }))}
      />
      <Divider />
      <MenuItem
        label={t('Insert new image')}
        icon="/icons/dropdown/add-image.svg"
        onClick={() => {
          onInsertNewImage();
          onClose();
        }}
      />
      <Divider />
      <MenuItem label={t('Delete layer')} icon="/icons/dropdown/delete.svg" onClick={act(() => removeElement(layoutId, elementId))} />
    </div>
  );
}
