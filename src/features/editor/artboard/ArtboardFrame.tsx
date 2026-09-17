import { useEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { nextId, layoutHasContent } from '@/lib/create-layout';
import { useApplyImage } from '@/hooks/useApplyImage';
import type { Layout, LayoutElement, ShapeKind } from '@/types';
import { ElementRenderer } from './ElementRenderer';
import { DraggableImageElement } from './DraggableImageElement';
import { EditableTextElement } from './EditableTextElement';
import { SelectableShapeElement } from './SelectableShapeElement';
import { ImagePickerDialog } from './ImagePickerDialog';
import { ImageBox } from './ImageBox';
import { LayerContextMenu } from './LayerContextMenu';
import { MultiLayerContextMenu } from './MultiLayerContextMenu';
import { RESIZE_HANDLES, type ResizeHandle } from './useElementDrag';

/** The focus-pick box always starts at this size (clamped to the frame itself, for a tiny scene),
 * centered — there's no more empty "draw it yourself" state to size it from scratch. */
const DEFAULT_FOCUS_RECT_SIZE = 300;
const FOCUS_RECT_MIN_SIZE = 24;

// Same 8-handle layout as SelectionBoundingBox, but invisible — the focus box keeps its own plain
// solid blue border (not SelectionBoundingBox's thinner outline-only look) with drag-to-resize
// still working underneath via these bare hit zones, cursor-only, no visible squares. Edge zones
// span the whole side (not just a short strip at the middle) so any point along the border drags.
const FOCUS_HANDLE_HIT = 12;

function focusHandleCursor(handle: ResizeHandle): string {
  return handle === 'nw' || handle === 'se' ? 'nwse-resize' : handle === 'ne' || handle === 'sw' ? 'nesw-resize' : handle === 'n' || handle === 's' ? 'ns-resize' : 'ew-resize';
}

function focusHandleStyle(handle: ResizeHandle): CSSProperties {
  const isCorner = handle.length === 2;
  const half = FOCUS_HANDLE_HIT / 2;
  const style: CSSProperties = { position: 'absolute', cursor: focusHandleCursor(handle) };
  if (isCorner) {
    style.width = FOCUS_HANDLE_HIT;
    style.height = FOCUS_HANDLE_HIT;
  } else if (handle === 'n' || handle === 's') {
    style.left = FOCUS_HANDLE_HIT;
    style.right = FOCUS_HANDLE_HIT;
    style.height = FOCUS_HANDLE_HIT;
  } else {
    style.top = FOCUS_HANDLE_HIT;
    style.bottom = FOCUS_HANDLE_HIT;
    style.width = FOCUS_HANDLE_HIT;
  }
  if (handle.includes('n')) style.top = -half;
  if (handle.includes('s')) style.bottom = -half;
  if (handle.includes('w')) style.left = -half;
  if (handle.includes('e')) style.right = -half;
  return style;
}

const EXPAND_DURATION_MS = 5000;

/** The frame a shape-tool drag should produce — plain bounding box for rect/ellipse, but a 1px-
 * thick bar along whichever axis the drag moved further on for 'line' (this data model has no
 * rotation, so an arbitrary-angle line isn't representable; snapping to the drag's dominant axis
 * is the closest a frame-only shape can get to "draw a line by dragging"). */
function shapeDragFrame(kind: ShapeKind, start: { x: number; y: number }, current: { x: number; y: number }) {
  const dragW = Math.abs(current.x - start.x);
  const dragH = Math.abs(current.y - start.y);
  if (kind === 'line') {
    if (dragW >= dragH) {
      return { x: Math.min(start.x, current.x), y: (start.y + current.y) / 2 - 0.5, w: Math.max(dragW, 1), h: 1 };
    }
    return { x: (start.x + current.x) / 2 - 0.5, y: Math.min(start.y, current.y), w: 1, h: Math.max(dragH, 1) };
  }
  return { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), w: dragW, h: dragH };
}

/**
 * The banner frame — shared by the single-page editor and the view-all canvas.
 * `active` frames are fully interactive (drag/resize image, place text/shape,
 * edit text in place); inactive frames render the exact same content but as a
 * static preview — a plain click both activates it and arms a drag of the
 * whole scene in the same motion (see `handleFrameMouseDown`'s `!active`
 * branch), so a still click just activates/selects it, and a drag moves the
 * scene rather than any layer, since layers aren't individually interactive
 * until activation has already landed.
 */
