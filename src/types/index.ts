// Core data model — see auto-layout-prototype-brief-v3.md § Data model.
// `rules-engine`, `adapt-engine`, `size-class`, `size-templates` consume these
// types but stay React-free.

export type SlotKind = 'image' | 'headline' | 'subMessage' | 'price' | 'cta' | 'badge';
export type SizeClass = 'wide' | 'landscape' | 'square' | 'portrait' | 'tall';

export type Rule =
  | { type: 'safeMargin'; px: number }
  | { type: 'maxChars'; slot: SlotKind; max: number }
  | { type: 'minFontSize'; slot: SlotKind; px: number }
  | { type: 'maxTextCoverage'; pct: number }
  | { type: 'requiredSlot'; slot: SlotKind }
  | { type: 'reservedZone'; edge: 'top' | 'bottom' | 'left' | 'right'; px: number; label: string };

export type SizePreset = {
  id: string;
  platformId: string;
  label: string;
  width: number;
  height: number;
  required: boolean;
  ruleSetId: string;
};

export type RuleSet = { id: string; name: string; rules: Rule[] };

export type Platform = { id: string; name: string; presetIds: string[]; maxFileSizeMb: number };

export type Product = {
  id: string;
  name: string;
  imageUrl: string;
  focalPoint: { x: number; y: number };
  headline: string;
  subMessage?: string;
  price?: string;
  ctaLabel: string;
  badge?: string;
};

export type ElementKind = 'image' | 'text' | 'shape' | 'vector';
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'polygon';

/** See the SVG import/edit spec's Part 4 "Joint data model" — `'sharp'` is a corner joint (no
 * handles); `'mirror'`/`'nomirror'` only have real meaning once a joint actually has handles, and
 * decide how dragging one handle moves the other (exactly opposite + matching length, vs. untouched). */
export type MirrorMode = 'sharp' | 'mirror' | 'nomirror';

/**
 * One vertex of a `VectorPath`, in local coordinates relative to the element's own `frame` (0..
 * frame.w, 0..frame.h). `handleIn`/`handleOut` are themselves absolute points in that same space
 * (not offsets from `x`/`y`) — directly usable as a cubic bezier control point, per "Model → path"
 * below. `null` means no handle on that side: a joint with both null is a plain corner; a path
 * command's own endpoint becomes a joint, never a control point (control points become handles).
 */
export type Joint = {
  x: number;
  y: number;
  handleIn: { x: number; y: number } | null;
  handleOut: { x: number; y: number } | null;
  mirror: MirrorMode;
};

/**
 * A vector path's geometry, as contours of joints (bezier curves and corners alike) — see the SVG
 * import/edit spec's Part 4. The segment from joint A to joint B is a straight `L` when both
 * `A.handleOut` and `B.handleIn` are null, otherwise a cubic `C` with control points
 * `A.handleOut ?? A` and `B.handleIn ?? B` (see `jointsToPathD` in `vector-path.ts`, which is the one
 * and only place that turns this model into a real SVG `d` string — never hand-edit path commands
 * directly, always go through the joint model so every consumer stays in sync).
 */
export type VectorPath = { joints: Joint[]; closed: boolean };

export type ShadowStyle = { enabled: boolean; x: number; y: number; blur: number; color: string; opacity: number };

/**
 * Text only — padding (layout px) inside the text box, plus whether each axis still hugs its
 * content. With a hug flag off, that axis is frozen at `frame.w`/`frame.h` instead of being
 * re-measured, and a fixed width wraps the text onto new lines.
 */
export type TextAutoLayout = {
  padding: { top: number; right: number; bottom: number; left: number };
  hugWidth: boolean;
  hugHeight: boolean;
};

/**
 * A layer group's layout — `padding` around its members, plus (with a `direction` other than
 * 'none') Auto Layout stacking them in a column or row `gap` px apart. Copied onto every member of
 * the group (groups have no record of their own), so it travels with them through duplicate/copy/
 * cascade like any other element field. `x`/`y` is a stacked group's box top-left corner; with
 * 'none' the members move freely and the box just follows them.
 */
