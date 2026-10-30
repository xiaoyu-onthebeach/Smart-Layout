import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { useLatestCallback } from '@/hooks/useLatestCallback';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { nextId, layoutHasContent, isRealLayer } from '@/lib/create-layout';
import { layerName } from '@/lib/layer-name';
import { useApplyImage } from '@/hooks/useApplyImage';
import type { GroupAutoLayout, Joint, Layout, LayoutElement, ShapeKind } from '@/types';
import { parseSvgToElements } from '@/lib/svg-import';
import { readPasteableClipboardContent } from '@/lib/clipboard-import';
import { allControlPoints, ARROW_MIN_HEIGHT, defaultShapeStyle, JOINT_ICON, PEN_DEFAULT_FILL, PEN_DEFAULT_STROKE_COLOR, PEN_DEFAULT_STROKE_WIDTH, shapeKindToVectorPath } from '@/lib/vector-path';
import { boundsOf } from '@/lib/svg-geometry';
import { isWithinClosePathRadius, PenDrawingOverlay } from './PenDrawingOverlay';
import { ElementRenderer } from './ElementRenderer';
import { DraggableImageElement } from './DraggableImageElement';
import { EditableTextElement } from './EditableTextElement';
import { SelectableShapeElement } from './SelectableShapeElement';
import { SelectableVectorElement } from './SelectableVectorElement';
import { ImagePickerDialog } from './ImagePickerDialog';
import { ImageBox } from './ImageBox';
import { LayerContextMenu } from './LayerContextMenu';
import { MultiLayerContextMenu } from './MultiLayerContextMenu';
import { PaddingHighlight } from './PaddingHighlight';
import { computeGroupAutoLayout, framesBounds, pendingGroupAutoLayoutChanges } from '@/lib/group-auto-layout';
import { boxContainsPoint, boxFromFrame, computeMeasureLines, resolvePillCollisions, rotatedBoundingBox, roundForDisplay, unionBoxes, type Box, type MeasureLine, type PillSpec } from '@/lib/measure';

// Pen tool's custom "Default" cursor (svg import & edit spec, Part 3) — a preview joint sitting
// right at the pen nib's own tip, so the two have to be two separately positioned images rather
// than one plain CSS `cursor: url()`. Each icon's own true anchor point (not 50/50 center) matches
// how every other joint/handle icon in this file is positioned — see vector-path.ts's own icons for
// the same technique.
const PEN_CURSOR_ICON = { src: '/icons/SVGs/pen cursor 24.svg', w: 24, h: 24, tip: { x: 3.87, y: 3.87 } };
/** `pressed` — mouse currently held down (svg import & edit spec, Part 3 "Pressed": "the preview
 * joint switches to the selected style") — swaps the default joint for the selected one; everything
 * else about the cursor stays the same. */
function PenToolCursor({ x, y, pressed }: { x: number; y: number; pressed: boolean }) {
  return (
    <>
      {/* Painted first (behind) — the pen nib itself sits in front of the preview joint, not the
          other way around. Suppressed while `pressed`: that's exactly when the cursor is actually
          shaping a curve handle (Part 4), which already draws its own end-point marker right at this
          same spot (see PenDrawingOverlay) — showing both here would double up two joint glyphs on
          top of each other. */}
      {!pressed && (
        <img
          src={JOINT_ICON.src}
          alt=""
          className="pointer-events-none fixed z-50"
          style={{ left: x - JOINT_ICON.center.x, top: y - JOINT_ICON.center.y, width: JOINT_ICON.w, height: JOINT_ICON.h }}
        />
      )}
      <img
        src={PEN_CURSOR_ICON.src}
        alt=""
        className="pointer-events-none fixed z-50"
        style={{ left: x - PEN_CURSOR_ICON.tip.x, top: y - PEN_CURSOR_ICON.tip.y, width: PEN_CURSOR_ICON.w, height: PEN_CURSOR_ICON.h }}
      />
    </>
  );
}

const EXPAND_DURATION_MS = 5000;

/** The frame a shape-tool drag should produce. 'line' and 'arrow' are both thin, direction-of-drag
 * glyphs rather than a filled 2D shape (see ElementRenderer/`arrowPoints`) — a plain bounding box of
 * the actual drag, same as ever, so the shaft tracks the cursor's real distance ('line' additionally
 * collapses to a 1px-thick bar along whichever axis moved further, since this data model has no
 * rotation and an arbitrary-angle line isn't representable). Forcing either into the square lock
 * below would blow their "height" up to match a long horizontal drag and shove the whole glyph far
 * off from the cursor's own trail. Every other kind scales up proportionally as you drag instead — a
 * square bounding box sized to whichever of the two drag distances is currently larger, growing from
 * the start point toward wherever the cursor is, rather than stretching into an arbitrary rectangle. */
function shapeDragFrame(kind: ShapeKind, start: { x: number; y: number }, current: { x: number; y: number }) {
  const dragW = Math.abs(current.x - start.x);
  const dragH = Math.abs(current.y - start.y);
  if (kind === 'line') {
    if (dragW >= dragH) {
      return { x: Math.min(start.x, current.x), y: (start.y + current.y) / 2 - 0.5, w: Math.max(dragW, 1), h: 1 };
    }
    return { x: (start.x + current.x) / 2 - 0.5, y: Math.min(start.y, current.y), w: 1, h: Math.max(dragH, 1) };
  }
  if (kind === 'arrow') {
    // A typical arrow drag is nearly horizontal, so `dragH` alone is usually far short of what the
    // fixed-size arrowhead actually needs (`ARROW_MIN_HEIGHT`) — clamped up to that, and centered on
    // the drag's own vertical midpoint (not just anchored to its top) so the glyph lands centered on
    // the line actually dragged instead of sagging below it.
    const h = Math.max(dragH, ARROW_MIN_HEIGHT);
    const centerY = (start.y + current.y) / 2;
    return { x: Math.min(start.x, current.x), y: centerY - h / 2, w: Math.max(dragW, 1), h };
  }
  const size = Math.max(dragW, dragH);
  return {
    x: current.x >= start.x ? start.x : start.x - size,
    y: current.y >= start.y ? start.y : start.y - size,
    w: size,
    h: size,
  };
}

const MEASURE_COLOR = '#FD4E62';

/** One measurement line — percentage-positioned (so it scales with the scene like everything else
 * here) but with a fixed 1px border, so its weight stays constant on screen regardless of zoom. */