export function ArtboardFrame({
  layout,
  scale,
  width,
  height,
  active,
  onActivate,
  onSceneMouseDown,
  onSceneContextMenu,
  showEmptyStateHint = true,
  className,
  style,
}: {
  layout: Layout;
  scale: number;
  width: number;
  height: number;
  active: boolean;
  onActivate?: () => void;
  /** View-all only: starts a snap-aware drag of the whole scene, in place of the old select-only click. */
  onSceneMouseDown?: (e: ReactMouseEvent) => void;
  /** Right-click anywhere on the frame that isn't itself already handled (e.g. an image layer's own
   * context menu, which stops propagation) — the scene-level "Duplicate banner / Delete / Preview" menu. */
  onSceneContextMenu?: (e: ReactMouseEvent) => void;
  /** View-all only: hides the "Choose or drag your visual" illustration/text once the camera is zoomed out past legibility. */
  showEmptyStateHint?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const t = useT();
  const layoutId = layout.id;
  const nativeWidth = layout.size.width;
  const nativeHeight = layout.size.height;

  const selectedSceneIds = useAppStore((s) => s.selectedSceneIds);
  const selectScene = useAppStore((s) => s.selectScene);
  const isSceneSelected = selectedSceneIds.includes(layout.setId);
  const updateElement = useAppStore((s) => s.updateElement);
  const addElement = useAppStore((s) => s.addElement);
  const setEditingTextElement = useAppStore((s) => s.setEditingTextElement);
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const shapeToolKind = useAppStore((s) => s.shapeToolKind);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const autoMatchedElements = useAppStore((s) => s.autoMatchedElements);
  const activeGuides = useAppStore((s) => s.activeGuides);
  const editingTextElementId = useAppStore((s) => s.editingTextElementId);
  const selectElement = useAppStore((s) => s.selectElement);
  const setSelectedElements = useAppStore((s) => s.setSelectedElements);
  const isSelected = (elementId: string) => selectedElements.some((r) => r.layoutId === layoutId && r.elementId === elementId);
  // Cross-scene match-select adds matching layers in every sibling size to `selectedElements` (for
  // bulk-edit purposes) but only the literally-clicked BACKGROUND image should draw a visible
  // outline — its auto-matched background-image siblings stay selected without one, since that
  // photo is routinely cropped/expanded past the frame's own bounds and an outline chasing it
  // across every size just reads as visual noise. Every other kind of match (shape/text, or a
  // decorative non-background image) keeps its outline everywhere, since those are typically
  // edited in lockstep across sizes and benefit from seeing every affected box at once.
  const isAutoMatched = (elementId: string) => autoMatchedElements.some((r) => r.layoutId === layoutId && r.elementId === elementId);
  // Double-clicking a grouped element "enters" its group — while entered, that one group's members
  // show their own individual bounding boxes again (see showsBoundsBox below) instead of the single
  // big one drawn around the whole group; selecting anything outside the group exits it again (see
  // the onSelect wrappers below, and handleFrameMouseDown's empty-click branch).
  const [enteredGroupId, setEnteredGroupId] = useState<string | null>(null);
  const showsBoundsBox = (elementId: string) => {
    if (!isSelected(elementId)) return false;
    // A grouped-but-not-entered element never shows its own box — the whole group draws one
    // shared box instead (see the group-bounds overlay near the end of this component).
    const groupId = layout.elements.find((el) => el.id === elementId)?.groupId;
    if (groupId && groupId !== enteredGroupId) return false;
    if (!isAutoMatched(elementId)) return true;
    return elementId !== backgroundElementId;
  };
  // Exits "entered" mode the moment selection moves to something outside the currently-entered
  // group — a plain click elsewhere, deselecting, or selecting a different group/element entirely.
  function exitEnteredGroupUnless(groupId: string | undefined) {
    if (enteredGroupId && groupId !== enteredGroupId) setEnteredGroupId(null);
  }
  // A plain click on any element first makes sure "entered" mode isn't left stale from a previous
  // group before applying the click's own selection.
  function makeOnSelect(el: LayoutElement) {
    return (e: ReactMouseEvent) => {
      exitEnteredGroupUnless(el.groupId);
      selectElement({ layoutId, elementId: el.id }, e.shiftKey);
      selectScene(layout.setId);
    };
  }
  // Only handed to grouped-but-not-yet-entered elements (see the render loop) — double-clicking one
  // enters its group and selects just that one member, in place of whatever double-click would
  // otherwise do (text-edit, or nothing for shape/image).
  function makeOnEnterGroup(el: LayoutElement) {
    return () => {
      if (!el.groupId) return;
      setEnteredGroupId(el.groupId);
      // Deliberately setSelectedElements, not selectElement — selectElement always expands a
      // grouped ref to the whole group, but entering is specifically about drilling into this one
      // member on its own.
      setSelectedElements([{ layoutId, elementId: el.id }]);
      selectScene(layout.setId);
    };
  }
  const pickingFocusForLayoutId = useAppStore((s) => s.pickingFocusForLayoutId);
  const focusPickConfirmed = useAppStore((s) => s.focusPickConfirmed);
  const confirmFocusPick = useAppStore((s) => s.confirmFocusPick);
  const startPickingFocus = useAppStore((s) => s.startPickingFocus);
  const updateLayoutStyle = useAppStore((s) => s.updateLayoutStyle);

  const frameRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addUploadedAsset = useAppStore((s) => s.addUploadedAsset);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [expandingElementId, setExpandingElementId] = useState<string | null>(null);
  const [focusDrawRect, setFocusDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Whether the focus box has actually been moved or resized from wherever it started this
  // session — the checkmark to confirm only shows once there's something to confirm; before that,
  // the instructional hint sits in its place instead.
  const [focusRectDirty, setFocusRectDirty] = useState(false);
  // True only for the duration of an actual move/resize drag (mousedown to mouseup) — the
  // checkmark hides while this is true so it doesn't sit in the way (or visually lag behind) the
  // box while it's still being adjusted, then reappears the instant the mouse is released.
  const [focusRectDragging, setFocusRectDragging] = useState(false);
  const isPickingFocus = pickingFocusForLayoutId === layoutId;

  // Entering picking mode seeds the box immediately — a fresh centered DEFAULT_FOCUS_RECT_SIZE
  // square, or the existing focusRect if one's already set (so "Change" edits it in place instead
  // of starting over). There's no more empty state waiting for a drag-to-draw gesture. Keyed on
  // focusPickConfirmed too, not just isPickingFocus — "Change" on a scene that's already confirmed
  // this same session (pickingFocusForLayoutId never left this layout) only flips
  // focusPickConfirmed back to false, so isPickingFocus alone wouldn't change and this wouldn't
  // otherwise re-fire.
  useEffect(() => {
    if (!isPickingFocus) return;
    const existing = layout.focusRect;
    if (existing) {
      setFocusDrawRect(existing);
    } else {
      const w = Math.min(DEFAULT_FOCUS_RECT_SIZE, nativeWidth);
      const h = Math.min(DEFAULT_FOCUS_RECT_SIZE, nativeHeight);
      setFocusDrawRect({ x: (nativeWidth - w) / 2, y: (nativeHeight - h) / 2, w, h });
    }
    setFocusRectDirty(false);
    setFocusRectDragging(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPickingFocus, focusPickConfirmed]);
  const [layerContextMenu, setLayerContextMenu] = useState<
    | { kind: 'single'; x: number; y: number; elementId: string }
    | { kind: 'multi'; x: number; y: number; elementIds: string[]; groupId?: string }
    | null
  >(null);
  const [insertImagePickerOpen, setInsertImagePickerOpen] = useState(false);

  const imageElement = layout.elements.find((el) => el.kind === 'image');
  const hasImage = Boolean(imageElement?.imageUrl);
  const extraElements = layout.elements.filter((el) => el.slot === null && el.visible);

  // The "background image" to keep visible while every other layer hides during a focus-rect
  // drag: the real hero slot if it's filled, otherwise whichever image-kind decorative layer was
  // added first — a scene built entirely from double-click-dropped samples has no filled hero
  // slot, so that first drop is standing in for the background instead.
  const backgroundElementId = hasImage ? imageElement?.id : extraElements.find((el) => el.kind === 'image' && el.imageUrl)?.id;
  // See `backgroundElementId`'s own comment — this is the actual hide, applied per-element below.
  const isHiddenDuringFocusDrag = (elementId: string) => focusRectDragging && elementId !== backgroundElementId;

  // Any selected image whose frame spills past the artboard's own bounds gets a dimmed preview of
  // the overflowing part — hidden again the moment it's deselected. Gated on showsBoundsBox (not
  // isSelected) so an auto-matched sibling image — selected for bulk-edit but not the literal
  // clicked element — doesn't grow this preview either.
  // A 1px tolerance keeps a genuinely full-bleed image (frame exactly matching the artboard, or
  // off by a sub-pixel rounding artifact from a drag) from double-counting as "overflowing" here —
  // without it, this outline trace would render *on top of* SelectionBoundingBox's own clipped
  // outline for any such image, showing as a doubled/thicker selection border for no real overflow.
  const OVERFLOW_TOLERANCE = 1;
  const overflowElements = [imageElement, ...extraElements].filter(
    (el): el is LayoutElement =>
      Boolean(el) &&
      el.kind === 'image' &&
      Boolean(el.imageUrl) &&
      showsBoundsBox(el.id) &&
      (el.frame.x < -OVERFLOW_TOLERANCE ||
        el.frame.y < -OVERFLOW_TOLERANCE ||
        el.frame.x + el.frame.w > nativeWidth + OVERFLOW_TOLERANCE ||
        el.frame.y + el.frame.h > nativeHeight + OVERFLOW_TOLERANCE),
  );

  const applyImageToElement = useApplyImage();
  function applyImage(url: string) {
    if (!imageElement) return;
    applyImageToElement(layoutId, imageElement.id, url, nativeWidth, nativeHeight);
  }
  // "upload" in the empty-state hint skips the visuals-library modal entirely — it's just a plain
  // OS file picker, same object-URL flow the modal's own Upload tab already uses.
  function handleUploadFile(file: File) {
    const url = URL.createObjectURL(file);
    addUploadedAsset(url);
    applyImage(url);
  }

  // Lets an asset tile dragged from the left panel drop straight onto any frame — active or not,
  // in the editor or a view-all card — adding it as a new decorative layer (never replacing
  // whatever's already there) centered on the drop point.
  function handleAssetDrop(e: ReactDragEvent) {
    e.preventDefault();
    const url = e.dataTransfer.getData('text/plain');
    if (!url) return;
    const point = nativePointFromEvent(e);
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      const maxW = nativeWidth * 0.4;
      const maxH = nativeHeight * 0.4;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      const element: LayoutElement = {
        id: nextId('el'),
        kind: 'image',
        slot: null,
        imageUrl: url,
        focalPoint: { x: 0.5, y: 0.5 },
        frame: { x: point.x - w / 2, y: point.y - h / 2, w, h },
        style: {},
        visible: true,
      };
      addElement(layoutId, element);
      selectScene(layout.setId);
      selectElement({ layoutId, elementId: element.id });
    };
    img.src = url;
  }

  // Right-click on any layer (image/text/shape alike) — opens the layer context menu at the
  // cursor, but only once that layer is already the selected one (a prior left-click picked it out
  // specifically). Otherwise the right-click is about the scene as a whole, not any one layer
  // within it, so it falls through to the frame's own onContextMenu (below) for the scene-level
  // menu instead. When more than one layer in this scene is currently selected, this opens the
  // multi-select menu (or the group menu, if the whole selection is exactly one intact group)
  // instead of the single-layer one.
  function handleLayerContextMenu(elementId: string) {
    return (e: ReactMouseEvent) => {
      if (!active || !isSelected(elementId)) return;
      e.preventDefault();
      e.stopPropagation();
      const selectionInLayout = selectedElements.filter((r) => r.layoutId === layoutId);
      if (selectionInLayout.length > 1) {
        const ids = selectionInLayout.map((r) => r.elementId);
        const selectedEls = ids.map((id) => layout.elements.find((el) => el.id === id)).filter((el): el is LayoutElement => Boolean(el));
        const sharedGroupId = selectedEls[0]?.groupId;
        const isIntactGroup = Boolean(sharedGroupId) && selectedEls.every((el) => el.groupId === sharedGroupId);
        setLayerContextMenu({ kind: 'multi', x: e.clientX, y: e.clientY, elementIds: ids, groupId: isIntactGroup ? sharedGroupId : undefined });
        return;
      }
      setLayerContextMenu({ kind: 'single', x: e.clientX, y: e.clientY, elementId });
    };
  }

  // "Insert new image" (from the layer context menu) adds a new decorative image layer centered on
  // the frame — same construction as a dropped asset tile, minus the drop point.
  function insertNewImage(url: string) {
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      const maxW = nativeWidth * 0.4;
      const maxH = nativeHeight * 0.4;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      const element: LayoutElement = {
        id: nextId('el'),
        kind: 'image',
        slot: null,
        imageUrl: url,
        focalPoint: { x: 0.5, y: 0.5 },
        frame: { x: (nativeWidth - w) / 2, y: (nativeHeight - h) / 2, w, h },
        style: {},
        visible: true,
      };
      addElement(layoutId, element);
      selectScene(layout.setId);
      selectElement({ layoutId, elementId: element.id });
    };
    img.src = url;
  }

  // Commits a Cmd-dragged expand box: 2s of "generating", then the image covers the whole new area.
  // Any image element can have a pending expand — the primary slot or a decorative layer alike.
  function handleExpandClick(element: LayoutElement) {
    return (e: ReactMouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!element.pendingExpand || expandingElementId) return;
      const nextFrame = element.pendingExpand;
      setExpandingElementId(element.id);
      setTimeout(() => {
        updateElement(layoutId, element.id, { frame: nextFrame, pendingExpand: undefined });
        setExpandingElementId(null);
      }, EXPAND_DURATION_MS);
    };
  }

  // Commits the background image straight to the frame's own full bounds — the one-click fix for a
  // moved/undersized image leaving a gap, as opposed to handleExpandClick above which finishes an
  // already-drawn Cmd-drag box. Reuses the same pendingExpand + shimmer machinery for a consistent
  // "generating" beat: setting pendingExpand first makes ImageBox treat this exactly like a
  // just-finished Cmd-drag for the rest of the animation.
  function handleExpandToFrameClick(element: LayoutElement) {
    return (e: ReactMouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (expandingElementId) return;
      const nextFrame = { x: 0, y: 0, w: nativeWidth, h: nativeHeight };
      updateElement(layoutId, element.id, { pendingExpand: nextFrame });
      setExpandingElementId(element.id);
      setTimeout(() => {
        updateElement(layoutId, element.id, { frame: nextFrame, pendingExpand: undefined });
        setExpandingElementId(null);
      }, EXPAND_DURATION_MS);
    };
  }

  function nativePointFromEvent(e: { clientX: number; clientY: number }) {
    const rect = frameRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  // "Scene focus point" picking: the box seeded on entry (see the effect above) is directly
  // draggable/resizable, committed to layout.focusRect only once the user clicks the confirm
  // checkmark — moving/resizing it never touches the store on its own, just local state.
  function startFocusRectMove(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!focusDrawRect) return;
    // Destructured to plain numbers, not the object itself — TS can't carry a null-check's
    // narrowing into these nested closures for an object binding, but primitives close over fine.
    const { x: startRectX, y: startRectY, w, h } = focusDrawRect;
    const startX = e.clientX;
    const startY = e.clientY;
    setFocusRectDirty(true);
    setFocusRectDragging(true);
    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      setFocusDrawRect({
        x: Math.max(0, Math.min(nativeWidth - w, startRectX + dx)),
        y: Math.max(0, Math.min(nativeHeight - h, startRectY + dy)),
        w,
        h,
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setFocusRectDragging(false);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Same corner/edge handle math as useElementDrag's startResize, but clamped to the frame's own
  // bounds (0..nativeWidth/Height) instead of growing freely, and writing to local focusDrawRect
  // state instead of an element's frame.
  function startFocusRectResize(handle: ResizeHandle, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!focusDrawRect) return;
    const startRect = focusDrawRect;
    const startX = e.clientX;
    const startY = e.clientY;
    setFocusRectDirty(true);
    setFocusRectDragging(true);
    function onMove(ev: globalThis.MouseEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      let x = startRect.x;
      let y = startRect.y;
      let w = startRect.w;
      let h = startRect.h;
      if (handle.includes('e')) w = Math.max(FOCUS_RECT_MIN_SIZE, Math.min(nativeWidth - startRect.x, startRect.w + dx));
      if (handle.includes('s')) h = Math.max(FOCUS_RECT_MIN_SIZE, Math.min(nativeHeight - startRect.y, startRect.h + dy));
      if (handle.includes('w')) {
        w = Math.max(FOCUS_RECT_MIN_SIZE, Math.min(startRect.x + startRect.w, startRect.w - dx));
        x = startRect.x + startRect.w - w;
      }
      if (handle.includes('n')) {
        h = Math.max(FOCUS_RECT_MIN_SIZE, Math.min(startRect.y + startRect.h, startRect.h - dy));
        y = startRect.y + startRect.h - h;
      }
      setFocusDrawRect({ x, y, w, h });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setFocusRectDragging(false);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function confirmFocusRect(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!focusDrawRect) return;
    updateLayoutStyle(layoutId, { focusRect: focusDrawRect });
    confirmFocusPick();
    // Stays in picking mode rather than exiting outright — clearing focusDrawRect (with
    // focusPickConfirmed now true) switches the overlay below into its "confirmed" display: the
    // picked rect stays outlined, with no more buttons in the way, so it reads as a settled result
    // rather than a still-open prompt. Leaving picking mode only happens when the "Add more
    // sizes" panel itself closes (see QuickSizeMenu's closePanel) or "Change" re-enters it.
    setFocusDrawRect(null);
  }

  function handleFrameMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    // A right-click's mousedown bubbles the same as a left-click's — without this guard, it would
    // re-select the scene (and clear any element just selected by a child's own right-click
    // handler, e.g. the image layer's) a moment before the *actual* right-click menu opens,
    // discarding the very selection that menu is supposed to act on. Left as a no-op here, it falls
    // through to the browser's native `contextmenu` event exactly as if this handler didn't exist.
    if (e.button !== 0) return;
    // Suppresses the browser's native drag-select behavior (e.g. highlighting
    // the empty-state image) in both branches below.
    e.preventDefault();

    if (!active) {
      if (e.shiftKey) {
        selectScene(layout.setId, true);
        return;
      }
      // A plain click both activates the scene (unlocking its own layers and tools) and arms a
      // drag of the whole scene in the same motion — released without moving, it's just a select;
      // dragged, it moves the scene card, never a layer, since a layer only becomes individually
      // interactive once this activation has already landed (the `active` branch below is what
      // renders them as live/draggable at all — see extraElements' active/!active split further down).
      selectElement(null);
      setEnteredGroupId(null);
      if (onActivate) onActivate();
      else selectScene(layout.setId);
      onSceneMouseDown?.(e);
      return;
    }

    if (activeTool === 'select') {
      selectScene(layout.setId, e.shiftKey);
      selectElement(null);
      setEnteredGroupId(null);
      if (!e.shiftKey) onSceneMouseDown?.(e);
      return;
    }

    if (activeTool === 'text') {
      const point = nativePointFromEvent(e);
      const w = nativeWidth * 0.4;
      const h = nativeHeight * 0.12;
      const element: LayoutElement = {
        id: nextId('el'),
        kind: 'text',
        slot: null,
        content: '',
        frame: { x: point.x - w / 2, y: point.y - h / 2, w, h },
        style: { fontSize: Math.round(nativeHeight * 0.06), fontWeight: 600, color: '#ffffff', align: 'center' },
        visible: true,
      };
      addElement(layoutId, element);
      selectScene(layout.setId);
      selectElement({ layoutId, elementId: element.id });
      setEditingTextElement(element.id);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'shape') {
      const start = nativePointFromEvent(e);
      let current = start;

      function onMove(ev: globalThis.MouseEvent) {
        current = nativePointFromEvent(ev);
        setDrawRect(shapeDragFrame(shapeToolKind, start, current));
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const dragW = Math.abs(current.x - start.x);
        const dragH = Math.abs(current.y - start.y);
        const small = dragW < 10 && dragH < 10;
        // A plain click (no drag) drops a default-sized shape centered on the click point — 'line'
        // gets its own thin, wide default instead of the square rect/ellipse use, since a line
        // renders as a plain filled bar (see ElementRenderer) and a square one is indistinguishable
        // from a small rectangle.
        const smallFrame =
          shapeToolKind === 'line'
            ? { x: start.x - nativeWidth * 0.15, y: start.y - nativeHeight * 0.01, w: nativeWidth * 0.3, h: nativeHeight * 0.02 }
            : { x: start.x - nativeWidth * 0.1, y: start.y - nativeHeight * 0.1, w: nativeWidth * 0.2, h: nativeHeight * 0.2 };
        const frame = small ? smallFrame : shapeDragFrame(shapeToolKind, start, current);
        const element: LayoutElement = {
          id: nextId('el'),
          kind: 'shape',
          shape: shapeToolKind,
          slot: null,
          frame,
          // Defaults match the prototype's reference shape: a soft gray, generously rounded rect.
          style: { fill: '#d9d9d9', radius: 28, strokeWidth: 0 },
          visible: true,
        };
        addElement(layoutId, element);
        setDrawRect(null);
        selectScene(layout.setId);
        selectElement({ layoutId, elementId: element.id });
        setActiveTool('select');
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  }

  const frameCursorClass = !active ? 'cursor-pointer' : activeTool === 'text' ? 'cursor-text' : activeTool === 'shape' ? 'cursor-crosshair' : '';

  // One big box per selected-and-not-entered group, spanning every one of its members — drawn in
  // place of each member's own individual box (see showsBoundsBox). Every member of a group is
  // always selected together (selectElement expands to the whole group), so checking any one
  // member's selection state is enough to know the whole group is currently selected.
  const groupBounds: { groupId: string; x: number; y: number; w: number; h: number }[] = [];
  if (active) {
    const seenGroupIds = new Set<string>();
    for (const el of layout.elements) {
      if (!el.groupId || el.groupId === enteredGroupId || seenGroupIds.has(el.groupId) || !isSelected(el.id)) continue;
      seenGroupIds.add(el.groupId);
      const members = layout.elements.filter((m) => m.groupId === el.groupId);
      const minX = Math.min(...members.map((m) => m.frame.x));
      const minY = Math.min(...members.map((m) => m.frame.y));
      const maxX = Math.max(...members.map((m) => m.frame.x + m.frame.w));
      const maxY = Math.max(...members.map((m) => m.frame.y + m.frame.h));
      groupBounds.push({ groupId: el.groupId, x: minX, y: minY, w: maxX - minX, h: maxY - minY });
    }
  }

  return (
    <div className={cn('relative', className)} style={{ width, height, ...style }}>
      {/* The selected image's own outline+handles (SelectionBoundingBox, rendered inside the
          overflow-hidden frame below) get clipped wherever the frame exceeds the canvas — this
          traces the rest of that same outline, unclipped, so the full extent of an overflowing,
          zoomed-in image stays visible. */}
      {overflowElements.map((el) => (
        <div
          key={`overflow-outline-${el.id}`}
          className="pointer-events-none absolute outline outline-[1.5px] outline-button-primary"
          style={{
            left: `${(el.frame.x / nativeWidth) * 100}%`,
            top: `${(el.frame.y / nativeHeight) * 100}%`,
            width: `${(el.frame.w / nativeWidth) * 100}%`,
            height: `${(el.frame.h / nativeHeight) * 100}%`,
          }}
        />
      ))}
      <div
        ref={frameRef}
        className={cn(
          'absolute inset-0 overflow-hidden border transition-colors',
          frameCursorClass,
          // An outline (not a border-width change) so the selected state never shifts the content box —
          // a wider border would eat into the image's inset-0 box and visibly shrink it on select.
          isSceneSelected && 'outline outline-2 -outline-offset-2 outline-white',
        )}
        style={{
          containerType: 'inline-size',
          background: layout.backgroundColor ?? '#131316',
          borderColor: layout.borderColor ?? '#2f2f37',
          borderWidth: layout.borderWidth ?? 1,
          borderStyle: layout.borderStyle ?? 'solid',
          borderRadius: layout.radius ? `${layout.radius}px` : undefined,
        }}
        onMouseDown={handleFrameMouseDown}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleAssetDrop}
        onContextMenu={(e) => {
          if (!onSceneContextMenu) return;
          e.preventDefault();
          onSceneContextMenu(e);
        }}
      >
        {active && <ImagePickerDialog open={insertImagePickerOpen} onOpenChange={setInsertImagePickerOpen} onSelect={insertNewImage} />}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleUploadFile(file);
          }}
        />

        {imageElement && hasImage && (
          <div data-hero-image style={{ display: isHiddenDuringFocusDrag(imageElement.id) ? 'none' : 'contents' }}>
            {active ? (
              <DraggableImageElement
                element={imageElement}
                layoutId={layoutId}
                layoutWidth={nativeWidth}
                layoutHeight={nativeHeight}
                scale={scale}
                activeTool={activeTool}
                selected={showsBoundsBox(imageElement.id)}
                expanding={expandingElementId === imageElement.id}
                onExpandClick={handleExpandClick(imageElement)}
                onExpandToFrameClick={handleExpandToFrameClick(imageElement)}
                isBackgroundImage={imageElement.id === backgroundElementId}
                onSelect={makeOnSelect(imageElement)}
                onContextMenu={handleLayerContextMenu(imageElement.id)}
                onEnterGroup={imageElement.groupId && imageElement.groupId !== enteredGroupId ? makeOnEnterGroup(imageElement) : undefined}
              />
            ) : (
              // Mirrors DraggableImageElement's box exactly (frame-relative, not full-bleed) so the
              // image never appears to resize when a view-all page card activates into edit mode.
              <ImageBox
                element={imageElement}
                layoutWidth={nativeWidth}
                layoutHeight={nativeHeight}
                outlined={showsBoundsBox(imageElement.id)}
                scale={scale}
                expanding={expandingElementId === imageElement.id}
                onExpandClick={handleExpandClick(imageElement)}
                onExpandToFrameClick={handleExpandToFrameClick(imageElement)}
                isBackgroundImage={imageElement.id === backgroundElementId}
              />
            )}
          </div>
        )}

        {/* Hidden below 30% zoom — at that scale the content is illegible anyway, and every empty
            scene rendering it stacks up into visual noise once a group has several sizes. */}
        {!layoutHasContent(layout) && showEmptyStateHint && scale >= 0.4 && (
          <div data-empty-hint className="absolute inset-0 flex flex-col items-center justify-center gap-0 px-8 text-center">
            <img src="/icons/start_illustration.svg" alt="" className="w-[400px]" />
            <div className="flex max-w-[300px] flex-col items-center gap-5">
              <p className="text-[16px] leading-[1.4] font-medium text-white">
                {t('Create a primary banner')}
                <br />
                {t('and adapt to different sizes.')}
              </p>
              <p className="text-[13px] leading-[1.4] font-normal text-chrome-fg-muted">
                {active ? (
                  <button
                    type="button"
                    className="text-button-primary hover:underline"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    {t('Upload')}
                  </button>
                ) : (
                  <span className="text-button-primary">{t('Upload')}</span>
                )}{' '}
                {t('or drag images from your computer')}
              </p>
            </div>
          </div>
        )}

        {extraElements
          .filter((el) => !isHiddenDuringFocusDrag(el.id))
          .map((el) => {
            if (!active) {
              return (
                <ElementRenderer
                  key={el.id}
                  element={el}
                  layoutWidth={nativeWidth}
                  layoutHeight={nativeHeight}
                  selected={showsBoundsBox(el.id)}
                />
              );
            }

            if (el.kind === 'text') {
              return (
                <EditableTextElement
                  key={el.id}
                  element={el}
                  layoutId={layoutId}
                  layoutWidth={nativeWidth}
                  layoutHeight={nativeHeight}
                  scale={scale}
                  activeTool={activeTool}
                  selected={showsBoundsBox(el.id)}
                  isEditing={editingTextElementId === el.id}
                  onSelect={makeOnSelect(el)}
                  onStartEditing={() => setEditingTextElement(el.id)}
                  onContextMenu={handleLayerContextMenu(el.id)}
                  onEnterGroup={el.groupId && el.groupId !== enteredGroupId ? makeOnEnterGroup(el) : undefined}
                />
              );
            }

            if (el.kind === 'shape') {
              return (
                <SelectableShapeElement
                  key={el.id}
                  element={el}
                  layoutId={layoutId}
                  layoutWidth={nativeWidth}
                  layoutHeight={nativeHeight}
                  scale={scale}
                  activeTool={activeTool}
                  selected={showsBoundsBox(el.id)}
                  onSelect={makeOnSelect(el)}
                  onContextMenu={handleLayerContextMenu(el.id)}
                  onEnterGroup={el.groupId && el.groupId !== enteredGroupId ? makeOnEnterGroup(el) : undefined}
                />
              );
            }

            if (el.kind === 'image') {
              return (
                <DraggableImageElement
                  key={el.id}
                  element={el}
                  layoutId={layoutId}
                  layoutWidth={nativeWidth}
                  layoutHeight={nativeHeight}
                  scale={scale}
                  activeTool={activeTool}
                  selected={showsBoundsBox(el.id)}
                  expanding={expandingElementId === el.id}
                  onExpandClick={handleExpandClick(el)}
                  onExpandToFrameClick={handleExpandToFrameClick(el)}
                  isBackgroundImage={el.id === backgroundElementId}
                  onSelect={makeOnSelect(el)}
                  onContextMenu={handleLayerContextMenu(el.id)}
                  onEnterGroup={el.groupId && el.groupId !== enteredGroupId ? makeOnEnterGroup(el) : undefined}
                />
              );
            }

            return <ElementRenderer key={el.id} element={el} layoutWidth={nativeWidth} layoutHeight={nativeHeight} />;
          })}

        {active && drawRect && (
          <div
            className="pointer-events-none absolute border-2 border-button-primary bg-button-primary/20"
            style={{
              left: `${(drawRect.x / nativeWidth) * 100}%`,
              top: `${(drawRect.y / nativeHeight) * 100}%`,
              width: `${(drawRect.w / nativeWidth) * 100}%`,
              height: `${(drawRect.h / nativeHeight) * 100}%`,
            }}
          />
        )}

        {groupBounds.map((b) => (
          <div
            key={b.groupId}
            className="pointer-events-none absolute outline outline-[1.5px] outline-button-primary"
            style={{
              left: `${(b.x / nativeWidth) * 100}%`,
              top: `${(b.y / nativeHeight) * 100}%`,
              width: `${(b.w / nativeWidth) * 100}%`,
              height: `${(b.h / nativeHeight) * 100}%`,
            }}
          />
        ))}

        {active &&
          activeGuides
            .filter((g) => g.layoutId === layoutId)
            .map((g, i) =>
              g.axis === 'x' ? (
                <div
                  key={i}
                  className="pointer-events-none absolute z-50"
                  style={{
                    left: `${(g.position / nativeWidth) * 100}%`,
                    top: `${(g.start / nativeHeight) * 100}%`,
                    height: `${((g.end - g.start) / nativeHeight) * 100}%`,
                    borderLeft: `1px ${g.style} #FF3B30`,
                  }}
                />
              ) : (
                <div
                  key={i}
                  className="pointer-events-none absolute z-50"
                  style={{
                    top: `${(g.position / nativeHeight) * 100}%`,
                    left: `${(g.start / nativeWidth) * 100}%`,
                    width: `${((g.end - g.start) / nativeWidth) * 100}%`,
                    borderTop: `1px ${g.style} #FF3B30`,
                  }}
                />
              ),
            )}
      </div>

      {isPickingFocus && (
        <>
          <div data-focus-pick-overlay className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {focusPickConfirmed && layout.focusRect ? (
              // Confirmed this session — the picked rect just stays outlined on top, no dimming and
              // no resize/move controls in the way now that there's nothing left to decide, but
              // it's still clickable: that re-runs startPickingFocus (resetting focusPickConfirmed,
              // same as "Change"), which switches this back into the fully editable state below —
              // same as re-entering via the "Change" button.
              <div
                className="group/focus-rect-confirmed pointer-events-auto absolute cursor-pointer border-3"
                onClick={() => startPickingFocus(layoutId)}
                style={{
                  left: `${(layout.focusRect.x / nativeWidth) * 100}%`,
                  top: `${(layout.focusRect.y / nativeHeight) * 100}%`,
                  width: `${(layout.focusRect.w / nativeWidth) * 100}%`,
                  height: `${(layout.focusRect.h / nativeHeight) * 100}%`,
                  borderColor: 'rgba(255,255,255,0.8)',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 16,
                }}
              >
                {/* Hover affordance so the box still reads as clickable (re-opens editing) even
                    once it's already settled, not just while it's mid-edit. */}
                <div className="absolute inset-0 rounded-[inherit] bg-white/0 transition-colors group-hover/focus-rect-confirmed:bg-white/10" />
              </div>
            ) : (
              focusDrawRect && (
                <>
                  {/* A full-size, invisible click-catcher *behind* the box (rendered first, so the
                      box itself — rendered after, on top — still gets first pick of any click that
                      lands on it) — clicking anywhere else in the frame while editing commits the
                      box in place, same as the checkmark, rather than leaving it open indefinitely
                      with no way to dismiss it except that one small button. */}
                  <div className="pointer-events-auto absolute inset-0" onClick={confirmFocusRect} />
                  <div
                    className="group/focus-rect pointer-events-auto absolute cursor-move border-3 transition-colors"
                    style={{
                      left: `${(focusDrawRect.x / nativeWidth) * 100}%`,
                      top: `${(focusDrawRect.y / nativeHeight) * 100}%`,
                      width: `${(focusDrawRect.w / nativeWidth) * 100}%`,
                      height: `${(focusDrawRect.h / nativeHeight) * 100}%`,
                      borderColor: 'rgba(255,255,255,0.8)',
                      // A "spotlight": an enormous, non-blurred shadow spread fills the entire
                      // rest of the (clipped, `overflow-hidden`) overlay with the dim color, while
                      // the box's own background stays fully transparent — so only the area inside
                      // reads at full clarity, everything outside it dims, without a second overlay
                      // element (and its own separate cutout) to keep in sync with the box.
                      boxShadow: '0 0 0 9999px rgba(38,38,44,0.5)',
                      borderRadius: 16,
                    }}
                    onMouseDown={startFocusRectMove}
                  >
                    {/* Hover affordance while the box is just sitting there waiting to be adjusted —
                        a subtle white wash, gone again the instant an actual drag starts (`active`
                        already covers mid-drag via the box's own :active state, but this stays
                        visible on hover alone too, before any mousedown). */}
                    <div className="absolute inset-0 rounded-[inherit] bg-white/0 transition-colors group-hover/focus-rect:bg-white/10" />
                    {RESIZE_HANDLES.map((handle) => (
                      <div key={handle} style={focusHandleStyle(handle)} onMouseDown={(e) => startFocusRectResize(handle, e)} />
                    ))}
                  </div>
                </>
              )
            )}
          </div>

          {/* Rendered *outside* the overlay's own overflow-hidden box (a sibling, not a descendant) —
              so the confirm checkmark and the instructional hint never clip at a frame edge when
              the box sits flush against one. */}
          {focusDrawRect && !focusPickConfirmed && (
            <>
              {!focusRectDirty && (
                <div
                  className="pointer-events-none absolute z-30 flex w-max shrink-0 items-center justify-center gap-2 rounded-[12px] px-4 py-[12px] text-bg whitespace-nowrap text-white"
                  style={{
                    left: `${((focusDrawRect.x + focusDrawRect.w / 2) / nativeWidth) * 100}%`,
                    top: `${((focusDrawRect.y + focusDrawRect.h) / nativeHeight) * 100}%`,
                    transform: 'translate(-50%, 12px)',
                    background: 'rgba(38,38,44,0.88)',
                    boxShadow: '0px 1px 2px rgba(0,0,0,0.03), 0px 1px 6px -1px rgba(0,0,0,0.02), 0px 2px 4px rgba(0,0,0,0.02)',
                  }}
                >
                  <img src="/icons/visual-pick-center.svg" alt="" className="size-6 shrink-0" />
                  <span>{t('Move or resize to set the focus area')}</span>
                </div>
              )}
            </>
          )}
        </>
      )}

      {layerContextMenu?.kind === 'single' && (
        <LayerContextMenu
          x={layerContextMenu.x}
          y={layerContextMenu.y}
          layoutId={layoutId}
          elementId={layerContextMenu.elementId}
          onClose={() => setLayerContextMenu(null)}
          onInsertNewImage={() => setInsertImagePickerOpen(true)}
        />
      )}

      {layerContextMenu?.kind === 'multi' && (
        <MultiLayerContextMenu
          x={layerContextMenu.x}
          y={layerContextMenu.y}
          layoutId={layoutId}
          elementIds={layerContextMenu.elementIds}
          groupId={layerContextMenu.groupId}
          onClose={() => setLayerContextMenu(null)}
        />
      )}
    </div>
  );
}
