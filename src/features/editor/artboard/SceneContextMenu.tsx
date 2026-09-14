import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';

function MenuItem({ label, icon, onClick }: { label: string; icon?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm text-white transition-colors hover:bg-white/10"
    >
      {icon && <img src={icon} alt="" className="size-5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
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

/** Right-click menu for a scene (view-all card or the single-editor's own frame) — positioned at
 * the cursor, clamped to the viewport, same shell as `LayerContextMenu`. */
export function SceneContextMenu({
  x,
  y,
  hidden,
  onClose,
  onEdit,
  onToggleHidden,
  onRename,
  onDuplicate,
  onDelete,
}: {
  x: number;
  y: number;
  /** Whether this scene is currently hidden on the canvas — flips the "Hide"/"Show" label. */
  hidden: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleHidden: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

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
      <MenuItem label={t('Edit banner')} onClick={act(onEdit)} />
      <MenuItem label={hidden ? t('Show banner') : t('Hide banner')} onClick={act(onToggleHidden)} />
      <Divider />
      <MenuItem label={t('Rename banner')} onClick={act(onRename)} />
      <MenuItem label={t('Duplicate banner')} onClick={act(onDuplicate)} />
      <Divider />
      <MenuItem label={t('Remove banner')} icon="/icons/dropdown/delete.svg" onClick={act(onDelete)} />
    </div>
  );
}
