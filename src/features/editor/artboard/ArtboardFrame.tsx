import { useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { nextId } from '@/lib/create-layout';
import { useApplyImage } from '@/hooks/useApplyImage';
import type { Layout, LayoutElement } from '@/types';
import { ElementRenderer } from './ElementRenderer';
import { DraggableImageElement } from './DraggableImageElement';
import { EditableTextElement } from './EditableTextElement';
import { SelectableShapeElement } from './SelectableShapeElement';
import { ImagePickerDialog } from './ImagePickerDialog';
import { ImageBox } from './ImageBox';
import { LayerContextMenu } from './LayerContextMenu';

const EXPAND_DURATION_MS = 2000;

// Quick way to demo text/shape-style layers without hand-building one: double-clicking empty
// canvas drops in the next sample from this list, cycling back around once it runs out. A plain
// module-level counter (not store/component state) is enough — it's a prototyping shortcut, not
// something that needs to persist or react to anything.
const SAMPLE_COMPONENT_URLS = ['/samples/bottom_banner.svg', '/samples/button.svg', '/samples/coupon.svg', '/samples/headline.svg', '/samples/logo.svg'];
let nextSampleComponentIndex = 0;

/**
 * The banner frame — shared by the single-page editor and the view-all canvas.
 * `active` frames are fully interactive (drag/resize image, place text/shape,
 * edit text in place); inactive frames render the exact same content but as a
 * static preview, and a click just calls `onActivate`.
 */
export function ArtboardFrame({
  layout,
  scale,
  width,
  height,
  active,
  onActivate,
  onSceneMouseDown,
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
  const selectedElements = useAppStore((s) => s.selectedElements);
  const autoMatchedElements = useAppStore((s) => s.autoMatchedElements);
  const editingTextElementId = useAppStore((s) => s.editingTextElementId);
  const selectElement = useAppStore((s) => s.selectElement);
  const isSelected = (elementId: string) => selectedElements.some((r) => r.layoutId === layoutId && r.elementId === elementId);
  // Cross-scene match-select adds matching layers in every sibling size to `selectedElements` (for
  // bulk-edit purposes) but only the literally-clicked IMAGE should draw a visible outline — its
  // auto-matched image siblings stay selected without one, so a multi-size image selection shows
  // exactly one box. Shape/text matches keep their outline everywhere, since those are typically
  // edited in lockstep across sizes and benefit from seeing every affected box at once.
  const isAutoMatched = (elementId: string) => autoMatchedElements.some((r) => r.layoutId === layoutId && r.elementId === elementId);
  const showsBoundsBox = (elementId: string) => {
    if (!isSelected(elementId)) return false;
    if (!isAutoMatched(elementId)) return true;
    const element = layout.elements.find((el) => el.id === elementId);
    return element?.kind !== 'image';
  };
  const pickingFocusForLayoutId = useAppStore((s) => s.pickingFocusForLayoutId);
  const focusPickConfirmed = useAppStore((s) => s.focusPickConfirmed);
  const confirmFocusPick = useAppStore((s) => s.confirmFocusPick);
  const updateLayoutStyle = useAppStore((s) => s.updateLayoutStyle);

  const frameRef = useRef<HTMLDivElement>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandingElementId, setExpandingElementId] = useState<string | null>(null);
  const [focusDrawRect, setFocusDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const isPickingFocus = pickingFocusForLayoutId === layoutId;
  const [layerContextMenu, setLayerContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null);
  const [insertImagePickerOpen, setInsertImagePickerOpen] = useState(false);

  const imageElement = layout.elements.find((el) => el.kind === 'image');
  const hasImage = Boolean(imageElement?.imageUrl);
  const extraElements = layout.elements.filter((el) => el.slot === null && el.visible);
  // The empty-state hint should disappear once *any* image is showing — the primary slot, or a
  // decorative layer dropped in from the Assets panel — not just when the primary slot is filled.
  const hasAnyImage = hasImage || extraElements.some((el) => el.kind === 'image' && el.imageUrl);

  // Any selected image whose frame spills past the artboard's own bounds gets a dimmed preview of
  // the overflowing part — hidden again the moment it's deselected. Gated on showsBoundsBox (not
  // isSelected) so an auto-matched sibling image — selected for bulk-edit but not the literal
  // clicked element — doesn't grow this preview either.
  const overflowElements = [imageElement, ...extraElements].filter(
    (el): el is LayoutElement =>
      Boolean(el) &&
      el.kind === 'image' &&
      Boolean(el.imageUrl) &&
      showsBoundsBox(el.id) &&
      (el.frame.x < 0 || el.frame.y < 0 || el.frame.x + el.frame.w > nativeWidth || el.frame.y + el.frame.h > nativeHeight),
  );

  const applyImageToElement = useApplyImage();
  function applyImage(url: string) {
    if (!imageElement) return;
    applyImageToElement(layoutId, imageElement.id, url, nativeWidth, nativeHeight);
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

  // Right-click on an image layer — opens LayerContextMenu at the cursor. Only active (editable)
  // frames get one; an inactive view-all card only supports activate-on-click.
  function handleImageContextMenu(elementId: string) {
    return (e: ReactMouseEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      setLayerContextMenu({ x: e.clientX, y: e.clientY, elementId });
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

  // Double-clicking anywhere in the active frame — empty canvas, the "Choose a visual" hint, the
  // hero image, or right on top of an already-placed decorative layer — drops in the next sample
  // component (image kind, so it's immediately draggable/resizable like any other layer) centered
  // on the click point. Text elements opt out via their own onDoubleClick (which stops
  // propagation to edit in place instead), so this only ever fires for a click that isn't already
  // spoken for.
  function handleFrameDoubleClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (!active || activeTool !== 'select') return;

    const point = nativePointFromEvent(e);
    const url = SAMPLE_COMPONENT_URLS[nextSampleComponentIndex % SAMPLE_COMPONENT_URLS.length];
    nextSampleComponentIndex += 1;

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

  function nativePointFromEvent(e: { clientX: number; clientY: number }) {
    const rect = frameRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  // "Scene focus point" picking: draws a rect that stays unaffected by ratio-adaptation for this
  // scene, committed to layout.focusRect on release.
  // Draws the candidate rect; mouseup just leaves it in place (showing "Pick this area") rather
  // than committing immediately — the user can redraw as many times as they like before confirming.
  function handleFocusRectMouseDown(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const start = nativePointFromEvent(e);
    let current = start;

    function onMove(ev: globalThis.MouseEvent) {
      current = nativePointFromEvent(ev);
      setFocusDrawRect({
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        w: Math.abs(current.x - start.x),
        h: Math.abs(current.y - start.y),
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      if (w < 8 || h < 8) setFocusDrawRect(null);
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
    // rather than a still-open prompt. Actually leaving picking mode only happens when the "Add
    // more sizes" panel itself closes (see QuickSizeMenu's closePanel) or the user redraws
    // (mousedown below starts a fresh focusDrawRect).
    setFocusDrawRect(null);
  }

  function handleFrameMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    // Suppresses the browser's native drag-select behavior (e.g. highlighting
    // the empty-state image) in both branches below.
    e.preventDefault();

    if (!active) {
      if (e.shiftKey) {
        selectScene(layout.setId, true);
        return;
      }
      // A plain click selects and immediately allows dragging the scene, rather than entering it —
      // entering (activating) now takes a double-click, so a click never fights a drag attempt.
      selectScene(layout.setId);
      selectElement(null);
      if (onSceneMouseDown) onSceneMouseDown(e);
      else onActivate?.();
      return;
    }

    if (activeTool === 'select') {
      selectScene(layout.setId, e.shiftKey);
      selectElement(null);
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
        setDrawRect({
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          w: Math.abs(current.x - start.x),
          h: Math.abs(current.y - start.y),
        });
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const dragW = Math.abs(current.x - start.x);
        const dragH = Math.abs(current.y - start.y);
        const small = dragW < 10 && dragH < 10;
        const frame = small
          ? { x: start.x - nativeWidth * 0.1, y: start.y - nativeHeight * 0.1, w: nativeWidth * 0.2, h: nativeHeight * 0.2 }
          : { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), w: dragW, h: dragH };
        const element: LayoutElement = {
          id: nextId('el'),
          kind: 'shape',
          shape: 'rect',
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

  // Lets a shift-click reach into an *inactive* (not-yet-selected) scene's preview and add one of
  // its elements to a cross-scene multi-select. A plain click is left alone to bubble up to the
  // frame's own handler, which selects the scene — the caller then renders this same frame as
  // `active` immediately (selection alone is enough, no separate "enter" gesture needed), so any
  // *following* click already lands on the fully-interactive element, not this handler.
  function handleInactiveElementMouseDown(elementId: string, e: ReactMouseEvent) {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    selectElement({ layoutId, elementId }, true);
  }

  return (
    <div className={cn('relative', className)} style={{ width, height, ...style }}>
      {/* Rendered *outside* the frame's own overflow-hidden box (a sibling, not a descendant) so the
          overflow is actually visible — the frame's opaque background + its own clipped copy of the
          same image then paint over this at full opacity for the in-bounds portion, on top. */}
      {overflowElements.map((el) => (
        <div
          key={`overflow-${el.id}`}
          className="pointer-events-none absolute"
          style={{
            left: `${(el.frame.x / nativeWidth) * 100}%`,
            top: `${(el.frame.y / nativeHeight) * 100}%`,
            width: `${(el.frame.w / nativeWidth) * 100}%`,
            height: `${(el.frame.h / nativeHeight) * 100}%`,
            opacity: 0.15,
            backgroundImage: `url(${el.imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: `${(el.focalPoint?.x ?? 0.5) * 100}% ${(el.focalPoint?.y ?? 0.5) * 100}%`,
            transform: [el.flipX && 'scaleX(-1)', el.flipY && 'scaleY(-1)'].filter(Boolean).join(' ') || undefined,
          }}
        />
      ))}
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
          backgroundColor: layout.backgroundColor ?? '#131316',
          borderColor: layout.borderColor ?? '#2f2f37',
          borderWidth: layout.borderWidth ?? 1,
          borderStyle: layout.borderStyle ?? 'solid',
          borderRadius: layout.radius ? `${layout.radius}px` : undefined,
        }}
        onMouseDown={handleFrameMouseDown}
        onDoubleClick={handleFrameDoubleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleAssetDrop}
      >
        {active && <ImagePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={applyImage} />}
        {active && <ImagePickerDialog open={insertImagePickerOpen} onOpenChange={setInsertImagePickerOpen} onSelect={insertNewImage} />}

        {imageElement && hasImage && (
          // The marker (not a real layout element) lets handleFrameDoubleClick treat a double-click
          // anywhere on the hero image the same as empty canvas — `display: contents` keeps it out
          // of the box model entirely, so it can't affect DraggableImageElement's own positioning.
          <div data-hero-image style={{ display: 'contents' }}>
            {active ? (
              <DraggableImageElement
                element={imageElement}
                layoutId={layoutId}
                layoutWidth={nativeWidth}
                layoutHeight={nativeHeight}
                scale={scale}
                activeTool={activeTool}
                selected={showsBoundsBox(imageElement.id)}
                sceneSelected={isSceneSelected}
                expanding={expandingElementId === imageElement.id}
                onExpandClick={handleExpandClick(imageElement)}
                onSelect={(e) => {
                  selectElement({ layoutId, elementId: imageElement.id }, e.shiftKey);
                  selectScene(layout.setId);
                }}
                onContextMenu={handleImageContextMenu(imageElement.id)}
              />
            ) : (
              // Mirrors DraggableImageElement's box exactly (frame-relative, not full-bleed) so the
              // image never appears to resize when a view-all page card activates into edit mode.
              <ImageBox
                element={imageElement}
                layoutWidth={nativeWidth}
                layoutHeight={nativeHeight}
                outlined={showsBoundsBox(imageElement.id)}
                expanding={expandingElementId === imageElement.id}
                onExpandClick={handleExpandClick(imageElement)}
                onMouseDown={(e) => handleInactiveElementMouseDown(imageElement.id, e)}
              />
            )}
          </div>
        )}

        {!hasAnyImage && showEmptyStateHint && (
          <div data-empty-hint className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center">
            <img src="/icons/Layer/layout.svg" alt="" className="size-[120px]" />
            <p className="max-w-[272px] text-xl leading-[1.4] font-medium text-chrome-fg-muted">
              {active ? (
                <button
                  type="button"
                  className="text-button-primary hover:underline"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerOpen(true);
                  }}
                >
                  {t('Choose')}
                </button>
              ) : (
                <span className="text-button-primary">{t('Choose')}</span>
              )}{' '}
              {t('or drag your visual')}
            </p>
          </div>
        )}

        {extraElements.map((el) => {
          if (!active) {
            return (
              <ElementRenderer
                key={el.id}
                element={el}
                layoutWidth={nativeWidth}
                layoutHeight={nativeHeight}
                selected={showsBoundsBox(el.id)}
                onMouseDown={(e) => handleInactiveElementMouseDown(el.id, e)}
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
                onSelect={(e) => {
                  selectElement({ layoutId, elementId: el.id }, e.shiftKey);
                  selectScene(layout.setId);
                }}
                onStartEditing={() => setEditingTextElement(el.id)}
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
                onSelect={(e) => {
                  selectElement({ layoutId, elementId: el.id }, e.shiftKey);
                  selectScene(layout.setId);
                }}
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
                sceneSelected={isSceneSelected}
                expanding={expandingElementId === el.id}
                onExpandClick={handleExpandClick(el)}
                onSelect={(e) => {
                  selectElement({ layoutId, elementId: el.id }, e.shiftKey);
                  selectScene(layout.setId);
                }}
                onContextMenu={handleImageContextMenu(el.id)}
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
      </div>

      {isPickingFocus && (
        <div className="absolute inset-0 z-20 overflow-hidden" onMouseDown={handleFocusRectMouseDown}>
          {focusDrawRect ? (
            <>
              {/* The huge spread shadow dims everything outside this rect — the rect itself stays
                  un-dimmed, "cut out" of the overlay, since box-shadow never paints under its own box. */}
              <div
                className="pointer-events-none absolute border border-dashed"
                style={{
                  left: `${(focusDrawRect.x / nativeWidth) * 100}%`,
                  top: `${(focusDrawRect.y / nativeHeight) * 100}%`,
                  width: `${(focusDrawRect.w / nativeWidth) * 100}%`,
                  height: `${(focusDrawRect.h / nativeHeight) * 100}%`,
                  borderColor: '#4570FF',
                  background: 'rgba(45,136,255,0.1)',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                }}
              />
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={confirmFocusRect}
                className="absolute flex h-8 shrink-0 items-center justify-center rounded-full bg-button-primary px-3 text-sm text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:brightness-110"
                style={{
                  left: `${((focusDrawRect.x + focusDrawRect.w) / nativeWidth) * 100}%`,
                  top: `${((focusDrawRect.y + focusDrawRect.h) / nativeHeight) * 100}%`,
                  transform: 'translate(-100%, 8px)',
                }}
              >
                {t('Confirm')}
              </button>
            </>
          ) : focusPickConfirmed && layout.focusRect ? (
            // Confirmed this session — the picked rect just stays outlined on top, no dimming and
            // no buttons in the way now that there's nothing left to decide. Redrawing (mousedown
            // above) or closing the "Add more sizes" panel are the only ways out from here.
            // Gated on focusPickConfirmed (reset by startPickingFocus), not just layout.focusRect
            // existing — otherwise re-entering via "Change" on a scene with an old pick would skip
            // straight past the instructional pop-up below.
            <div
              className="pointer-events-none absolute border border-dashed"
              style={{
                left: `${(layout.focusRect.x / nativeWidth) * 100}%`,
                top: `${(layout.focusRect.y / nativeHeight) * 100}%`,
                width: `${(layout.focusRect.w / nativeWidth) * 100}%`,
                height: `${(layout.focusRect.h / nativeHeight) * 100}%`,
                borderColor: '#4570FF',
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div
                className="flex flex-col items-center justify-center gap-[18.6px] rounded-2xl border"
                style={{ width: 314, height: 222, padding: '18.6px 12px', background: 'rgba(38,38,44,0.88)', borderColor: '#40404A' }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <img src="/icons/select_area.svg" alt="" className="size-[62px] shrink-0" />
                <p className="text-center text-[13px] font-semibold tracking-[-0.01em] text-white">{t('Draw a rectangle around the scene focus')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {layerContextMenu && (
        <LayerContextMenu
          x={layerContextMenu.x}
          y={layerContextMenu.y}
          layoutId={layoutId}
          elementId={layerContextMenu.elementId}
          onClose={() => setLayerContextMenu(null)}
          onInsertNewImage={() => setInsertImagePickerOpen(true)}
        />
      )}
    </div>
  );
}