export type GroupAutoLayout = {
  x: number;
  y: number;
  direction: 'none' | 'vertical' | 'horizontal';
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
};

export type LayoutElement = {
  id: string;
  kind: ElementKind;
  slot: SlotKind | null; // null = decorative, adapts by relative position only
  shape?: ShapeKind; // when kind === 'shape'
  content?: string; // text content
  imageUrl?: string; // when kind === 'image'
  focalPoint?: { x: number; y: number };
  /**
   * Vector only — the path's own geometry. `style.fill`/`strokeColor`/`strokeWidth`/`strokeStyle`
   * (the same fields a shape uses) paint it.
   */
  path?: VectorPath;
  /**
   * SVG-import-derived display name (the source element's id/title, or a numbered default like
   * "Vector 2" per the import spec's numbering rules) — every other layer kind still derives its
   * name from `kind`/`slot` via `layerName()`, since nothing else has a real name field yet.
   */
  name?: string;
  frame: { x: number; y: number; w: number; h: number }; // absolute px in layout space
  /**
   * Image only: briefly holds the target box while an "expand to frame" commit is animating (see
   * ArtboardFrame's `handleExpandToFrameClick`) — set immediately, then cleared once `frame` itself
   * is updated to match, a couple seconds later.
   */
  pendingExpand?: { x: number; y: number; w: number; h: number };
  /**
   * Image only: true once this element's frame has, at some point, fully covered the scene — set
   * automatically by `updateElement` whenever a frame update reaches full coverage, and never
   * cleared afterward. Gates the automatic frame-gap grid/expand affordance, so a freshly placed
   * image (which starts smaller than the frame by default) doesn't show it before the image has
   * actually been full-bleed at least once.
   */
  hasCoveredFrame?: boolean;
  style: {
    fontSize?: number;
    color?: string;
    fontFamily?: string;
    fill?: string;
    radius?: number;
    fontWeight?: number;
    align?: string;
    strokeColor?: string;
    strokeWidth?: number;
    strokeStyle?: 'solid' | 'dashed' | 'dotted';
    /** Where the stroke sits relative to the layer's own edge — stored per-element like every
     * other style field, but (same as `boxVerticalAlign`) not yet wired into the renderer: CSS
     * `border`/`text-stroke` only ever draw centered on the edge, so inside/outside would need
     * their own layout trick (e.g. an extra wrapping box) to actually render differently. */
    strokePosition?: 'center' | 'inside' | 'outside';
    letterSpacing?: number;
    /** Horizontal text scale, in percent offset from 100 (0 = normal, e.g. 20 = 120% width). */
    stretch?: number;
    /**
     * Text only — a one-off Spacing/Stretch value applied to just this plain-text character range
     * of `content` (start/end offsets), set when the value is changed while a partial substring was
     * highlighted rather than the whole layer. Lets the Spacing/Stretch panel fields detect and show
     * a "Mixed" state once editing ends, without a full per-character rich-text model — the rest of
     * `content` keeps using the plain `letterSpacing`/`stretch` above.
     */
    letterSpacingRange?: { start: number; end: number; value: number };
    stretchRange?: { start: number; end: number; value: number };
    lineHeight?: number;
    textDecoration?: 'none' | 'underline' | 'line-through';
    /** Text only — the "Style" row's own Italic toggle in the decoration popover. */
    fontStyle?: 'normal' | 'italic';
    /** Text only — the decoration popover's "Case" row. */
    textTransform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase';
    /** Text only — the decoration popover's "Features" row (superscript/subscript). Not to be
     * confused with `boxVerticalAlign` below — this one shifts a run's own baseline, it has
     * nothing to do with where the text box's content sits within its own box. */
    verticalAlign?: 'baseline' | 'super' | 'sub';
    /** Text only — the Typography section's own vertical-align row (top/middle/bottom), for
     * whenever the box is taller than its content (Auto Layout with height hugging turned off).
     * Stored per-element like every other style field, but — same as `PositionSection`'s anchor
     * controls — not yet wired into the renderer; defaults to the existing always-top behavior. */
    boxVerticalAlign?: 'top' | 'middle' | 'bottom';
    /** Shape/image only, 0-100. */
    opacity?: number;
    /** Shape only, `shape === 'polygon'` — how many sides the regular polygon has (3 when unset,
     * matching the toolbar's own default triangle). The same "Count" field also edits a converted
     * `vector` element's own `path.joints.length` directly, which needs no field here — see
     * `regularPolygonPoints` in vector-path.ts. */
    polygonSides?: number;
    /** Text only — 'vertical-rl' stacks characters top-to-bottom (traditional Japanese layout). */
    writingMode?: 'horizontal-tb' | 'vertical-rl';
    dropShadow?: ShadowStyle;
    /** Image/shape only — CSS `inset` shadows have no text equivalent, so this is a no-op on text. */
    innerShadow?: ShadowStyle;
    /** Text only — the panel's "Auto Layout" section; present means it's turned on. */
    autoLayout?: TextAutoLayout;
  };
  visible: boolean;
  locked?: boolean;
  /** Image only: mirrors the image horizontally/vertically in place (frame is unaffected). */
  flipX?: boolean;
  flipY?: boolean;
  /** Degrees, clockwise, pivoting around the frame's own center. Set by dragging just outside a
   * selected element's corner handle (see SelectionBoundingBox's rotate zone). */
  rotation?: number;
  overridden?: Partial<Record<'frame' | 'style' | 'visible' | 'focalPoint', true>>;
  /** Elements sharing this id (within the same layout) act as one unit — selecting/moving/locking/
   * flipping/reordering/deleting any one of them does the same to every other member. Set by the
   * "Group layers" layer-context-menu action, cleared by "Ungroup" — or, for an SVG-imported <g>,
   * assigned at import time (see `Layout.groupMeta`, and svg-import.ts's own doc comment). */
  groupId?: string;
  /** Set (identically) on every member of a group whose Auto Layout is on — see GroupAutoLayout. */
  groupLayout?: GroupAutoLayout;
};

