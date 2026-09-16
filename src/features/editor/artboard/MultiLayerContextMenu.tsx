import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import type { LayoutElement } from '@/types';

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

/**
 * Right-click menu for TWO OR MORE selected layers — same shell/positioning as LayerContextMenu,
 * but every action operates on the whole selection at once. When `groupId` is set (every selected
 * element shares that one group, and nothing outside it is also selected), this shows the
 * already-grouped item set (Ungroup, single divider) instead of the plain multi-select one
 * (Group layers, same 3-divider layout as the single-layer menu minus "Insert new image").
 */
export function MultiLayerContextMenu({
  x,
  y,
  layoutId,
  elementIds,
  groupId,
  onClose,
}: {
  x: number;
  y: number;
  layoutId: string;
  elementIds: string[];
  groupId?: string;
  onClose: () => void;
}) {
  const layout = useAppStore((s) => s.layoutsById[layoutId]);
  const updateElement = useAppStore((s) => s.updateElement);
  const removeElement = useAppStore((s) => s.removeElement);
  const duplicateElement = useAppStore((s) => s.duplicateElement);
  const reorderElement = useAppStore((s) => s.reorderElement);
  const groupElements = useAppStore((s) => s.groupElements);
  const ungroupElements = useAppStore((s) => s.ungroupElements);
  const setSelectedElements = useAppStore((s) => s.setSelectedElements);
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

  const elements = elementIds.map((id) => layout?.elements.find((el) => el.id === id)).filter((el): el is LayoutElement => Boolean(el));
  if (elements.length === 0) return null;
  const allLocked = elements.every((el) => el.locked);

  function act(fn: () => void) {
    return () => {
      fn();
      onClose();
    };
  }

  function copyAll() {
    navigator.clipboard?.writeText(JSON.stringify(elements)).catch(() => {});
  }

  // Duplicates every selected element and selects the copies. `duplicateElement` copies `groupId`
  // verbatim, so without this a duplicated group's copies would silently land back in the
  // *original* group — regrouping them under a fresh id instead makes "Duplicate group" produce a
  // genuinely separate, independently-movable group, matching what the name promises.
  function duplicateAll() {
    const newIds = elementIds.map((id) => duplicateElement(layoutId, id));
    if (groupId) groupElements(layoutId, newIds);
    setSelectedElements(newIds.map((id) => ({ layoutId, elementId: id })));
  }

  function toggleLockAll() {
    for (const el of elements) updateElement(layoutId, el.id, { locked: !allLocked });
  }

  function reorderAll(direction: 'front' | 'back') {
    for (const id of elementIds) reorderElement(layoutId, id, direction);
  }

  // Each element mirrors its own content in place — same definition "Flip horizontal/vertical"
  // already has for a single layer, just applied independently to every selected one rather than
  // flipping the group as a unit around a shared center.
  function flipAll(axis: 'flipX' | 'flipY') {
    for (const el of elements) updateElement(layoutId, el.id, { [axis]: !el[axis] });
  }

  function deleteAll() {
    for (const id of elementIds) removeElement(layoutId, id);
    setSelectedElements([]);
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
      {groupId ? (
        <>
          <MenuItem label={t('Copy group')} shortcut="⌘C" onClick={act(copyAll)} />
          <MenuItem label={t('Duplicate group')} shortcut="⌘D" onClick={act(duplicateAll)} />
          <MenuItem label={t(allLocked ? 'Unlock group' : 'Lock group')} onClick={act(toggleLockAll)} />
          <MenuItem label={t('Ungroup')} onClick={act(() => ungroupElements(layoutId, groupId))} />
          <Divider />
          <MenuItem label={t('Bring to front')} shortcut="]" icon="/icons/dropdown/send-to-front.svg" onClick={act(() => reorderAll('front'))} />
          <MenuItem label={t('Send to back')} shortcut="[" icon="/icons/dropdown/send-to-bottom.svg" onClick={act(() => reorderAll('back'))} />
          <MenuItem label={t('Flip horizontal')} icon="/icons/dropdown/flip-horizontal.svg" onClick={act(() => flipAll('flipX'))} />
          <MenuItem label={t('Flip vertical')} icon="/icons/dropdown/flip-vertical.svg" onClick={act(() => flipAll('flipY'))} />
          <MenuItem label={t('Delete group')} icon="/icons/dropdown/delete.svg" onClick={act(deleteAll)} />
        </>
      ) : (
        <>
          <MenuItem label={t('Copy layer')} shortcut="⌘C" onClick={act(copyAll)} />
          <MenuItem label={t('Duplicate layer')} shortcut="⌘D" onClick={act(duplicateAll)} />
          <MenuItem label={t(allLocked ? 'Unlock layer' : 'Lock layer')} onClick={act(toggleLockAll)} />
          <MenuItem label={t('Group layers')} onClick={act(() => groupElements(layoutId, elementIds))} />
          <Divider />
          <MenuItem label={t('Bring to front')} shortcut="]" icon="/icons/dropdown/send-to-front.svg" onClick={act(() => reorderAll('front'))} />
          <MenuItem label={t('Send to back')} shortcut="[" icon="/icons/dropdown/send-to-bottom.svg" onClick={act(() => reorderAll('back'))} />
          <Divider />
          <MenuItem label={t('Flip horizontal')} icon="/icons/dropdown/flip-horizontal.svg" onClick={act(() => flipAll('flipX'))} />
          <MenuItem label={t('Flip vertical')} icon="/icons/dropdown/flip-vertical.svg" onClick={act(() => flipAll('flipY'))} />
          <Divider />
          <MenuItem label={t('Delete layer')} icon="/icons/dropdown/delete.svg" onClick={act(deleteAll)} />
        </>
      )}
    </div>
  );
}