function MeasureLineSegment({ line, nativeWidth, nativeHeight }: { line: MeasureLine; nativeWidth: number; nativeHeight: number }) {
  const horizontal = line.y1 === line.y2;
  const left = Math.min(line.x1, line.x2);
  const top = Math.min(line.y1, line.y2);
  const length = horizontal ? Math.abs(line.x2 - line.x1) : Math.abs(line.y2 - line.y1);
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${(left / nativeWidth) * 100}%`,
        top: `${(top / nativeHeight) * 100}%`,
        width: horizontal ? `${(length / nativeWidth) * 100}%` : 0,
        height: horizontal ? 0 : `${(length / nativeHeight) * 100}%`,
        borderTop: horizontal ? `1px ${line.dashed ? 'dashed' : 'solid'} ${MEASURE_COLOR}` : undefined,
        borderLeft: !horizontal ? `1px ${line.dashed ? 'dashed' : 'solid'} ${MEASURE_COLOR}` : undefined,
      }}
    />
  );
}

/** A measurement distance pill, centered on its line's midpoint — matches the Figma reference
 * exactly (fill, text, padding, radius); font inherits the app's own Saans base font. */
function MeasurePill({ x, y, nativeWidth, nativeHeight, value, background }: { x: number; y: number; nativeWidth: number; nativeHeight: number; value: string; background: string }) {
  return (
    <div
      className="pointer-events-none absolute flex h-[21px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 text-[13px] leading-none font-semibold tracking-[-0.01em] text-white"
      style={{
        left: `${(x / nativeWidth) * 100}%`,
        top: `${(y / nativeHeight) * 100}%`,
        transform: 'translate(-50%, -50%)',
        background,
        boxShadow: '0px 1px 2px rgba(0,0,0,0.03), 0px 1px 6px -1px rgba(0,0,0,0.02), 0px 2px 4px rgba(0,0,0,0.02)',
      }}
    >
      {value}
    </div>
  );
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
function ArtboardFrameImpl({
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
   * context menu, which stops propagation) — the scene-level "Duplicate banner / Delete / Preview"
   * menu. `pasteHere` is bound to wherever the click actually landed — the menu calls it for its own
   * "Paste here" item. */
  onSceneContextMenu?: (e: ReactMouseEvent, pasteHere: () => void) => void;
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
  // Bulk edit's row being edited shows as selected too (see bulkEditActivePageId).
  const bulkEditActive = useAppStore((s) => s.bulkEditActivePageId === layout.setId);
  const isSceneSelected = selectedSceneIds.includes(layout.setId) || bulkEditActive;
  // The layer behind the Replace table's active cell, when it's in this banner — outlined only.
  const bulkEditHighlightId = useAppStore((s) => (s.bulkEditHighlight?.pageIds.includes(layout.setId) ? s.bulkEditHighlight.elementId : null));
  const bulkEditHighlighted = bulkEditHighlightId ? layout.elements.find((el) => el.id === bulkEditHighlightId) : undefined;
  const updateElement = useAppStore((s) => s.updateElement);
  const setGroupLayout = useAppStore((s) => s.setGroupLayout);
  const addElement = useAppStore((s) => s.addElement);
  const mergeGroupMeta = useAppStore((s) => s.mergeGroupMeta);
  const setEditingTextElement = useAppStore((s) => s.setEditingTextElement);
  const editingVectorElementId = useAppStore((s) => s.editingVectorElementId);
  const setEditingVectorElement = useAppStore((s) => s.setEditingVectorElement);
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const shapeToolKind = useAppStore((s) => s.shapeToolKind);
  const selectedElements = useAppStore((s) => s.selectedElements);
  const autoMatchedElements = useAppStore((s) => s.autoMatchedElements);
  // Only this banner's own guides — subscribing to the whole list would re-render every banner on
  // the canvas each time a drag anywhere updates it.
  const activeGuides = useAppStore(useShallow((s) => s.activeGuides.filter((g) => g.layoutId === layout.id)));
  const editingTextElementId = useAppStore((s) => s.editingTextElementId);
  const selectElement = useAppStore((s) => s.selectElement);
  const setSelectedElements = useAppStore((s) => s.setSelectedElements);
  const duplicateElement = useAppStore((s) => s.duplicateElement);
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
  // Set for the duration of an Option-drag-duplicate — the ORIGINAL element this mousedown landed
  // on (not the new duplicate, which gets its own normal selection outline) stays selected-ish in
  // spirit but shows no box while its clone is what's actually being dragged around.
  const [altDuplicateOriginalId, setAltDuplicateOriginalId] = useState<string | null>(null);
  const showsBoundsBox = (elementId: string) => {
    if (elementId === altDuplicateOriginalId) return false;
    if (!isSelected(elementId)) return false;
    // A grouped-but-not-entered element never shows its own box — the whole group draws one
    // shared box instead (see the group-bounds overlay near the end of this component).
    const groupId = layout.elements.find((el) => el.id === elementId)?.groupId;
    if (groupId && groupId !== enteredGroupId) return false;
    if (!isAutoMatched(elementId)) return true;
    return elementId !== backgroundElementId;
  };
  // Option-drag-duplicate: clones `el` in place (undoing duplicateElement's own +16/+16 nudge,
  // since this clone is meant to start exactly under the cursor, not offset from it), switches
  // selection to the clone so it's what the drag below actually moves, and hides the original's own
  // bounding box for the duration — restored by the returned `onDragEnd`, which each draggable
  // component calls from its own mouseup once the drag completes.
  function startAltDuplicate(el: LayoutElement): { newId: string; onDragEnd: () => void } {
    const newId = duplicateElement(layoutId, el.id);
    updateElement(layoutId, newId, { frame: el.frame });
    setSelectedElements([{ layoutId, elementId: newId }]);
    setAltDuplicateOriginalId(el.id);
    return { newId, onDragEnd: () => setAltDuplicateOriginalId(null) };
  }
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

  const frameRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addUploadedAsset = useAppStore((s) => s.addUploadedAsset);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [expandingElementId, setExpandingElementId] = useState<string | null>(null);
  const [layerContextMenu, setLayerContextMenu] = useState<
    | { kind: 'single'; x: number; y: number; elementId: string }
    | { kind: 'multi'; x: number; y: number; elementIds: string[]; groupId?: string }
    | null
  >(null);
  const [insertImagePickerOpen, setInsertImagePickerOpen] = useState(false);

  // --- Option/Alt held: gates both the measurement overlay ("hold Option to measure", see
  // measurement-overlay-spec.md) and the Option-drag-duplicate cursor hint below. Bare Option/Alt
  // triggers nothing else anywhere in this app (checked: Shell's shortcuts, the shape toolbar, the
  // zoom-wheel handler, and image-resize's expand modifier all require a different key or a drag
  // already in progress) — the measurement overlay was switched to this key from the spec's
  // original Cmd/Ctrl binding per explicit feedback, and duplicate-drag reuses it for the same
  // "free modifier" reason, matching the Figma/Sketch convention for both gestures.
  const [altKeyDown, setAltKeyDown] = useState(false);
  useEffect(() => {
    if (!active) return;
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return el?.isContentEditable || el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Alt' && !isTypingTarget(e.target)) setAltKeyDown(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Alt') setAltKeyDown(false);
    }
    function onBlur() {
      setAltKeyDown(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [active]);

  // The cursor is tracked continuously while active (not just while the Option overlay is showing)
  // so its position is already known the instant Option goes down — entering should be instant,
  // not wait for the next move. It's only kept in a ref though, and copied into state (which
  // re-renders this whole frame) only while Option is actually held — otherwise merely hovering
  // the banner re-rendered it on every mouse move for an overlay nobody was looking at.
  const [measurePoint, setMeasurePoint] = useState<{ x: number; y: number } | null>(null);
  const measureRafRef = useRef<number | null>(null);
  const measureLastClientRef = useRef<{ x: number; y: number } | null>(null);
  const altKeyDownRef = useRef(altKeyDown);
  const updateMeasurePoint = useLatestCallback(() => {
    const p = measureLastClientRef.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!p || !rect) return;
    setMeasurePoint({ x: (p.x - rect.left) / scale, y: (p.y - rect.top) / scale });
  });
  useEffect(() => {
    altKeyDownRef.current = altKeyDown;
    if (altKeyDown) updateMeasurePoint();
  }, [altKeyDown, updateMeasurePoint]);
  useEffect(() => {
    if (!active) {
      setMeasurePoint(null);
      return;
    }
    function onMove(e: globalThis.MouseEvent) {
      measureLastClientRef.current = { x: e.clientX, y: e.clientY };
      if (!altKeyDownRef.current || measureRafRef.current != null) return;
      measureRafRef.current = requestAnimationFrame(() => {
        measureRafRef.current = null;
        updateMeasurePoint();
      });
    }
    // Cursor leaving the browser window entirely (not just this frame) should clear the target per
    // spec edge case 7 — `relatedTarget` is null exactly in that case, nowhere else.
    function onDocumentMouseOut(e: globalThis.MouseEvent) {
      if (!e.relatedTarget) setMeasurePoint(null);
    }
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseout', onDocumentMouseOut);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseout', onDocumentMouseOut);
      if (measureRafRef.current != null) cancelAnimationFrame(measureRafRef.current);
    };
  }, [active, updateMeasurePoint]);

  // Source = current selection's own (rotation-aware) union box, scoped to this scene only — a
  // selection living in a sibling scene never measures against this one (spec edge case 10). Also
  // active for the duration of an Option-drag-duplicate even if Option itself has since been
  // released mid-drag (Figma's own convention: releasing the key after the clone exists doesn't
  // cancel the drag) — the clone being dragged is already the current selection either way.
  const measureSourceElements: LayoutElement[] = selectedElements
    .filter((r) => r.layoutId === layoutId)
    .map((r) => layout.elements.find((el) => el.id === r.elementId))
    .filter((el): el is LayoutElement => Boolean(el));
  const measureSourceBox: Box | null = (() => {
    if (!altKeyDown && !altDuplicateOriginalId) return null;
    const boxes = measureSourceElements.map((el) => rotatedBoundingBox(el.frame, el.rotation ?? 0));
    return boxes.length > 0 ? unionBoxes(boxes) : null;
  })();
  // A rotated-bounding-box highlight on the source itself only makes sense for a single rotated
  // element — a multi-select union is already an axis-aligned box by construction (nothing to
  // visually distinguish it with), and an unrotated source's own box already coincides exactly
  // with its normal (blue) selection outline, so a second box there would just double up for
  // nothing. Mirrors the target's own highlight below, same color, same purpose: show the actual
  // box the distance math is using.
  const sourceIsSingleRotatedElement = measureSourceElements.length === 1 && Boolean(measureSourceElements[0].rotation);

  type MeasureTarget = { kind: 'source' } | { kind: 'box'; box: Box };
  const measureTarget: MeasureTarget | null = (() => {
    if (!measureSourceBox) return null;
    // Mid Option-drag-duplicate, the cursor sits on the clone itself (you're holding a point on
    // it), so cursor-based hit-testing below would just resolve to "source" the whole time — not
    // useful. Force the target to the original instead: the one comparison that's actually
    // meaningful while dragging a fresh duplicate around is "how far have I moved this from where
    // it started."
    if (altDuplicateOriginalId) {
      const original = layout.elements.find((el) => el.id === altDuplicateOriginalId);
      if (!original) return null;
      const box = rotatedBoundingBox(original.frame, original.rotation ?? 0);
      // Suppressed for as long as the duplicate hasn't actually moved from where it started (right
      // at mousedown, before any real drag) — "0 in every direction" just restates the obvious.
      // Both boxes are always the same size here (a plain move never resizes), so comparing one
      // corner is enough to know the whole box still matches.
      if (Math.round(box.left) === Math.round(measureSourceBox.left) && Math.round(box.top) === Math.round(measureSourceBox.top)) return null;
      return { kind: 'box', box };
    }
    if (!measurePoint) return null;
    const sourceIds = new Set(selectedElements.filter((r) => r.layoutId === layoutId).map((r) => r.elementId));
    // Topmost element wins (array order is back-to-front, so walk it in reverse), skipping hidden
    // or locked layers — neither should ever be a hover target (spec edge case 4) — and skipping
    // `emptySlotElements`' still-untouched starter stubs (the hero image slot, "Add headline" etc.)
    // which have a real, hit-testable frame but nothing a user actually put there, and would
    // otherwise surface as a mystery measurable "layer" with no visible trace on canvas.
    for (let i = layout.elements.length - 1; i >= 0; i--) {
      const el = layout.elements[i];
      if (!el.visible || el.locked || !isRealLayer(el)) continue;
      const box = rotatedBoundingBox(el.frame, el.rotation ?? 0);
      if (boxContainsPoint(box, measurePoint.x, measurePoint.y)) {
        return sourceIds.has(el.id) ? { kind: 'source' } : { kind: 'box', box };
      }
    }
    // Nothing under the cursor (frame background, or outside the frame entirely) → frame bounds.
    return { kind: 'box', box: boxFromFrame({ x: 0, y: 0, w: nativeWidth, h: nativeHeight }) };
  })();
  const measureLines: MeasureLine[] = measureSourceBox && measureTarget?.kind === 'box' ? computeMeasureLines(measureSourceBox, measureTarget.box) : [];

  // Every pill the overlay shows this frame — one per gap/offset line — laid out once so collisions
  // (spec: "offset them perpendicular to their lines") can be resolved across all of them together,
  // not just pairwise ad hoc. Width is a rough estimate from the rendered text (13px font-semibold,
  // ~7px/char, 16px of horizontal padding) — good enough for a collision check, not pixel-exact.
  const measurePillTexts: { id: string; x: number; y: number; text: string; background: string }[] = measureSourceBox
    ? measureLines
        .filter((ln): ln is MeasureLine & { value: number } => ln.value !== null)
        // Case 4's overlap offsets are the only lines that ever go negative (a real gap can't be);
        // shown unsigned — the dashed styling already distinguishes "offset" from "gap" on its own.
        .map((ln) => ({ id: ln.id, x: (ln.x1 + ln.x2) / 2, y: (ln.y1 + ln.y2) / 2, text: `${Math.abs(roundForDisplay(ln.value))}`, background: MEASURE_COLOR }))
    : [];
  const measurePillSpecs: PillSpec[] = measurePillTexts.map((p) => ({ id: p.id, x: p.x * scale, y: p.y * scale, width: p.text.length * 7 + 16, height: 21 }));
  const measurePillPositions = resolvePillCollisions(measurePillSpecs);

  const imageElement = layout.elements.find((el) => el.kind === 'image');
  const hasImage = Boolean(imageElement?.imageUrl);
  // Excludes the filled hero once it's actually filled — a freshly dropped image (as opposed to
  // one seeded into a pre-existing named slot) gets `slot: null` same as any decorative element,
  // so without this it'd double up here *and* in the dedicated hero block below, rendering two
  // fully overlapping copies of the same element (each with its own independent expand icon,
  // frame-gap grid, etc. — everywhere else the overlap was pixel-identical enough to go unnoticed).
  const extraElements = layout.elements.filter((el) => el.slot === null && el.visible && !(hasImage && el.id === imageElement?.id));

  // The scene's "background image": the real hero slot if it's filled, otherwise whichever
  // image-kind decorative layer was added first — a scene built entirely from double-click-dropped
  // samples has no filled hero slot, so that first drop is standing in for the background instead.
  const backgroundElementId = hasImage ? imageElement?.id : extraElements.find((el) => el.kind === 'image' && el.imageUrl)?.id;

  // Any selected layer — image, text, or shape — whose frame spills past the artboard's own bounds
  // gets a preview of the overflowing part — hidden again the moment it's deselected. Gated on
  // showsBoundsBox (not isSelected) so an auto-matched sibling image — selected for bulk-edit but
  // not the literal clicked element — doesn't grow this preview either. Originally image-only
  // (hence the name), generalized to every layer kind once the same clipping turned out to affect
  // a dragged text/shape layer's own selection box identically.
  // A 1px tolerance keeps a genuinely full-bleed element (frame exactly matching the artboard, or
  // off by a sub-pixel rounding artifact from a drag) from double-counting as "overflowing" here —
  // without it, this outline trace would render *on top of* SelectionBoundingBox's own clipped
  // outline for any such element, showing as a doubled/thicker selection border for no real overflow.
  const OVERFLOW_TOLERANCE = 1;
  const overflowElements = [imageElement, ...extraElements].filter(
    (el): el is LayoutElement =>
      Boolean(el) &&
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

  // Adds a new decorative image layer (never replacing whatever's already there) centered on `point`,
  // scaled to fit within 40% of the frame while keeping its own aspect ratio — shared by a dragged
  // asset tile, a dropped file, and pasting an image straight from the clipboard.
  function addImageAt(url: string, point: { x: number; y: number }) {
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

  // Lets an asset tile dragged from the left panel drop straight onto any frame — active or not,
  // in the editor or a view-all card — adding it as a new decorative layer (never replacing
  // whatever's already there) centered on the drop point.
  function handleAssetDrop(e: ReactDragEvent) {
    e.preventDefault();
    const point = nativePointFromEvent(e);

    // An .svg dragged straight from the OS (not a library/uploads tile, which drags a plain URL —
    // see the `text/plain` branch below) arrives as a real File on `dataTransfer.files`.
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && (droppedFile.type === 'image/svg+xml' || droppedFile.name.toLowerCase().endsWith('.svg'))) {
      droppedFile.text().then((text) => importSvgAt(text, point));
      return;
    }

    const url = e.dataTransfer.getData('text/plain');
    if (!url) return;
    addImageAt(url, point);
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

  // SVG import entry point (upload button, canvas file drop, clipboard paste — see svg-import.ts
  // and svg-import-and-edit.md's Part 1) — parses `svgText` and adds the resulting vector/group/
  // image layers centered on `point`, selecting all of them (a freshly-placed vector starts in the
  // Focused state like any other new layer; Part 2's joint editing is entered separately, by
  // double-click or Enter). Layer-panel presentation of the result is deliberately not handled yet.
  async function importSvgAt(svgText: string, point: { x: number; y: number }) {
    // Async because any embedded <image> missing explicit width/height needs its own natural size
    // decoded first (see preloadImageNaturalSizes in svg-import.ts) — callers fire this and move on,
    // nothing downstream of the import depends on it finishing synchronously.
    const { elements, groupMeta, warning } = await parseSvgToElements(svgText, point);
    if (warning || elements.length === 0) {
      console.warn('[svg-import]', warning ?? 'nothing to import');
      return;
    }
    for (const element of elements) addElement(layoutId, element);
    if (Object.keys(groupMeta).length > 0) mergeGroupMeta(layoutId, groupMeta);
    selectScene(layout.setId);
    setSelectedElements(elements.map((el) => ({ layoutId, elementId: el.id })));
  }

  // "Make all shapes editable as svg": double-clicking any shape layer converts it in place into a
  // real, joint-editable vector path (same geometry its own pre-conversion rendering already drew —
  // see shapeKindToVectorPath's own doc comment) and hands it straight to Part 2's joint editing.
  function convertShapeToVectorAndEdit(element: LayoutElement) {
    // The layer's displayed name would otherwise flip from "Shape" to "Vector" the moment it
    // converts (layerName() falls back to a kind-based default when nothing's set) — captured
    // before the kind change so it reads exactly the same before and after.
    const name = layerName(element);
    const path = shapeKindToVectorPath(element.shape ?? 'rect', element.frame.w, element.frame.h, element.style.polygonSides, element.style.strokeWidth ?? 0);
    updateElement(layoutId, element.id, { kind: 'vector', path, shape: undefined, name });
    setEditingVectorElement(element.id);
  }

  // Third SVG import entry point: pasting straight from the clipboard. Covers every shape that can
  // actually land there — an `image/svg+xml` clipboard *item*, which can be either `kind: 'string'`
  // (markup copied as text, e.g. from a code editor) or `kind: 'file'` (an actual .svg file copied in
  // Finder/Explorer and pasted in, which only exposes a Blob via `getAsFile()`, not `getAsString()`);
  // a `.svg` file surfacing on `clipboardData.files` instead of `.items` (happens on some browser/OS
  // combinations for a file copy); or plain text/html containing a bare `<svg>...</svg>` (e.g. a
  // browser devtools "copy element" action). Only this frame's own live instance listens, and only
  // when focus isn't already inside some other text field/editable.
  useEffect(() => {
    if (!active) return;
    function isSvgFile(file: File) {
      return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    }
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      const point = { x: nativeWidth / 2, y: nativeHeight / 2 };

      const svgFile = Array.from(e.clipboardData?.files ?? []).find(isSvgFile);
      if (svgFile) {
        e.preventDefault();
        svgFile.text().then((text) => importSvgAt(text, point));
        return;
      }

      const items = Array.from(e.clipboardData?.items ?? []);
      const svgFileItem = items.find((item) => item.kind === 'file' && item.type === 'image/svg+xml');
      if (svgFileItem) {
        e.preventDefault();
        const file = svgFileItem.getAsFile();
        if (file) file.text().then((text) => importSvgAt(text, point));
        return;
      }
      const svgStringItem = items.find((item) => item.kind === 'string' && item.type === 'image/svg+xml');
      if (svgStringItem) {
        e.preventDefault();
        svgStringItem.getAsString((text) => importSvgAt(text, point));
        return;
      }

      const text = e.clipboardData?.getData('text/html') || e.clipboardData?.getData('text/plain') || '';
      const match = text.match(/<svg[\s\S]*?<\/svg>/i);
      if (match) {
        e.preventDefault();
        importSvgAt(match[0], point);
        return;
      }

      // A plain Cmd+C on a layer in most design tools (Figma, Sketch, Illustrator...) puts a
      // flattened PNG on the clipboard, not real SVG/vector data — the tool's own proprietary format
      // alongside it isn't something a web page can ever read, no matter how this handler is written
      // (there's a "Copy as SVG" action in Figma specifically that writes real markup instead, which
      // the branches above already handle). A plain image layer is still more useful than nothing.
      const imageFile = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/')) ?? items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
      if (imageFile) {
        e.preventDefault();
        addImageAt(URL.createObjectURL(imageFile), point);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, layoutId, nativeWidth, nativeHeight]);

  // Commits the background image straight to the frame's own full bounds — the one-click fix for a
  // moved/undersized image leaving a gap. Sets pendingExpand first (briefly, just for the duration
  // of the animation) so ImageBox's shimmer overlay can size itself to the target box ahead of the
  // real frame update landing, for a consistent "generating" beat.
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
        // and 'arrow' get their own thin, wide default instead of the square rect/ellipse use, since
        // both render as a horizontal bar/shaft (see ElementRenderer) and a square is either
        // indistinguishable from a small rectangle or leaves the arrowhead with no room to read.
        const smallFrame =
          shapeToolKind === 'line'
            ? { x: start.x - nativeWidth * 0.15, y: start.y - nativeHeight * 0.01, w: nativeWidth * 0.3, h: nativeHeight * 0.02 }
            : shapeToolKind === 'arrow'
              ? (() => {
                  const h = Math.max(nativeHeight * 0.08, ARROW_MIN_HEIGHT);
                  return { x: start.x - nativeWidth * 0.15, y: start.y - h / 2, w: nativeWidth * 0.3, h };
                })()
              : { x: start.x - nativeWidth * 0.1, y: start.y - nativeHeight * 0.1, w: nativeWidth * 0.2, h: nativeHeight * 0.2 };
        const frame = small ? smallFrame : shapeDragFrame(shapeToolKind, start, current);
        const element: LayoutElement = {
          id: nextId('el'),
          kind: 'shape',
          shape: shapeToolKind,
          slot: null,
          frame,
          style: defaultShapeStyle(shapeToolKind),
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
      return;
    }

    if (activeTool === 'pen') {
      handlePenMouseDown(e);
    }
  }

  const frameCursorClass = !active
    ? 'cursor-pointer'
    : activeTool === 'text'
      ? 'cursor-text'
      : activeTool === 'shape'
        ? 'cursor-crosshair'
        : activeTool === 'pen'
          ? 'cursor-none'
          : '';
  // Pen tool's own cursor (svg import & edit spec, Part 3 "Default" state) is a DOM-tracked overlay,
  // not a plain CSS `cursor: url()` — it's two separate icons (the pen nib + a preview joint sitting
  // right at its tip), which a single cursor image can't compose. Native cursor hidden above via
  // `cursor-none`, this follows the real mouse position in its place.
  const [penCursorPos, setPenCursorPos] = useState<{ x: number; y: number } | null>(null);

  // The pen tool's own in-progress drawing session (Part 3 straight segments, Part 4 curves) —
  // `joints` are committed so far (layout-space, absolute; each a real `Joint` with its own handles,
  // not a flattened point), `cursor` is the live mouse position in that same space (drives the
  // rubber-band preview segment), `pressed` is true for the window between mousedown and mouseup
  // (shows the cursor's own preview joint in its selected style — "Pressed" state). `null` means the
  // tool isn't active at all; an empty array means it's active but nothing's placed yet.
  type PenDrawState = { joints: Joint[]; cursor: { x: number; y: number } | null; pressed: boolean };
  const [penDraw, setPenDraw] = useState<PenDrawState | null>(null);
  // Mirrors `penDraw` for the tool-switch-away effect below, whose cleanup needs the *latest* value
  // at the moment the tool actually changes — the effect's own closure would otherwise see whatever
  // `penDraw` was when that render's effect was set up, not whatever it became since.
  const penDrawRef = useRef<PenDrawState | null>(null);
  penDrawRef.current = penDraw;

  // "Vector N" scoped per frame (not per import, which has its own counter — see svg-import.ts):
  // never resets across drawing sessions, continues from whatever's already in this layout (import
  // or earlier pen drawings alike), never renumbers existing ones since it only ever reads names.
  function nextPenVectorName(): string {
    let max = 0;
    for (const el of layout.elements) {
      const m = el.name?.match(/^Vector (\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `Vector ${max + 1}`;
  }

  /** Ends the current drawing session — Enter/Esc, switching tools, or closing the path by clicking
   * the first joint all funnel through here. A single remaining joint is discarded outright (spec:
   * "A path with only one joint is discarded on finish"); otherwise a real Vector layer is created,
   * selected, and left in the canvas's normal Focused state (handled already — any freshly added,
   * freshly selected element starts there). Does **not** touch `activeTool` itself — callers that
   * need it back on Select (finishing via Enter/Esc/close-click) set that separately, since the
   * tool-switch-away path (this ending up running from that effect's own cleanup) must not fight
   * whatever tool the user is actually switching to.
   */
  function finishDrawing(closed: boolean) {
    const session = penDrawRef.current;
    setPenDraw(null);
    if (!session || session.joints.length < 2) return;
    // Bounds over every joint *and* handle (see `allControlPoints`) — a curve bulging on its handles
    // must not get clipped by a frame sized only to the joints themselves.
    const bounds = boundsOf(allControlPoints(session.joints));
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const shift = (p: { x: number; y: number }) => ({ x: p.x - bounds.minX, y: p.y - bounds.minY });
    const joints: Joint[] = session.joints.map((j) => ({ ...j, ...shift(j), handleIn: j.handleIn ? shift(j.handleIn) : null, handleOut: j.handleOut ? shift(j.handleOut) : null }));
    const element: LayoutElement = {
      id: nextId('el'),
      kind: 'vector',
      slot: null,
      frame: { x: bounds.minX, y: bounds.minY, w, h },
      visible: true,
      name: nextPenVectorName(),
      path: { joints, closed },
      style: closed
        ? { fill: PEN_DEFAULT_FILL, strokeWidth: undefined }
        : { fill: undefined, strokeColor: PEN_DEFAULT_STROKE_COLOR, strokeWidth: PEN_DEFAULT_STROKE_WIDTH, strokeStyle: 'solid' },
    };
    addElement(layoutId, element);
    selectScene(layout.setId);
    selectElement({ layoutId, elementId: element.id });
  }

  // Entering the tool starts a fresh session; leaving it (switching tools, including back to
  // 'select' after finishing) ends whatever was in progress — "switching to another tool also
  // finishes the current path". The cleanup closure's own `activeTool` is whatever it was when caught
  // in this exact effect run, i.e. still 'pen' right up until the moment it's about to change away.
  useEffect(() => {
    if (activeTool !== 'pen') return;
    setPenDraw({ joints: [], cursor: null, pressed: false });
    return () => {
      if (penDrawRef.current) finishDrawing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  // Enter/Esc finish as an open path; Backspace removes the last placed joint. Scoped to this one
  // live frame instance, same guard every other canvas keyboard shortcut in this file already uses.
  useEffect(() => {
    if (!active || activeTool !== 'pen') return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter' || e.key === 'Escape') {
        if (!penDrawRef.current) return;
        e.preventDefault();
        finishDrawing(false);
        setActiveTool('select');
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const session = penDrawRef.current;
        if (!session || session.joints.length === 0) return;
        e.preventDefault();
        setPenDraw({ ...session, joints: session.joints.slice(0, -1) });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeTool]);

  /** One mousedown→(optional drag)→mouseup gesture places (or, clicking the first joint again,
   * closes on) the next joint — covers both gestures the spec asks for: a plain "click, move, click"
   * places a corner joint (no handles) wherever the mouse ends up on release; "press, drag, release"
   * additionally pulls that same joint's handles out as it drags (Part 4). A small movement threshold
   * tells the two apart, same as a real pen tool's own click-vs-drag detection. */
  function handlePenMouseDown(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const session = penDrawRef.current;
    if (!session) return;
    const pressPoint = nativePointFromEvent(e);
    const activeJoint = session.joints[session.joints.length - 1] ?? null;
    // This gesture's own joint always lands at this index — `onMove` keeps overwriting it live as
    // the drag continues; a plain click (never entering `onMove`) appends it fresh in `onUp` instead.
    const newIndex = session.joints.length;
    let spaceHeld = false;
    let draggedHandle: { x: number; y: number } | null = null; // last real (non-Space) handle drag, for the final onUp recompute

    // Shift constrains the OUTGOING HANDLE's own angle (relative to the joint being placed, i.e.
    // `pressPoint`) to 45° increments — Part 4's own replacement for Part 3's straight-segment-angle
    // constrain, now that dragging shapes a curve instead of just repositioning a corner.
    function constrainHandle(cursor: { x: number; y: number }, shiftKey: boolean) {
      const raw = { x: cursor.x - pressPoint.x, y: cursor.y - pressPoint.y };
      if (!shiftKey) return raw;
      const len = Math.hypot(raw.x, raw.y);
      const angle = Math.round(Math.atan2(raw.y, raw.x) / (Math.PI / 4)) * (Math.PI / 4);
      return { x: Math.cos(angle) * len, y: Math.sin(angle) * len };
    }

    function curveJointAt(jointPos: { x: number; y: number }, vec: { x: number; y: number }): Joint {
      return { x: jointPos.x, y: jointPos.y, handleOut: { x: jointPos.x + vec.x, y: jointPos.y + vec.y }, handleIn: { x: jointPos.x - vec.x, y: jointPos.y - vec.y }, mirror: 'mirror' };
    }

    setPenDraw((prev) => (prev ? { ...prev, pressed: true } : prev));

    function onMove(ev: globalThis.MouseEvent) {
      const current = penDrawRef.current;
      if (!current) return;
      const cur = nativePointFromEvent(ev);
      if (spaceHeld) {
        // "Space (hold): move the joint itself instead of the handle" — the handle stays wherever it
        // already was (an absolute point, same as every other handle), only the joint's own x/y follow.
        const existing = current.joints[newIndex];
        const joints = [...current.joints];
        joints[newIndex] = existing ? { ...existing, x: cur.x, y: cur.y } : { x: cur.x, y: cur.y, handleIn: null, handleOut: null, mirror: 'sharp' };
        setPenDraw({ ...current, joints, cursor: cur });
        return;
      }
      const vec = constrainHandle(cur, ev.shiftKey);
      draggedHandle = vec;
      const joints = [...current.joints];
      joints[newIndex] = curveJointAt(pressPoint, vec);
      setPenDraw({ ...current, joints, cursor: cur });
    }
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.code === 'Space') {
        ev.preventDefault();
        spaceHeld = true;
      }
    }
    function onKeyUp(ev: KeyboardEvent) {
      if (ev.code === 'Space') spaceHeld = false;
    }

    function onUp(ev: globalThis.MouseEvent) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      const current = penDrawRef.current;
      if (!current) return;
      const cur = nativePointFromEvent(ev);
      const moved = Math.hypot(cur.x - pressPoint.x, cur.y - pressPoint.y) > 2;

      let joints: Joint[];
      if (moved) {
        if (spaceHeld) {
          // Released while still holding Space — the joint is wherever it last tracked the cursor to.
          const existing = current.joints[newIndex];
          joints = [...current.joints];
          joints[newIndex] = existing ? { ...existing, x: cur.x, y: cur.y } : { x: cur.x, y: cur.y, handleIn: null, handleOut: null, mirror: 'sharp' };
        } else {
          const vec = draggedHandle ?? constrainHandle(cur, ev.shiftKey);
          joints = [...current.joints];
          joints[newIndex] = curveJointAt(pressPoint, vec);
        }
      } else {
        // A plain click. "Click on the active (last placed) joint: removes its outgoing handle" —
        // checked against the joint that was already active *before* this gesture, so clicking it
        // again (rather than empty canvas) is unambiguous.
        if (activeJoint && activeJoint.handleOut && isWithinClosePathRadius(pressPoint, activeJoint, scale)) {
          joints = [...current.joints];
          joints[joints.length - 1] = { ...activeJoint, handleOut: null, mirror: activeJoint.handleIn ? 'nomirror' : 'sharp' };
          setPenDraw({ ...current, joints, cursor: pressPoint, pressed: false });
          return;
        }
        joints = [...current.joints, { x: pressPoint.x, y: pressPoint.y, handleIn: null, handleOut: null, mirror: 'sharp' }];
      }

      // Closing: this release landed within the first joint's own hit radius, and there's enough of
      // a shape to close (at least a triangle). The closing joint we just placed/shaped is discarded
      // — closing reuses joint[0] as the shared start/end point, carrying over whatever incoming
      // handle this gesture gave it (so closing with a drag still curves into the start correctly).
      if (joints.length >= 3 && isWithinClosePathRadius(cur, joints[0], scale)) {
        const closingJoint = joints[joints.length - 1];
        const committed = joints.slice(0, -1);
        committed[0] = { ...committed[0], handleIn: closingJoint.handleIn ?? committed[0].handleIn };
        setPenDraw({ ...current, joints: committed, cursor: null });
        finishDrawing(true);
        setActiveTool('select');
        return;
      }

      setPenDraw({ ...current, joints, cursor: cur, pressed: false });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  // Keeps every auto-layout group stacked after any change — a member resized (text re-measured,
  // padding typed), dragged out of place, added or removed. Runs as a layout effect, after the
  // members' own measurement effects and before paint, so a reflow never flashes on screen; a
  // drag's per-member updates all land in one render first, so a whole-group move is seen as one.
  useLayoutEffect(() => {
    const { moves, relocated } = pendingGroupAutoLayoutChanges(layout.elements);
    for (const r of relocated) setGroupLayout(layoutId, r.groupId, r.layout);
    for (const m of moves) updateElement(layoutId, m.id, { frame: m.frame });
  }, [layout.elements, layoutId, setGroupLayout, updateElement]);

  // One big box per selected-and-not-entered group, spanning every one of its members — drawn in
  // place of each member's own individual box (see showsBoundsBox). Every member of a group is
  // always selected together (selectElement expands to the whole group), so checking any one
  // member's selection state is enough to know the whole group is currently selected.
  const groupBounds: {
    groupId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    padding?: GroupAutoLayout['padding'];
    /** Box-relative, for the spacing highlight. */
    gaps?: { x: number; y: number; w: number; h: number }[];
  }[] = [];
  if (active) {
    const seenGroupIds = new Set<string>();
    for (const el of layout.elements) {
      if (!el.groupId || el.groupId === enteredGroupId || seenGroupIds.has(el.groupId) || !isSelected(el.id)) continue;
      seenGroupIds.add(el.groupId);
      const members = layout.elements.filter((m) => m.groupId === el.groupId);
      // An auto-layout group's box includes its padding (or its fixed size), not just the members.
      if (el.groupLayout) {
        const { box, gaps } = computeGroupAutoLayout(members, el.groupLayout);
        const relativeGaps = gaps.map((g) => ({ ...g, x: g.x - box.x, y: g.y - box.y }));
        groupBounds.push({ groupId: el.groupId, ...box, padding: el.groupLayout.padding, gaps: relativeGaps });
      } else {
        groupBounds.push({ groupId: el.groupId, ...framesBounds(members.map((m) => m.frame)) });
      }
    }
  }

  return (
    <div className={cn('relative', className)} style={{ width, height, ...style }}>
      {/* A selected layer's own outline+handles (SelectionBoundingBox, rendered inside the
          overflow-hidden frame below) get clipped wherever it spills past the frame's own bounds —
          this traces the rest of that same outline, unclipped, so the full extent of an
          overflowing layer (dragged past an edge, or just larger than the frame) stays visible.
          Rotation is applied explicitly here (unlike the real selection box, which inherits it from
          its own rotated parent wrapper) since this trace is a plain sibling, not nested inside it. */}
      {bulkEditHighlighted && (
        // Same outline as a selected layer, but unclipped by the frame and with no handles.
        <div
          className="pointer-events-none absolute z-10 outline outline-[1.5px] outline-popsicle"
          style={{
            left: `${(bulkEditHighlighted.frame.x / nativeWidth) * 100}%`,
            top: `${(bulkEditHighlighted.frame.y / nativeHeight) * 100}%`,
            width: `${(bulkEditHighlighted.frame.w / nativeWidth) * 100}%`,
            height: `${(bulkEditHighlighted.frame.h / nativeHeight) * 100}%`,
            transform: bulkEditHighlighted.rotation ? `rotate(${bulkEditHighlighted.rotation}deg)` : undefined,
          }}
        />
      )}
      {overflowElements.map((el) => (
        <div
          key={`overflow-outline-${el.id}`}
          className="pointer-events-none absolute outline outline-[1.5px] outline-button-primary"
          style={{
            left: `${(el.frame.x / nativeWidth) * 100}%`,
            top: `${(el.frame.y / nativeHeight) * 100}%`,
            width: `${(el.frame.w / nativeWidth) * 100}%`,
            height: `${(el.frame.h / nativeHeight) * 100}%`,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
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
        onMouseMove={
          activeTool === 'pen'
            ? (e) => {
                setPenCursorPos({ x: e.clientX, y: e.clientY });
                // Not while `pressed` — the window-level listener handlePenMouseDown starts owns
                // `cursor` for that whole gesture (with Shift's 45° snap applied), and would
                // otherwise race this plain hover update for the same native mousemove event.
                setPenDraw((prev) => (prev && !prev.pressed ? { ...prev, cursor: nativePointFromEvent(e) } : prev));
              }
            : undefined
        }
        onMouseLeave={
          activeTool === 'pen'
            ? () => {
                setPenCursorPos(null);
                setPenDraw((prev) => (prev && !prev.pressed ? { ...prev, cursor: null } : prev));
              }
            : undefined
        }
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleAssetDrop}
        onContextMenu={(e) => {
          if (!onSceneContextMenu) return;
          e.preventDefault();
          const point = nativePointFromEvent(e);
          onSceneContextMenu(e, async () => {
            const content = await readPasteableClipboardContent();
            if (!content) return;
            if (content.kind === 'svg') importSvgAt(content.text, point);
            else addImageAt(URL.createObjectURL(content.blob), point);
          });
        }}
      >
        {active && <ImagePickerDialog open={insertImagePickerOpen} onOpenChange={setInsertImagePickerOpen} onSelect={insertNewImage} />}
        {penDraw && penDraw.joints.length > 0 && (
          <PenDrawingOverlay
            joints={penDraw.joints}
            cursor={penDraw.cursor}
            pressed={penDraw.pressed}
            closeHover={Boolean(penDraw.cursor && penDraw.joints.length >= 2 && isWithinClosePathRadius(penDraw.cursor, penDraw.joints[0], scale))}
            nativeWidth={nativeWidth}
            nativeHeight={nativeHeight}
          />
        )}
        {activeTool === 'pen' && penCursorPos && <PenToolCursor x={penCursorPos.x} y={penCursorPos.y} pressed={penDraw?.pressed ?? false} />}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.svg,image/svg+xml"
          className="hidden"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
              file.text().then((text) => importSvgAt(text, { x: nativeWidth / 2, y: nativeHeight / 2 }));
            } else {
              handleUploadFile(file);
            }
          }}
        />

        {imageElement && hasImage && (
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
                altKeyDown={altKeyDown}
                expanding={expandingElementId === imageElement.id}
                onExpandToFrameClick={handleExpandToFrameClick(imageElement)}
                isBackgroundImage={imageElement.id === backgroundElementId}
                sceneHasBackgroundColor={Boolean(layout.backgroundColor)}
                onSelect={makeOnSelect(imageElement)}
                onContextMenu={handleLayerContextMenu(imageElement.id)}
                onEnterGroup={imageElement.groupId && imageElement.groupId !== enteredGroupId ? makeOnEnterGroup(imageElement) : undefined}
                onStartAltDuplicate={startAltDuplicate}
              />
            ) : (
              // Mirrors DraggableImageElement's box exactly (frame-relative, not full-bleed) so the
              // image never appears to resize when a view-all page card activates into edit mode.
              <ImageBox
                element={imageElement}
                layoutWidth={nativeWidth}
                layoutHeight={nativeHeight}
                outlined={showsBoundsBox(imageElement.id)}
                selected={showsBoundsBox(imageElement.id)}
                scale={scale}
                expanding={expandingElementId === imageElement.id}
                onExpandToFrameClick={handleExpandToFrameClick(imageElement)}
                isBackgroundImage={imageElement.id === backgroundElementId}
                sceneHasBackgroundColor={Boolean(layout.backgroundColor)}
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

        {extraElements.map((el) => {
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
                altKeyDown={altKeyDown}
                isEditing={editingTextElementId === el.id}
                onSelect={makeOnSelect(el)}
                onStartEditing={() => setEditingTextElement(el.id)}
                onContextMenu={handleLayerContextMenu(el.id)}
                onEnterGroup={el.groupId && el.groupId !== enteredGroupId ? makeOnEnterGroup(el) : undefined}
                onStartAltDuplicate={startAltDuplicate}
              />
            );
          }

          if (el.kind === 'vector') {
            return (
              <SelectableVectorElement
                key={el.id}
                element={el}
                layoutId={layoutId}
                layoutWidth={nativeWidth}
                layoutHeight={nativeHeight}
                scale={scale}
                activeTool={activeTool}
                selected={showsBoundsBox(el.id)}
                isEditing={editingVectorElementId === el.id}
                altKeyDown={altKeyDown}
                onSelect={makeOnSelect(el)}
                onStartEditing={() => setEditingVectorElement(el.id)}
                onContextMenu={handleLayerContextMenu(el.id)}
                onEnterGroup={el.groupId && el.groupId !== enteredGroupId ? makeOnEnterGroup(el) : undefined}
                onStartAltDuplicate={startAltDuplicate}
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
                isEditing={editingVectorElementId === el.id}
                altKeyDown={altKeyDown}
                onSelect={makeOnSelect(el)}
                onConvertAndEdit={() => convertShapeToVectorAndEdit(el)}
                onEnterEllipseEdit={() => setEditingVectorElement(el.id)}
                onContextMenu={handleLayerContextMenu(el.id)}
                onEnterGroup={el.groupId && el.groupId !== enteredGroupId ? makeOnEnterGroup(el) : undefined}
                onStartAltDuplicate={startAltDuplicate}
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
                altKeyDown={altKeyDown}
                expanding={expandingElementId === el.id}
                onExpandToFrameClick={handleExpandToFrameClick(el)}
                isBackgroundImage={el.id === backgroundElementId}
                sceneHasBackgroundColor={Boolean(layout.backgroundColor)}
                onSelect={makeOnSelect(el)}
                onContextMenu={handleLayerContextMenu(el.id)}
                onEnterGroup={el.groupId && el.groupId !== enteredGroupId ? makeOnEnterGroup(el) : undefined}
                onStartAltDuplicate={startAltDuplicate}
              />
            );
          }

          return <ElementRenderer key={el.id} element={el} layoutWidth={nativeWidth} layoutHeight={nativeHeight} />;
        })}

        {active && drawRect && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: `${(drawRect.x / nativeWidth) * 100}%`,
              top: `${(drawRect.y / nativeHeight) * 100}%`,
              width: `${(drawRect.w / nativeWidth) * 100}%`,
              height: `${(drawRect.h / nativeHeight) * 100}%`,
            }}
          >
            {/* The real shape kind, live — not a generic box — so a dragged ellipse already looks
                round, an arrow already shows its head, etc., instead of only snapping into its real
                look once the drag finishes. */}
            <ElementRenderer
              element={{ id: '__shape-preview__', kind: 'shape', shape: shapeToolKind, slot: null, frame: { x: 0, y: 0, w: drawRect.w, h: drawRect.h }, style: defaultShapeStyle(shapeToolKind), visible: true }}
              layoutWidth={drawRect.w}
              layoutHeight={drawRect.h}
            />
          </div>
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
          >
            {b.padding && <PaddingHighlight padding={b.padding} gaps={b.gaps} layoutWidth={nativeWidth} />}
          </div>
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

      {/* Measurement overlay — rendered as a sibling of the clipped frame so a measurement to an element that spills past the frame's own
          bounds isn't clipped either (spec edge case 3). Purely visual: no pointer events, so it
          never swallows a click/drag happening underneath it. */}
      {measureSourceBox && (
        <div className="pointer-events-none absolute inset-0 z-[60]">
          {sourceIsSingleRotatedElement && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: `${(measureSourceBox.left / nativeWidth) * 100}%`,
                top: `${(measureSourceBox.top / nativeHeight) * 100}%`,
                width: `${(measureSourceBox.width / nativeWidth) * 100}%`,
                height: `${(measureSourceBox.height / nativeHeight) * 100}%`,
                border: `1px solid ${MEASURE_COLOR}`,
              }}
            />
          )}
          {measureTarget?.kind === 'box' && (
            // Always axis-aligned, even when the target itself is rotated — this traces
            // `measureTarget.box`, the same rotated *bounding* box the distance math itself uses
            // (per spec: "use the visual bounding box... if rotation is supported"), touching the
            // rotated shape's own extremes rather than tilting to match its edges.
            <div
              className="pointer-events-none absolute"
              style={{
                left: `${(measureTarget.box.left / nativeWidth) * 100}%`,
                top: `${(measureTarget.box.top / nativeHeight) * 100}%`,
                width: `${(measureTarget.box.width / nativeWidth) * 100}%`,
                height: `${(measureTarget.box.height / nativeHeight) * 100}%`,
                border: `1px solid ${MEASURE_COLOR}`,
              }}
            />
          )}
          {measureLines.map((ln) => (
            <MeasureLineSegment key={ln.id} line={ln} nativeWidth={nativeWidth} nativeHeight={nativeHeight} />
          ))}
          {/* Positions come from `measurePillPositions` (screen-space, collision-resolved), not
              straight off each line's own midpoint — so a pill that would overlap another gets
              nudged clear of it instead of stacking illegibly. */}
          {measurePillTexts.map((p) => {
            const resolved = measurePillPositions.get(p.id)!;
            return <MeasurePill key={p.id} x={resolved.x / scale} y={resolved.y / scale} nativeWidth={nativeWidth} nativeHeight={nativeHeight} value={p.text} background={p.background} />;
          })}
        </div>
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

/**
 * Memoized: on a canvas with many sizes, a drag on one banner otherwise re-renders every banner's
 * frame on each mouse move. A banner whose own `layout` object (and other props) didn't change
 * skips re-rendering — the store keeps an untouched layout's object identity across updates. Its
 * own store subscriptions still re-render it whenever something it reads changes.
 */
export const ArtboardFrame = memo(ArtboardFrameImpl);