/**
 * A group's own record, keyed by its `groupId` — only exists for a group that needs more than the
 * flat `groupId` tag on its members can express: a real name, and (via `parentGroupId`) nesting
 * inside another group. A plain "Group layers"-made group has no entry here at all and just shows
 * the layer panel's generic "Group"/"Layout group" label, exactly as before this existed. Populated
 * by SVG import (see svg-import.ts's own doc comment for the structure rules this implements).
 */
export type GroupMeta = {
  name?: string;
  parentGroupId?: string;
};

export type Layout = {
  id: string;
  setId: string;
  productId: string;
  size: { width: number; height: number; presetId?: string; label: string };
  sizeClass: SizeClass;
  ruleSetId: string;
  elements: LayoutElement[];
  /** See `GroupMeta`. Keyed by `groupId` — only groups that need a name and/or nesting appear here. */
  groupMeta?: Record<string, GroupMeta>;
  isSource: boolean;
  detached: boolean;
  adaptationNotes: string[];
  /** The frame's own background/border — independent of any element on it. */
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  radius?: number;
  /** Hides the scene from export — purely a stored flag, doesn't affect canvas rendering. */
  hidden?: boolean;
  /** User-drawn "scene focus" — absolute px in layout space, kept unaffected by ratio-adaptation. */
  focusRect?: { x: number; y: number; w: number; h: number };
};

// A saved template is a Layout with placeholder content and no set
export type SavedTemplate = {
  id: string;
  name: string;
  category: 'productHero' | 'salePromo' | 'multiProduct' | 'textLed';
  platformId?: string;
  layout: Omit<Layout, 'setId' | 'productId' | 'isSource' | 'detached'>;
  thumbnailFrom: 'render'; // rendered live, not a static image
};

export type BannerSet = {
  id: string;
  name: string;
  sourceLayoutId: string;
  layoutIds: string[];
  productIds: string[];
};

export type Violation = {
  id: string;
  elementId: string;
  ruleType: Rule['type'];
  severity: 'warning';
  message: string;
};
