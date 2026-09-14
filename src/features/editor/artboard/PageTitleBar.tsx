import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { getPreset } from '@/lib/mock';
import { PlatformMark } from '@/features/size-select/PlatformMark';
import { useT } from '@/lib/i18n';

/** Title row for a scene on the view-all canvas: name + optional platform mark + size pill. */
export function PageTitleBar({
  name,
  width,
  height,
  presetId,
  className,
  onDragHandleMouseDown,
  isPrimary,
  onRename,
  editing,
  onEditingChange,
  visible = true,
}: {
  name: string;
  width: number;
  height: number;
  presetId?: string;
  /** The layout this title bar belongs to — kept for callers, even though nothing here reads it directly. */
  layoutId: string;
  className?: string;
  /** When provided, the title bar becomes a drag handle for repositioning the scene on the canvas. */
  onDragHandleMouseDown?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  /** True for the original scene a group was spun off from — the one other sizes were generated from. */
  isPrimary?: boolean;
  /** When provided, double-clicking the name (or the scene right-click menu's "Rename") turns it
   * into an editable field. */
  onRename?: (name: string) => void;
  /** Controlled rename-mode state — lifted up so the scene's own right-click menu can also enter
   * it, not just a double-click on the name. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** View-all only: hides the name/logo/size pill once the camera is zoomed out past legibility. */
  visible?: boolean;
}) {
  const t = useT();
  const platformId = presetId ? getPreset(presetId)?.platformId : undefined;
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, name]);

  function commit() {
    onEditingChange(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename?.(trimmed);
  }

  if (!visible) return null;

  return (
    <div className={cn(className, 'group/bar', onDragHandleMouseDown && 'cursor-move')} onMouseDown={onDragHandleMouseDown}>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') onEditingChange(false);
          }}
          className="min-w-0 flex-1 rounded-sm bg-chrome-border-subtle px-1 text-sm text-chrome-fg outline-none"
        />
      ) : (
        <div className="group/name flex min-w-0 flex-1 items-center gap-1.5">
          {isPrimary ? (
            <img src="/icons/primary.svg" alt={t('Primary')} className="size-4 shrink-0" />
          ) : (
            platformId && <PlatformMark platformId={platformId} className="size-4 shrink-0" />
          )}
          <span
            className="truncate text-sm text-chrome-fg"
            onDoubleClick={(e) => {
              if (!onRename) return;
              e.stopPropagation();
              onEditingChange(true);
            }}
          >
            {name}
          </span>
        </div>
      )}

      <span className="flex h-5 shrink-0 items-center rounded-full border border-chrome-border bg-chrome-border-subtle px-2 text-xs text-chrome-fg">
        {width}x{height}
      </span>
    </div>
  );
}
